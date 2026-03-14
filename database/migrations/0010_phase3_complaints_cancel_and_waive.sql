begin;

alter table ops.order_items
  add column if not exists qty_waived integer not null default 0;

alter table ops.order_items
  drop constraint if exists ck_order_items_progress;

alter table ops.order_items
  add constraint ck_order_items_progress
  check (
    qty_submitted <= qty_total
    and qty_ready <= qty_submitted + qty_remade
    and qty_delivered <= qty_ready
    and qty_replacement_delivered <= qty_ready
    and qty_replacement_delivered <= qty_remade
    and qty_paid + qty_deferred + qty_waived <= qty_delivered
    and qty_cancelled <= qty_total
  );

alter table ops.fulfillment_events
  drop constraint if exists fulfillment_events_event_code_check;

alter table ops.fulfillment_events
  add constraint fulfillment_events_event_code_check
  check (
    event_code in (
      'submitted',
      'partial_ready',
      'ready',
      'delivered',
      'remake_requested',
      'remake_submitted',
      'remake_delivered',
      'cancelled',
      'waived'
    )
  );

create table if not exists ops.complaints (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  shift_id uuid not null,
  service_session_id uuid not null,
  order_item_id uuid,
  station_code text check (station_code in ('barista', 'shisha', 'service')),
  complaint_kind text not null check (complaint_kind in ('quality_issue', 'wrong_item', 'delay', 'billing_issue', 'other')),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolution_kind text check (resolution_kind in ('remake', 'cancel_undelivered', 'waive_delivered', 'dismissed')),
  requested_quantity integer check (requested_quantity is null or requested_quantity > 0),
  resolved_quantity integer check (resolved_quantity is null or resolved_quantity > 0),
  notes text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_by_staff_id uuid,
  created_by_owner_id uuid,
  resolved_by_staff_id uuid,
  resolved_by_owner_id uuid,
  unique (cafe_id, id),
  constraint fk_complaints_shift
    foreign key (cafe_id, shift_id)
    references ops.shifts(cafe_id, id)
    on delete cascade,
  constraint fk_complaints_session
    foreign key (cafe_id, service_session_id)
    references ops.service_sessions(cafe_id, id)
    on delete cascade,
  constraint fk_complaints_item
    foreign key (cafe_id, order_item_id)
    references ops.order_items(cafe_id, id)
    on delete set null,
  constraint fk_complaints_created_staff
    foreign key (cafe_id, created_by_staff_id)
    references ops.staff_members(cafe_id, id)
    on delete set null,
  constraint fk_complaints_created_owner
    foreign key (cafe_id, created_by_owner_id)
    references ops.owner_users(cafe_id, id)
    on delete set null,
  constraint fk_complaints_resolved_staff
    foreign key (cafe_id, resolved_by_staff_id)
    references ops.staff_members(cafe_id, id)
    on delete set null,
  constraint fk_complaints_resolved_owner
    foreign key (cafe_id, resolved_by_owner_id)
    references ops.owner_users(cafe_id, id)
    on delete set null,
  constraint ck_complaints_created_actor
    check (
      (created_by_staff_id is not null and created_by_owner_id is null)
      or
      (created_by_staff_id is null and created_by_owner_id is not null)
    ),
  constraint ck_complaints_resolved_actor
    check (
      (resolved_by_staff_id is null and resolved_by_owner_id is null)
      or
      (resolved_by_staff_id is not null and resolved_by_owner_id is null)
      or
      (resolved_by_staff_id is null and resolved_by_owner_id is not null)
    )
);

create index if not exists idx_complaints_shift_created_at
  on ops.complaints(cafe_id, shift_id, created_at desc);

create index if not exists idx_complaints_order_item
  on ops.complaints(cafe_id, order_item_id, created_at desc);

alter table ops.complaints enable row level security;
drop policy if exists cafe_access_policy on ops.complaints;
create policy cafe_access_policy on ops.complaints for all
  using (app.can_access_cafe(cafe_id))
  with check (app.can_access_cafe(cafe_id));

create or replace function public.ops_list_billable_quantities(
  p_cafe_id uuid,
  p_shift_id uuid,
  p_service_session_id uuid default null
)
returns jsonb
language sql
security definer
set search_path = public, ops
as $$
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at asc), '[]'::jsonb)
  from (
    select
      oi.id as order_item_id,
      oi.order_id,
      oi.service_session_id,
      ss.session_label,
      oi.menu_product_id,
      mp.product_name,
      oi.station_code,
      oi.unit_price,
      oi.qty_total,
      oi.qty_delivered,
      oi.qty_paid,
      oi.qty_deferred,
      oi.qty_waived,
      greatest(oi.qty_delivered - oi.qty_paid - oi.qty_deferred - oi.qty_waived, 0) as qty_billable,
      (greatest(oi.qty_delivered - oi.qty_paid - oi.qty_deferred - oi.qty_waived, 0) * oi.unit_price)::numeric(12,2) as amount_billable,
      oi.created_at
    from ops.order_items oi
    join ops.service_sessions ss
      on ss.id = oi.service_session_id
     and ss.cafe_id = oi.cafe_id
    join ops.menu_products mp
      on mp.id = oi.menu_product_id
     and mp.cafe_id = oi.cafe_id
    where oi.cafe_id = p_cafe_id
      and oi.shift_id = p_shift_id
      and (p_service_session_id is null or oi.service_session_id = p_service_session_id)
      and greatest(oi.qty_delivered - oi.qty_paid - oi.qty_deferred - oi.qty_waived, 0) > 0
    order by oi.created_at asc
  ) q;
$$;

create or replace function public.ops_settle_selected_quantities(
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
  v_payment_id uuid;
  v_total_amount numeric(12,2) := 0;
  v_total_quantity integer := 0;
  v_line jsonb;
  v_item ops.order_items%rowtype;
  v_qty integer;
  v_available integer;
  v_amount numeric(12,2);
begin
  if p_service_session_id is null then
    raise exception 'p_service_session_id is required';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'p_lines must be a non-empty json array';
  end if;

  if (p_by_staff_id is null and p_by_owner_id is null)
     or (p_by_staff_id is not null and p_by_owner_id is not null) then
    raise exception 'Exactly one actor is required';
  end if;

  insert into ops.payments (
    cafe_id,
    shift_id,
    service_session_id,
    payment_kind,
    total_amount,
    notes,
    by_staff_id,
    by_owner_id
  )
  values (
    p_cafe_id,
    p_shift_id,
    p_service_session_id,
    'cash',
    0,
    p_notes,
    p_by_staff_id,
    p_by_owner_id
  )
  returning id into v_payment_id;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_qty := coalesce((v_line ->> 'quantity')::integer, 0);

    if v_qty <= 0 then
      raise exception 'Each line quantity must be greater than zero';
    end if;

    select *
    into v_item
    from ops.order_items
    where cafe_id = p_cafe_id
      and shift_id = p_shift_id
      and service_session_id = p_service_session_id
      and id = (v_line ->> 'order_item_id')::uuid
    for update;

    if not found then
      raise exception 'order_item % not found in this session', v_line ->> 'order_item_id';
    end if;

    v_available := greatest(v_item.qty_delivered - v_item.qty_paid - v_item.qty_deferred - v_item.qty_waived, 0);

    if v_qty > v_available then
      raise exception 'Requested quantity % exceeds billable quantity % for order_item %', v_qty, v_available, v_item.id;
    end if;

    v_amount := (v_item.unit_price * v_qty)::numeric(12,2);

    update ops.order_items
    set qty_paid = qty_paid + v_qty
    where cafe_id = p_cafe_id
      and id = v_item.id;

    insert into ops.payment_allocations (
      cafe_id,
      payment_id,
      order_item_id,
      allocation_kind,
      quantity,
      amount
    )
    values (
      p_cafe_id,
      v_payment_id,
      v_item.id,
      'cash',
      v_qty,
      v_amount
    );

    v_total_quantity := v_total_quantity + v_qty;
    v_total_amount := v_total_amount + v_amount;
  end loop;

  update ops.payments
  set total_amount = v_total_amount
  where cafe_id = p_cafe_id
    and id = v_payment_id;

  return jsonb_build_object(
    'ok', true,
    'payment_id', v_payment_id,
    'total_quantity', v_total_quantity,
    'total_amount', v_total_amount
  );
end;
$$;

create or replace function public.ops_defer_selected_quantities(
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
  v_payment_id uuid;
  v_total_amount numeric(12,2) := 0;
  v_total_quantity integer := 0;
  v_line jsonb;
  v_item ops.order_items%rowtype;
  v_qty integer;
  v_available integer;
  v_amount numeric(12,2);
  v_name text;
begin
  v_name := nullif(btrim(p_debtor_name), '');

  if v_name is null then
    raise exception 'p_debtor_name is required';
  end if;

  if p_service_session_id is null then
    raise exception 'p_service_session_id is required';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'p_lines must be a non-empty json array';
  end if;

  if (p_by_staff_id is null and p_by_owner_id is null)
     or (p_by_staff_id is not null and p_by_owner_id is not null) then
    raise exception 'Exactly one actor is required';
  end if;

  insert into ops.payments (
    cafe_id,
    shift_id,
    service_session_id,
    payment_kind,
    total_amount,
    debtor_name,
    notes,
    by_staff_id,
    by_owner_id
  )
  values (
    p_cafe_id,
    p_shift_id,
    p_service_session_id,
    'deferred',
    0,
    v_name,
    p_notes,
    p_by_staff_id,
    p_by_owner_id
  )
  returning id into v_payment_id;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_qty := coalesce((v_line ->> 'quantity')::integer, 0);

    if v_qty <= 0 then
      raise exception 'Each line quantity must be greater than zero';
    end if;

    select *
    into v_item
    from ops.order_items
    where cafe_id = p_cafe_id
      and shift_id = p_shift_id
      and service_session_id = p_service_session_id
      and id = (v_line ->> 'order_item_id')::uuid
    for update;

    if not found then
      raise exception 'order_item % not found in this session', v_line ->> 'order_item_id';
    end if;

    v_available := greatest(v_item.qty_delivered - v_item.qty_paid - v_item.qty_deferred - v_item.qty_waived, 0);

    if v_qty > v_available then
      raise exception 'Requested quantity % exceeds billable quantity % for order_item %', v_qty, v_available, v_item.id;
    end if;

    v_amount := (v_item.unit_price * v_qty)::numeric(12,2);

    update ops.order_items
    set qty_deferred = qty_deferred + v_qty
    where cafe_id = p_cafe_id
      and id = v_item.id;

    insert into ops.payment_allocations (
      cafe_id,
      payment_id,
      order_item_id,
      allocation_kind,
      quantity,
      amount
    )
    values (
      p_cafe_id,
      v_payment_id,
      v_item.id,
      'deferred',
      v_qty,
      v_amount
    );

    v_total_quantity := v_total_quantity + v_qty;
    v_total_amount := v_total_amount + v_amount;
  end loop;

  update ops.payments
  set total_amount = v_total_amount
  where cafe_id = p_cafe_id
    and id = v_payment_id;

  insert into ops.deferred_ledger_entries (
    cafe_id,
    service_session_id,
    payment_id,
    debtor_name,
    entry_kind,
    amount,
    notes,
    by_staff_id,
    by_owner_id
  )
  values (
    p_cafe_id,
    p_service_session_id,
    v_payment_id,
    v_name,
    'debt',
    v_total_amount,
    p_notes,
    p_by_staff_id,
    p_by_owner_id
  );

  return jsonb_build_object(
    'ok', true,
    'payment_id', v_payment_id,
    'debtor_name', v_name,
    'total_quantity', v_total_quantity,
    'total_amount', v_total_amount
  );
end;
$$;

create or replace function public.ops_close_service_session(
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
  v_session ops.service_sessions%rowtype;
  v_waiting integer;
  v_ready_undelivered integer;
  v_billable integer;
begin
  if (p_by_staff_id is null and p_by_owner_id is null)
     or (p_by_staff_id is not null and p_by_owner_id is not null) then
    raise exception 'Exactly one actor is required';
  end if;

  select *
  into v_session
  from ops.service_sessions
  where cafe_id = p_cafe_id
    and id = p_service_session_id
  for update;

  if not found then
    raise exception 'service_session not found';
  end if;

  if v_session.status <> 'open' then
    raise exception 'service_session is already closed';
  end if;

  select
    coalesce(sum(
      greatest(qty_submitted - least(qty_ready, qty_submitted) - qty_cancelled, 0)
      + greatest(qty_remade - greatest(qty_ready - least(qty_ready, qty_submitted), 0), 0)
    ), 0),
    coalesce(sum(
      greatest(least(qty_ready, qty_total - qty_cancelled) - qty_delivered, 0)
      + greatest(qty_ready - least(qty_ready, qty_total - qty_cancelled) - qty_replacement_delivered, 0)
    ), 0),
    coalesce(sum(greatest(qty_delivered - qty_paid - qty_deferred - qty_waived, 0)), 0)
  into v_waiting, v_ready_undelivered, v_billable
  from ops.order_items
  where cafe_id = p_cafe_id
    and service_session_id = p_service_session_id;

  if v_waiting > 0 then
    raise exception 'Cannot close service session while station queue is still pending';
  end if;

  if v_ready_undelivered > 0 then
    raise exception 'Cannot close service session while ready quantities are not delivered';
  end if;

  if v_billable > 0 then
    raise exception 'Cannot close service session while delivered unpaid quantities exist';
  end if;

  update ops.service_sessions
  set status = 'closed',
      closed_at = now(),
      closed_by_staff_id = p_by_staff_id,
      closed_by_owner_id = p_by_owner_id,
      notes = coalesce(p_notes, notes)
  where cafe_id = p_cafe_id
    and id = p_service_session_id;

  update ops.orders
  set status = 'completed'
  where cafe_id = p_cafe_id
    and service_session_id = p_service_session_id
    and status <> 'cancelled';

  return jsonb_build_object(
    'ok', true,
    'service_session_id', p_service_session_id,
    'status', 'closed'
  );
end;
$$;

create or replace function public.ops_cancel_undelivered_quantities(
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
  v_item ops.order_items%rowtype;
  v_available integer;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'p_quantity must be greater than zero';
  end if;

  if (p_by_staff_id is null and p_by_owner_id is null)
     or (p_by_staff_id is not null and p_by_owner_id is not null) then
    raise exception 'Exactly one actor is required';
  end if;

  select *
  into v_item
  from ops.order_items
  where cafe_id = p_cafe_id
    and id = p_order_item_id
  for update;

  if not found then
    raise exception 'order_item not found';
  end if;

  v_available := greatest(v_item.qty_total - v_item.qty_cancelled - v_item.qty_delivered, 0);

  if v_available = 0 then
    raise exception 'No undelivered original quantity available for cancellation';
  end if;

  if p_quantity > v_available then
    raise exception 'Requested cancel quantity % exceeds available quantity %', p_quantity, v_available;
  end if;

  update ops.order_items
  set qty_cancelled = qty_cancelled + p_quantity
  where cafe_id = p_cafe_id
    and id = p_order_item_id;

  insert into ops.fulfillment_events (
    cafe_id,
    shift_id,
    service_session_id,
    order_item_id,
    station_code,
    event_code,
    quantity,
    notes,
    by_staff_id,
    by_owner_id
  )
  values (
    v_item.cafe_id,
    v_item.shift_id,
    v_item.service_session_id,
    v_item.id,
    v_item.station_code,
    'cancelled',
    p_quantity,
    p_notes,
    p_by_staff_id,
    p_by_owner_id
  );

  return jsonb_build_object(
    'ok', true,
    'order_item_id', v_item.id,
    'qty_cancelled', p_quantity
  );
end;
$$;

create or replace function public.ops_waive_delivered_quantities(
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
  v_item ops.order_items%rowtype;
  v_available integer;
  v_amount numeric(12,2);
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'p_quantity must be greater than zero';
  end if;

  if (p_by_staff_id is null and p_by_owner_id is null)
     or (p_by_staff_id is not null and p_by_owner_id is not null) then
    raise exception 'Exactly one actor is required';
  end if;

  select *
  into v_item
  from ops.order_items
  where cafe_id = p_cafe_id
    and id = p_order_item_id
  for update;

  if not found then
    raise exception 'order_item not found';
  end if;

  v_available := greatest(v_item.qty_delivered - v_item.qty_paid - v_item.qty_deferred - v_item.qty_waived, 0);

  if v_available = 0 then
    raise exception 'No delivered unpaid quantity available for waive';
  end if;

  if p_quantity > v_available then
    raise exception 'Requested waive quantity % exceeds available quantity %', p_quantity, v_available;
  end if;

  update ops.order_items
  set qty_waived = qty_waived + p_quantity
  where cafe_id = p_cafe_id
    and id = p_order_item_id;

  insert into ops.fulfillment_events (
    cafe_id,
    shift_id,
    service_session_id,
    order_item_id,
    station_code,
    event_code,
    quantity,
    notes,
    by_staff_id,
    by_owner_id
  )
  values (
    v_item.cafe_id,
    v_item.shift_id,
    v_item.service_session_id,
    v_item.id,
    v_item.station_code,
    'waived',
    p_quantity,
    p_notes,
    p_by_staff_id,
    p_by_owner_id
  );

  v_amount := (v_item.unit_price * p_quantity)::numeric(12,2);

  return jsonb_build_object(
    'ok', true,
    'order_item_id', v_item.id,
    'qty_waived', p_quantity,
    'amount_waived', v_amount
  );
end;
$$;

create or replace function public.ops_create_complaint(
  p_cafe_id uuid,
  p_service_session_id uuid default null,
  p_order_item_id uuid default null,
  p_complaint_kind text default 'other',
  p_requested_quantity integer default null,
  p_notes text default null,
  p_by_staff_id uuid default null,
  p_by_owner_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_session ops.service_sessions%rowtype;
  v_item ops.order_items%rowtype;
  v_complaint_id uuid;
  v_kind text;
  v_quantity integer;
begin
  v_kind := case
    when p_complaint_kind in ('quality_issue', 'wrong_item', 'delay', 'billing_issue', 'other') then p_complaint_kind
    else 'other'
  end;
  v_quantity := case when p_requested_quantity is null or p_requested_quantity <= 0 then null else p_requested_quantity end;

  if (p_by_staff_id is null and p_by_owner_id is null)
     or (p_by_staff_id is not null and p_by_owner_id is not null) then
    raise exception 'Exactly one actor is required';
  end if;

  if p_order_item_id is not null then
    select *
    into v_item
    from ops.order_items
    where cafe_id = p_cafe_id
      and id = p_order_item_id;

    if not found then
      raise exception 'order_item not found';
    end if;

    if p_service_session_id is not null and v_item.service_session_id <> p_service_session_id then
      raise exception 'order_item does not belong to service_session';
    end if;

    p_service_session_id := v_item.service_session_id;
  end if;

  if p_service_session_id is null then
    raise exception 'service_session_id is required';
  end if;

  select *
  into v_session
  from ops.service_sessions
  where cafe_id = p_cafe_id
    and id = p_service_session_id;

  if not found then
    raise exception 'service_session not found';
  end if;

  insert into ops.complaints (
    cafe_id,
    shift_id,
    service_session_id,
    order_item_id,
    station_code,
    complaint_kind,
    status,
    requested_quantity,
    notes,
    created_by_staff_id,
    created_by_owner_id
  )
  values (
    p_cafe_id,
    v_session.shift_id,
    p_service_session_id,
    p_order_item_id,
    coalesce(v_item.station_code, null),
    v_kind,
    'open',
    v_quantity,
    nullif(btrim(p_notes), ''),
    p_by_staff_id,
    p_by_owner_id
  )
  returning id into v_complaint_id;

  return jsonb_build_object(
    'ok', true,
    'complaint_id', v_complaint_id,
    'shift_id', v_session.shift_id,
    'service_session_id', p_service_session_id,
    'order_item_id', p_order_item_id,
    'status', 'open'
  );
end;
$$;

create or replace function public.ops_resolve_complaint(
  p_cafe_id uuid,
  p_complaint_id uuid,
  p_resolution_kind text,
  p_quantity integer default null,
  p_notes text default null,
  p_by_staff_id uuid default null,
  p_by_owner_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_complaint ops.complaints%rowtype;
  v_requested_quantity integer;
  v_resolution text;
  v_result jsonb;
  v_quantity integer;
begin
  if (p_by_staff_id is null and p_by_owner_id is null)
     or (p_by_staff_id is not null and p_by_owner_id is not null) then
    raise exception 'Exactly one actor is required';
  end if;

  v_resolution := case
    when p_resolution_kind in ('remake', 'cancel_undelivered', 'waive_delivered', 'dismissed') then p_resolution_kind
    else null
  end;

  if v_resolution is null then
    raise exception 'Invalid resolution kind';
  end if;

  select *
  into v_complaint
  from ops.complaints
  where cafe_id = p_cafe_id
    and id = p_complaint_id
  for update;

  if not found then
    raise exception 'complaint not found';
  end if;

  if v_complaint.status <> 'open' then
    raise exception 'complaint is already closed';
  end if;

  v_requested_quantity := coalesce(v_complaint.requested_quantity, 0);
  v_quantity := coalesce(nullif(p_quantity, 0), nullif(v_requested_quantity, 0), 1);

  if v_resolution = 'dismissed' then
    v_quantity := null;
  else
    if v_complaint.order_item_id is null then
      raise exception 'complaint must reference order_item for this resolution';
    end if;
    if v_quantity is null or v_quantity <= 0 then
      raise exception 'resolution quantity must be greater than zero';
    end if;

    if v_resolution = 'remake' then
      v_result := public.ops_request_remake(
        p_cafe_id,
        v_complaint.order_item_id,
        v_quantity,
        p_by_staff_id,
        p_by_owner_id,
        p_notes
      );
    elsif v_resolution = 'cancel_undelivered' then
      v_result := public.ops_cancel_undelivered_quantities(
        p_cafe_id,
        v_complaint.order_item_id,
        v_quantity,
        p_by_staff_id,
        p_by_owner_id,
        p_notes
      );
    elsif v_resolution = 'waive_delivered' then
      v_result := public.ops_waive_delivered_quantities(
        p_cafe_id,
        v_complaint.order_item_id,
        v_quantity,
        p_by_staff_id,
        p_by_owner_id,
        p_notes
      );
    end if;
  end if;

  update ops.complaints
  set status = case when v_resolution = 'dismissed' then 'dismissed' else 'resolved' end,
      resolution_kind = v_resolution,
      resolved_quantity = v_quantity,
      resolved_at = now(),
      resolved_by_staff_id = p_by_staff_id,
      resolved_by_owner_id = p_by_owner_id,
      notes = case
        when nullif(btrim(p_notes), '') is null then notes
        when notes is null or btrim(notes) = '' then btrim(p_notes)
        else notes || E'\n' || btrim(p_notes)
      end
  where cafe_id = p_cafe_id
    and id = p_complaint_id;

  return jsonb_build_object(
    'ok', true,
    'complaint_id', v_complaint.id,
    'shift_id', v_complaint.shift_id,
    'service_session_id', v_complaint.service_session_id,
    'order_item_id', v_complaint.order_item_id,
    'resolution_kind', v_resolution,
    'resolved_quantity', v_quantity,
    'operation', coalesce(v_result, '{}'::jsonb)
  );
end;
$$;

commit;
