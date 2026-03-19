begin;

create table if not exists ops.outbox_events (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  shift_id uuid null references ops.shifts(id) on delete set null,
  stream_name text not null default 'ops',
  event_type text not null,
  scope_codes text[] not null default '{}'::text[],
  entity_type text null,
  entity_id text null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  available_at timestamptz not null default now(),
  claimed_at timestamptz null,
  claim_token uuid null,
  publish_attempts integer not null default 0,
  published_at timestamptz null,
  last_error text null,
  dead_lettered_at timestamptz null,
  dead_letter_reason text null,
  created_at timestamptz not null default now()
);

create index if not exists outbox_events_pending_idx
  on ops.outbox_events (available_at asc, created_at asc)
  where published_at is null and dead_lettered_at is null;

create index if not exists outbox_events_cafe_created_idx
  on ops.outbox_events (cafe_id, created_at desc);

create index if not exists outbox_events_claim_idx
  on ops.outbox_events (claim_token)
  where claim_token is not null;

alter table ops.outbox_events enable row level security;

drop policy if exists cafe_access_policy on ops.outbox_events;
create policy cafe_access_policy on ops.outbox_events
for all
using (app.can_access_cafe(cafe_id))
with check (app.can_access_cafe(cafe_id));

grant select, insert, update, delete on ops.outbox_events to authenticated, service_role;

create or replace function public.ops_stage_outbox_event(
  p_cafe_id uuid,
  p_shift_id uuid default null,
  p_event_type text default null,
  p_entity_id text default null,
  p_payload jsonb default '{}'::jsonb,
  p_scope_codes text[] default null,
  p_stream_name text default 'ops'
)
returns uuid
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_event_id uuid;
  v_type text;
  v_stream text;
begin
  if p_cafe_id is null then
    raise exception 'p_cafe_id is required';
  end if;

  v_type := nullif(btrim(coalesce(p_event_type, '')), '');
  if v_type is null then
    raise exception 'p_event_type is required';
  end if;

  v_stream := nullif(btrim(coalesce(p_stream_name, '')), '');
  if v_stream is null then
    v_stream := 'ops';
  end if;

  insert into ops.outbox_events (
    cafe_id,
    shift_id,
    stream_name,
    event_type,
    scope_codes,
    entity_id,
    payload,
    occurred_at,
    available_at,
    created_at
  )
  values (
    p_cafe_id,
    p_shift_id,
    v_stream,
    v_type,
    coalesce(p_scope_codes, '{}'::text[]),
    nullif(btrim(coalesce(p_entity_id, '')), ''),
    coalesce(p_payload, '{}'::jsonb),
    now(),
    now(),
    now()
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

grant execute on function public.ops_stage_outbox_event(uuid, uuid, text, text, jsonb, text[], text) to authenticated, service_role;

create or replace function public.ops_claim_outbox_events(
  p_limit integer default 100,
  p_claim_token uuid default null,
  p_cafe_id uuid default null
)
returns table (
  id uuid,
  cafe_id uuid,
  shift_id uuid,
  stream_name text,
  event_type text,
  scope_codes text[],
  entity_id text,
  payload jsonb,
  occurred_at timestamptz,
  publish_attempts integer
)
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_limit integer := greatest(least(coalesce(p_limit, 100), 500), 1);
  v_claim_token uuid := coalesce(p_claim_token, gen_random_uuid());
begin
  return query
  with next_rows as (
    select e.id
    from ops.outbox_events e
    where e.published_at is null
      and e.dead_lettered_at is null
      and e.available_at <= now()
      and (e.claimed_at is null or e.claimed_at < now() - interval '5 minutes')
      and (p_cafe_id is null or e.cafe_id = p_cafe_id)
    order by e.created_at asc
    for update skip locked
    limit v_limit
  )
  update ops.outbox_events e
  set claim_token = v_claim_token,
      claimed_at = now(),
      publish_attempts = e.publish_attempts + 1,
      last_error = null
  from next_rows
  where e.id = next_rows.id
  returning e.id, e.cafe_id, e.shift_id, e.stream_name, e.event_type, e.scope_codes, e.entity_id, e.payload, e.occurred_at, e.publish_attempts;
end;
$$;

grant execute on function public.ops_claim_outbox_events(integer, uuid, uuid) to service_role;

create or replace function public.ops_mark_outbox_events_published(
  p_ids uuid[],
  p_claim_token uuid
)
returns integer
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_count integer := 0;
begin
  if p_claim_token is null then
    raise exception 'p_claim_token is required';
  end if;

  if coalesce(array_length(p_ids, 1), 0) = 0 then
    return 0;
  end if;

  update ops.outbox_events
  set published_at = now(),
      claim_token = null,
      claimed_at = null,
      last_error = null
  where id = any(p_ids)
    and claim_token = p_claim_token;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.ops_mark_outbox_events_published(uuid[], uuid) to service_role;

create or replace function public.ops_mark_outbox_events_failed(
  p_ids uuid[],
  p_claim_token uuid,
  p_error text,
  p_retry_after_seconds integer default 15,
  p_max_attempts integer default 20
)
returns table (id uuid, dead_lettered boolean)
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_retry_after interval := make_interval(secs => greatest(coalesce(p_retry_after_seconds, 15), 1));
  v_max_attempts integer := greatest(coalesce(p_max_attempts, 20), 1);
  v_error text := left(coalesce(nullif(btrim(coalesce(p_error, '')), ''), 'OUTBOX_PUBLISH_FAILED'), 4000);
begin
  if p_claim_token is null then
    raise exception 'p_claim_token is required';
  end if;

  if coalesce(array_length(p_ids, 1), 0) = 0 then
    return;
  end if;

  return query
  update ops.outbox_events e
  set claim_token = null,
      claimed_at = null,
      available_at = case when e.publish_attempts >= v_max_attempts then e.available_at else now() + v_retry_after end,
      last_error = v_error,
      dead_lettered_at = case when e.publish_attempts >= v_max_attempts then now() else null end,
      dead_letter_reason = case when e.publish_attempts >= v_max_attempts then v_error else null end
  where e.id = any(p_ids)
    and e.claim_token = p_claim_token
  returning e.id, (e.publish_attempts >= v_max_attempts) as dead_lettered;
end;
$$;

grant execute on function public.ops_mark_outbox_events_failed(uuid[], uuid, text, integer, integer) to service_role;

create or replace function public.ops_reap_outbox_events(
  p_published_older_than_hours integer default 72,
  p_dead_lettered_older_than_hours integer default 168,
  p_limit integer default 5000
)
returns integer
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_limit integer := greatest(least(coalesce(p_limit, 5000), 20000), 1);
  v_count integer := 0;
begin
  with doomed as (
    select id
    from ops.outbox_events e
    where (e.published_at is not null and e.published_at < now() - make_interval(hours => greatest(coalesce(p_published_older_than_hours, 72), 1)))
       or (e.dead_lettered_at is not null and e.dead_lettered_at < now() - make_interval(hours => greatest(coalesce(p_dead_lettered_older_than_hours, 168), 1)))
    order by coalesce(e.published_at, e.dead_lettered_at) asc nulls last, e.created_at asc
    limit v_limit
  )
  delete from ops.outbox_events e
  using doomed
  where e.id = doomed.id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.ops_reap_outbox_events(integer, integer, integer) to service_role;

create or replace function public.ops_open_or_resume_service_session_with_outbox(
  p_cafe_id uuid,
  p_shift_id uuid,
  p_session_label text default null,
  p_staff_member_id uuid default null,
  p_owner_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_result jsonb;
  v_event_id uuid;
  v_reused boolean;
begin
  v_result := public.ops_open_or_resume_service_session(
    p_cafe_id,
    p_shift_id,
    p_session_label,
    p_staff_member_id,
    p_owner_user_id
  );

  v_reused := coalesce((v_result ->> 'reused')::boolean, false);
  v_event_id := public.ops_stage_outbox_event(
    p_cafe_id,
    p_shift_id,
    case when v_reused then 'session.resumed' else 'session.opened' end,
    v_result ->> 'service_session_id',
    jsonb_build_object('label', v_result ->> 'session_label', 'reused', v_reused),
    array['waiter', 'billing', 'dashboard', 'nav-summary'],
    'ops'
  );

  return v_result || jsonb_build_object('outbox_event_id', v_event_id);
end;
$$;

grant execute on function public.ops_open_or_resume_service_session_with_outbox(uuid, uuid, text, uuid, uuid) to authenticated, service_role;

create or replace function public.ops_create_order_with_items_with_outbox(
  p_cafe_id uuid,
  p_shift_id uuid,
  p_service_session_id uuid default null,
  p_session_label text default null,
  p_created_by_staff_id uuid default null,
  p_created_by_owner_id uuid default null,
  p_items jsonb default '[]'::jsonb,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_result jsonb;
  v_event_id uuid;
begin
  v_result := public.ops_create_order_with_items(
    p_cafe_id,
    p_shift_id,
    p_service_session_id,
    p_session_label,
    p_created_by_staff_id,
    p_created_by_owner_id,
    p_items,
    p_notes
  );

  v_event_id := public.ops_stage_outbox_event(
    p_cafe_id,
    p_shift_id,
    'order.submitted',
    v_result ->> 'order_id',
    jsonb_build_object(
      'serviceSessionId', v_result ->> 'service_session_id',
      'sessionLabel', v_result ->> 'session_label',
      'itemsCount', coalesce((v_result ->> 'items_count')::integer, 0),
      'status', v_result ->> 'status'
    ),
    array['waiter', 'barista', 'shisha', 'dashboard', 'nav-summary'],
    'ops'
  );

  return v_result || jsonb_build_object('outbox_event_id', v_event_id);
end;
$$;

grant execute on function public.ops_create_order_with_items_with_outbox(uuid, uuid, uuid, text, uuid, uuid, jsonb, text) to authenticated, service_role;

create or replace function public.ops_mark_partial_ready_with_outbox(
  p_cafe_id uuid,
  p_order_item_id uuid,
  p_quantity integer,
  p_by_staff_id uuid default null,
  p_by_owner_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_result jsonb;
  v_item ops.order_items%rowtype;
  v_event_id uuid;
begin
  v_result := public.ops_mark_partial_ready(
    p_cafe_id,
    p_order_item_id,
    p_quantity,
    p_by_staff_id,
    p_by_owner_id,
    p_notes
  );

  select * into v_item
  from ops.order_items
  where cafe_id = p_cafe_id and id = p_order_item_id;

  v_event_id := public.ops_stage_outbox_event(
    p_cafe_id,
    v_item.shift_id,
    'station.partial_ready',
    v_item.id::text,
    jsonb_build_object(
      'quantity', p_quantity,
      'stationCode', v_item.station_code,
      'serviceSessionId', v_item.service_session_id
    ),
    array['waiter', 'barista', 'shisha', 'dashboard', 'nav-summary'],
    'ops'
  );

  return v_result || jsonb_build_object('outbox_event_id', v_event_id);
end;
$$;

grant execute on function public.ops_mark_partial_ready_with_outbox(uuid, uuid, integer, uuid, uuid, text) to authenticated, service_role;

create or replace function public.ops_mark_ready_with_outbox(
  p_cafe_id uuid,
  p_order_item_id uuid,
  p_quantity integer,
  p_by_staff_id uuid default null,
  p_by_owner_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_result jsonb;
  v_item ops.order_items%rowtype;
  v_event_id uuid;
begin
  v_result := public.ops_mark_ready(
    p_cafe_id,
    p_order_item_id,
    p_quantity,
    p_by_staff_id,
    p_by_owner_id,
    p_notes
  );

  select * into v_item
  from ops.order_items
  where cafe_id = p_cafe_id and id = p_order_item_id;

  v_event_id := public.ops_stage_outbox_event(
    p_cafe_id,
    v_item.shift_id,
    'station.ready',
    v_item.id::text,
    jsonb_build_object(
      'quantity', p_quantity,
      'stationCode', v_item.station_code,
      'serviceSessionId', v_item.service_session_id
    ),
    array['waiter', 'barista', 'shisha', 'dashboard', 'nav-summary'],
    'ops'
  );

  return v_result || jsonb_build_object('outbox_event_id', v_event_id);
end;
$$;

grant execute on function public.ops_mark_ready_with_outbox(uuid, uuid, integer, uuid, uuid, text) to authenticated, service_role;

create or replace function public.ops_request_remake_with_outbox(
  p_cafe_id uuid,
  p_order_item_id uuid,
  p_quantity integer,
  p_by_staff_id uuid default null,
  p_by_owner_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_result jsonb;
  v_item ops.order_items%rowtype;
  v_event_id uuid;
begin
  v_result := public.ops_request_remake(
    p_cafe_id,
    p_order_item_id,
    p_quantity,
    p_by_staff_id,
    p_by_owner_id,
    p_notes
  );

  select * into v_item
  from ops.order_items
  where cafe_id = p_cafe_id and id = p_order_item_id;

  v_event_id := public.ops_stage_outbox_event(
    p_cafe_id,
    v_item.shift_id,
    'station.remake_requested',
    v_item.id::text,
    jsonb_build_object(
      'quantity', p_quantity,
      'stationCode', v_item.station_code,
      'serviceSessionId', v_item.service_session_id
    ),
    array['waiter', 'barista', 'shisha', 'billing', 'dashboard', 'nav-summary', 'complaints'],
    'ops'
  );

  return v_result || jsonb_build_object('outbox_event_id', v_event_id);
end;
$$;

grant execute on function public.ops_request_remake_with_outbox(uuid, uuid, integer, uuid, uuid, text) to authenticated, service_role;

create or replace function public.ops_deliver_available_quantities_with_outbox(
  p_cafe_id uuid,
  p_order_item_id uuid,
  p_quantity integer,
  p_by_staff_id uuid default null,
  p_by_owner_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_result jsonb;
  v_item ops.order_items%rowtype;
  v_event_id uuid;
begin
  v_result := public.ops_deliver_available_quantities(
    p_cafe_id,
    p_order_item_id,
    p_quantity,
    p_by_staff_id,
    p_by_owner_id,
    p_notes
  );

  select * into v_item
  from ops.order_items
  where cafe_id = p_cafe_id and id = p_order_item_id;

  v_event_id := public.ops_stage_outbox_event(
    p_cafe_id,
    v_item.shift_id,
    'delivery.delivered',
    v_item.id::text,
    jsonb_build_object(
      'quantity', coalesce((v_result ->> 'quantity')::integer, p_quantity),
      'deliveredQty', coalesce((v_result ->> 'delivered_qty')::integer, 0),
      'replacementDeliveredQty', coalesce((v_result ->> 'replacement_delivered_qty')::integer, 0),
      'serviceSessionId', v_item.service_session_id
    ),
    array['waiter', 'barista', 'shisha', 'billing', 'dashboard', 'nav-summary'],
    'ops'
  );

  return v_result || jsonb_build_object('outbox_event_id', v_event_id);
end;
$$;

grant execute on function public.ops_deliver_available_quantities_with_outbox(uuid, uuid, integer, uuid, uuid, text) to authenticated, service_role;

create or replace function public.ops_settle_selected_quantities_with_outbox(
  p_cafe_id uuid,
  p_shift_id uuid,
  p_service_session_id uuid,
  p_lines jsonb,
  p_by_staff_id uuid default null,
  p_by_owner_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_result jsonb;
  v_event_id uuid;
begin
  v_result := public.ops_settle_selected_quantities(
    p_cafe_id,
    p_shift_id,
    p_service_session_id,
    p_lines,
    p_by_staff_id,
    p_by_owner_id,
    p_notes
  );

  v_event_id := public.ops_stage_outbox_event(
    p_cafe_id,
    p_shift_id,
    'billing.settled',
    v_result ->> 'payment_id',
    jsonb_build_object(
      'serviceSessionId', p_service_session_id,
      'totalAmount', coalesce((v_result ->> 'total_amount')::numeric, 0),
      'totalQuantity', coalesce((v_result ->> 'total_quantity')::integer, 0)
    ),
    array['waiter', 'billing', 'dashboard', 'nav-summary'],
    'ops'
  );

  return v_result || jsonb_build_object('outbox_event_id', v_event_id);
end;
$$;

grant execute on function public.ops_settle_selected_quantities_with_outbox(uuid, uuid, uuid, jsonb, uuid, uuid, text) to authenticated, service_role;

create or replace function public.ops_defer_selected_quantities_with_outbox(
  p_cafe_id uuid,
  p_shift_id uuid,
  p_service_session_id uuid,
  p_debtor_name text,
  p_lines jsonb,
  p_by_staff_id uuid default null,
  p_by_owner_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_result jsonb;
  v_event_id uuid;
begin
  v_result := public.ops_defer_selected_quantities(
    p_cafe_id,
    p_shift_id,
    p_service_session_id,
    p_debtor_name,
    p_lines,
    p_by_staff_id,
    p_by_owner_id,
    p_notes
  );

  v_event_id := public.ops_stage_outbox_event(
    p_cafe_id,
    p_shift_id,
    'billing.deferred',
    v_result ->> 'payment_id',
    jsonb_build_object(
      'serviceSessionId', p_service_session_id,
      'debtorName', coalesce(v_result ->> 'debtor_name', p_debtor_name),
      'totalAmount', coalesce((v_result ->> 'total_amount')::numeric, 0),
      'totalQuantity', coalesce((v_result ->> 'total_quantity')::integer, 0)
    ),
    array['waiter', 'billing', 'dashboard', 'nav-summary', 'deferred'],
    'ops'
  );

  return v_result || jsonb_build_object('outbox_event_id', v_event_id);
end;
$$;

grant execute on function public.ops_defer_selected_quantities_with_outbox(uuid, uuid, uuid, text, jsonb, uuid, uuid, text) to authenticated, service_role;

create or replace function public.ops_record_repayment_with_outbox(
  p_cafe_id uuid,
  p_shift_id uuid,
  p_debtor_name text,
  p_amount numeric,
  p_by_staff_id uuid default null,
  p_by_owner_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_result jsonb;
  v_event_id uuid;
begin
  v_result := public.ops_record_repayment(
    p_cafe_id,
    p_shift_id,
    p_debtor_name,
    p_amount,
    p_by_staff_id,
    p_by_owner_id,
    p_notes
  );

  v_event_id := public.ops_stage_outbox_event(
    p_cafe_id,
    p_shift_id,
    'deferred.repaid',
    v_result ->> 'payment_id',
    jsonb_build_object(
      'debtorName', coalesce(v_result ->> 'debtor_name', p_debtor_name),
      'amount', coalesce((v_result ->> 'repayment_amount')::numeric, p_amount),
      'notes', p_notes,
      'balanceAfter', coalesce((v_result ->> 'balance_after')::numeric, 0)
    ),
    array['billing', 'deferred', 'dashboard', 'nav-summary'],
    'ops'
  );

  return v_result || jsonb_build_object('outbox_event_id', v_event_id);
end;
$$;

grant execute on function public.ops_record_repayment_with_outbox(uuid, uuid, text, numeric, uuid, uuid, text) to authenticated, service_role;

create or replace function public.ops_close_service_session_with_outbox(
  p_cafe_id uuid,
  p_service_session_id uuid,
  p_by_staff_id uuid default null,
  p_by_owner_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_result jsonb;
  v_event_id uuid;
begin
  v_result := public.ops_close_service_session(
    p_cafe_id,
    p_service_session_id,
    p_by_staff_id,
    p_by_owner_id,
    p_notes
  );

  v_event_id := public.ops_stage_outbox_event(
    p_cafe_id,
    null,
    'session.closed',
    p_service_session_id::text,
    jsonb_build_object('serviceSessionId', p_service_session_id, 'status', v_result ->> 'status'),
    array['waiter', 'billing', 'dashboard', 'nav-summary'],
    'ops'
  );

  return v_result || jsonb_build_object('outbox_event_id', v_event_id);
end;
$$;

grant execute on function public.ops_close_service_session_with_outbox(uuid, uuid, uuid, uuid, text) to authenticated, service_role;

create or replace function public.ops_add_deferred_debt_with_outbox(
  p_cafe_id uuid,
  p_shift_id uuid,
  p_debtor_name text,
  p_amount numeric,
  p_by_staff_id uuid default null,
  p_by_owner_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_entry_id uuid;
  v_name text;
  v_event_id uuid;
begin
  v_name := nullif(btrim(coalesce(p_debtor_name, '')), '');
  if p_cafe_id is null then
    raise exception 'p_cafe_id is required';
  end if;
  if p_shift_id is null then
    raise exception 'p_shift_id is required';
  end if;
  if v_name is null then
    raise exception 'p_debtor_name is required';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'p_amount must be greater than zero';
  end if;
  if (p_by_staff_id is null and p_by_owner_id is null)
     or (p_by_staff_id is not null and p_by_owner_id is not null) then
    raise exception 'Exactly one actor is required';
  end if;

  insert into ops.deferred_ledger_entries (
    cafe_id,
    shift_id,
    debtor_name,
    entry_kind,
    amount,
    notes,
    by_staff_id,
    by_owner_id
  ) values (
    p_cafe_id,
    p_shift_id,
    v_name,
    'debt',
    p_amount,
    p_notes,
    p_by_staff_id,
    p_by_owner_id
  ) returning id into v_entry_id;

  v_event_id := public.ops_stage_outbox_event(
    p_cafe_id,
    p_shift_id,
    'deferred.debt_added',
    v_entry_id::text,
    jsonb_build_object('debtorName', v_name, 'amount', p_amount, 'notes', p_notes),
    array['billing', 'deferred', 'dashboard', 'nav-summary'],
    'ops'
  );

  return jsonb_build_object(
    'ok', true,
    'entry_id', v_entry_id,
    'outbox_event_id', v_event_id
  );
end;
$$;

grant execute on function public.ops_add_deferred_debt_with_outbox(uuid, uuid, text, numeric, uuid, uuid, text) to authenticated, service_role;

commit;
