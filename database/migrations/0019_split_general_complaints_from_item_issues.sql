begin;

alter table ops.complaints
  add column if not exists complaint_scope text not null default 'general';

alter table ops.complaints
  drop constraint if exists ck_complaints_scope;

alter table ops.complaints
  add constraint ck_complaints_scope
  check (complaint_scope in ('general', 'legacy_item_issue'));

alter table ops.complaints
  drop constraint if exists complaints_resolution_kind_check;

alter table ops.complaints
  add constraint complaints_resolution_kind_check
  check (
    resolution_kind is null
    or resolution_kind in ('remake', 'cancel_undelivered', 'waive_delivered', 'dismissed', 'resolved')
  );

create table if not exists ops.order_item_issues (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  shift_id uuid not null,
  service_session_id uuid not null,
  order_item_id uuid not null,
  source_complaint_id uuid,
  station_code text check (station_code in ('barista', 'shisha', 'service')),
  issue_kind text not null check (issue_kind in ('quality_issue', 'wrong_item', 'delay', 'billing_issue', 'other')),
  action_kind text not null check (action_kind in ('note', 'remake', 'cancel_undelivered', 'waive_delivered')),
  status text not null default 'logged' check (status in ('logged', 'applied', 'dismissed')),
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
  unique (cafe_id, source_complaint_id),
  constraint fk_order_item_issues_shift
    foreign key (cafe_id, shift_id)
    references ops.shifts(cafe_id, id)
    on delete cascade,
  constraint fk_order_item_issues_session
    foreign key (cafe_id, service_session_id)
    references ops.service_sessions(cafe_id, id)
    on delete cascade,
  constraint fk_order_item_issues_item
    foreign key (cafe_id, order_item_id)
    references ops.order_items(cafe_id, id)
    on delete cascade,
  constraint fk_order_item_issues_source_complaint
    foreign key (cafe_id, source_complaint_id)
    references ops.complaints(cafe_id, id)
    on delete set null,
  constraint fk_order_item_issues_created_staff
    foreign key (cafe_id, created_by_staff_id)
    references ops.staff_members(cafe_id, id)
    on delete set null,
  constraint fk_order_item_issues_created_owner
    foreign key (cafe_id, created_by_owner_id)
    references ops.owner_users(cafe_id, id)
    on delete set null,
  constraint fk_order_item_issues_resolved_staff
    foreign key (cafe_id, resolved_by_staff_id)
    references ops.staff_members(cafe_id, id)
    on delete set null,
  constraint fk_order_item_issues_resolved_owner
    foreign key (cafe_id, resolved_by_owner_id)
    references ops.owner_users(cafe_id, id)
    on delete set null,
  constraint ck_order_item_issues_created_actor
    check (
      (created_by_staff_id is not null and created_by_owner_id is null)
      or
      (created_by_staff_id is null and created_by_owner_id is not null)
    ),
  constraint ck_order_item_issues_resolved_actor
    check (
      (resolved_by_staff_id is null and resolved_by_owner_id is null)
      or
      (resolved_by_staff_id is not null and resolved_by_owner_id is null)
      or
      (resolved_by_staff_id is null and resolved_by_owner_id is not null)
    )
);

create index if not exists idx_order_item_issues_shift_created_at
  on ops.order_item_issues(cafe_id, shift_id, created_at desc);

create index if not exists idx_order_item_issues_order_item
  on ops.order_item_issues(cafe_id, order_item_id, created_at desc);

alter table ops.order_item_issues enable row level security;
drop policy if exists cafe_access_policy on ops.order_item_issues;
create policy cafe_access_policy on ops.order_item_issues for all
  using (app.can_access_cafe(cafe_id))
  with check (app.can_access_cafe(cafe_id));

insert into ops.order_item_issues (
  cafe_id,
  shift_id,
  service_session_id,
  order_item_id,
  source_complaint_id,
  station_code,
  issue_kind,
  action_kind,
  status,
  requested_quantity,
  resolved_quantity,
  notes,
  created_at,
  resolved_at,
  created_by_staff_id,
  created_by_owner_id,
  resolved_by_staff_id,
  resolved_by_owner_id
)
select
  c.cafe_id,
  c.shift_id,
  c.service_session_id,
  c.order_item_id,
  c.id,
  c.station_code,
  c.complaint_kind,
  case
    when c.resolution_kind in ('remake', 'cancel_undelivered', 'waive_delivered') then c.resolution_kind
    else 'note'
  end,
  case
    when c.status = 'dismissed' then 'dismissed'
    when c.resolution_kind in ('remake', 'cancel_undelivered', 'waive_delivered') then 'applied'
    else 'logged'
  end,
  c.requested_quantity,
  c.resolved_quantity,
  c.notes,
  c.created_at,
  c.resolved_at,
  c.created_by_staff_id,
  c.created_by_owner_id,
  c.resolved_by_staff_id,
  c.resolved_by_owner_id
from ops.complaints c
where c.order_item_id is not null
  and not exists (
    select 1
    from ops.order_item_issues i
    where i.cafe_id = c.cafe_id
      and i.source_complaint_id = c.id
  );

update ops.complaints
set complaint_scope = 'legacy_item_issue'
where order_item_id is not null;

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
    complaint_scope,
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
    null,
    coalesce(v_item.station_code, null),
    'general',
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
    'order_item_id', null,
    'status', 'open'
  );
end;
$$;

create or replace function public.ops_log_order_item_issue(
  p_cafe_id uuid,
  p_order_item_id uuid,
  p_service_session_id uuid default null,
  p_issue_kind text default 'other',
  p_action_kind text default 'note',
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
  v_item ops.order_items%rowtype;
  v_issue_id uuid;
  v_issue_kind text;
  v_action text;
  v_requested_quantity integer;
  v_resolved_quantity integer;
  v_status text := 'logged';
  v_result jsonb;
begin
  if p_order_item_id is null then
    raise exception 'p_order_item_id is required';
  end if;

  if (p_by_staff_id is null and p_by_owner_id is null)
     or (p_by_staff_id is not null and p_by_owner_id is not null) then
    raise exception 'Exactly one actor is required';
  end if;

  v_issue_kind := case
    when p_issue_kind in ('quality_issue', 'wrong_item', 'delay', 'billing_issue', 'other') then p_issue_kind
    else 'other'
  end;

  v_action := case
    when p_action_kind in ('note', 'remake', 'cancel_undelivered', 'waive_delivered') then p_action_kind
    else 'note'
  end;

  select *
  into v_item
  from ops.order_items
  where cafe_id = p_cafe_id
    and id = p_order_item_id
  for update;

  if not found then
    raise exception 'order_item not found';
  end if;

  if p_service_session_id is not null and v_item.service_session_id <> p_service_session_id then
    raise exception 'order_item does not belong to service_session';
  end if;

  p_service_session_id := v_item.service_session_id;
  v_requested_quantity := case when p_requested_quantity is null or p_requested_quantity <= 0 then null else p_requested_quantity end;

  if v_action <> 'note' then
    v_resolved_quantity := coalesce(v_requested_quantity, 1);

    if v_action = 'remake' then
      v_result := public.ops_request_remake(
        p_cafe_id,
        p_order_item_id,
        v_resolved_quantity,
        p_by_staff_id,
        p_by_owner_id,
        p_notes
      );
    elsif v_action = 'cancel_undelivered' then
      v_result := public.ops_cancel_undelivered_quantities(
        p_cafe_id,
        p_order_item_id,
        v_resolved_quantity,
        p_by_staff_id,
        p_by_owner_id,
        p_notes
      );
    elsif v_action = 'waive_delivered' then
      v_result := public.ops_waive_delivered_quantities(
        p_cafe_id,
        p_order_item_id,
        v_resolved_quantity,
        p_by_staff_id,
        p_by_owner_id,
        p_notes
      );
    end if;

    v_status := 'applied';
  end if;

  insert into ops.order_item_issues (
    cafe_id,
    shift_id,
    service_session_id,
    order_item_id,
    station_code,
    issue_kind,
    action_kind,
    status,
    requested_quantity,
    resolved_quantity,
    notes,
    created_by_staff_id,
    created_by_owner_id,
    resolved_at,
    resolved_by_staff_id,
    resolved_by_owner_id
  )
  values (
    p_cafe_id,
    v_item.shift_id,
    p_service_session_id,
    p_order_item_id,
    v_item.station_code,
    v_issue_kind,
    v_action,
    v_status,
    v_requested_quantity,
    v_resolved_quantity,
    nullif(btrim(p_notes), ''),
    p_by_staff_id,
    p_by_owner_id,
    case when v_status = 'applied' then now() else null end,
    case when v_status = 'applied' then p_by_staff_id else null end,
    case when v_status = 'applied' then p_by_owner_id else null end
  )
  returning id into v_issue_id;

  return jsonb_build_object(
    'ok', true,
    'item_issue_id', v_issue_id,
    'shift_id', v_item.shift_id,
    'service_session_id', p_service_session_id,
    'order_item_id', p_order_item_id,
    'action_kind', v_action,
    'status', v_status,
    'resolved_quantity', v_resolved_quantity,
    'operation', coalesce(v_result, '{}'::jsonb)
  );
end;
$$;

grant execute on function public.ops_log_order_item_issue(uuid, uuid, uuid, text, text, integer, text, uuid, uuid) to authenticated;

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
  v_resolution text;
begin
  if (p_by_staff_id is null and p_by_owner_id is null)
     or (p_by_staff_id is not null and p_by_owner_id is not null) then
    raise exception 'Exactly one actor is required';
  end if;

  v_resolution := case
    when p_resolution_kind in ('resolved', 'dismissed') then p_resolution_kind
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
    and complaint_scope = 'general'
  for update;

  if not found then
    raise exception 'complaint not found';
  end if;

  if v_complaint.status <> 'open' then
    raise exception 'complaint is already closed';
  end if;

  update ops.complaints
  set status = case when v_resolution = 'dismissed' then 'dismissed' else 'resolved' end,
      resolution_kind = v_resolution,
      resolved_quantity = null,
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
    'order_item_id', null,
    'resolution_kind', case when v_resolution = 'dismissed' then 'dismissed' else null end,
    'resolved_quantity', null,
    'operation', '{}'::jsonb
  );
end;
$$;

commit;
