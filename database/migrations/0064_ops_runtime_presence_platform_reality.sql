begin;

create table if not exists ops.runtime_presence (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  runtime_user_id uuid not null,
  device_id text not null,
  actor_type text not null check (actor_type in ('owner', 'employee', 'platform_support')),
  owner_label text null check (owner_label is null or owner_label in ('owner', 'partner', 'branch_manager')),
  shift_id uuid null,
  shift_role text null check (shift_role is null or shift_role in ('supervisor', 'waiter', 'barista', 'shisha', 'american_waiter')),
  last_seen_at timestamptz not null default now(),
  last_app_opened_at timestamptz null,
  last_visible_at timestamptz null,
  page_path text null,
  user_agent text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cafe_id, runtime_user_id, device_id),
  constraint fk_runtime_presence_shift
    foreign key (cafe_id, shift_id)
    references ops.shifts(cafe_id, id)
    on delete set null
);

create index if not exists idx_ops_runtime_presence_cafe_last_seen
  on ops.runtime_presence (cafe_id, last_seen_at desc);

create index if not exists idx_ops_runtime_presence_shift_last_seen
  on ops.runtime_presence (cafe_id, shift_id, last_seen_at desc)
  where shift_id is not null;

create index if not exists idx_ops_runtime_presence_visible
  on ops.runtime_presence (cafe_id, last_visible_at desc);

create or replace function public.ops_get_cafe_runtime_status_snapshot(
  p_cafe_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, app
as $$
declare
  v_cafe_id uuid := coalesce(p_cafe_id, app.current_cafe_id());
  v_operational_last_activity_at timestamptz;
  v_presence_last_activity_at timestamptz;
  v_effective_last_activity_at timestamptz;
  v_last_online_at timestamptz;
  v_last_app_opened_at timestamptz;
  v_has_open_shift boolean := false;
  v_open_shift_id uuid;
  v_open_shift_kind text;
  v_open_shift_business_date date;
  v_open_shift_opened_at timestamptz;
  v_last_shift_closed_at timestamptz;
  v_open_sessions_count integer := 0;
  v_active_staff_count integer := 0;
  v_online_users_count integer := 0;
  v_visible_runtime_count integer := 0;
  v_last_open_order_at timestamptz;
  v_last_open_order_id uuid;
  v_last_open_order_session_id uuid;
  v_last_open_order_session_label text;
  v_last_open_order_status text;
  v_last_open_order_items_count integer := 0;
  v_usage_state text := 'inactive';
begin
  if v_cafe_id is null then
    raise exception 'cafe_id_required';
  end if;

  if not exists (select 1 from ops.cafes where id = v_cafe_id) then
    raise exception 'cafe_not_found';
  end if;

  select max(activity_at)
    into v_operational_last_activity_at
  from (
    select max(created_at) as activity_at from ops.audit_events where cafe_id = v_cafe_id
    union all
    select max(opened_at) as activity_at from ops.shifts where cafe_id = v_cafe_id
    union all
    select max(opened_at) as activity_at from ops.service_sessions where cafe_id = v_cafe_id
    union all
    select max(created_at) as activity_at from ops.orders where cafe_id = v_cafe_id
    union all
    select max(created_at) as activity_at from ops.payments where cafe_id = v_cafe_id
    union all
    select max(created_at) as activity_at from ops.complaints where cafe_id = v_cafe_id
    union all
    select max(created_at) as activity_at from ops.order_item_issues where cafe_id = v_cafe_id
  ) activity;

  select
    max(rp.last_seen_at),
    max(rp.last_app_opened_at),
    count(distinct rp.runtime_user_id) filter (where rp.last_seen_at >= now() - interval '90 seconds')::integer,
    count(distinct rp.runtime_user_id) filter (where rp.last_visible_at >= now() - interval '90 seconds')::integer
  into
    v_last_online_at,
    v_last_app_opened_at,
    v_online_users_count,
    v_visible_runtime_count
  from ops.runtime_presence rp
  where rp.cafe_id = v_cafe_id;

  select max(activity_at)
    into v_presence_last_activity_at
  from (
    select v_last_online_at as activity_at
    union all
    select v_last_app_opened_at as activity_at
  ) activity
  where activity.activity_at is not null;

  v_effective_last_activity_at := coalesce(v_presence_last_activity_at, v_operational_last_activity_at);

  select
    true,
    s.id,
    s.shift_kind,
    s.business_date,
    s.opened_at
  into
    v_has_open_shift,
    v_open_shift_id,
    v_open_shift_kind,
    v_open_shift_business_date,
    v_open_shift_opened_at
  from ops.shifts s
  where s.cafe_id = v_cafe_id
    and s.closed_at is null
  order by s.opened_at desc, s.id desc
  limit 1;

  select max(s.closed_at)
    into v_last_shift_closed_at
  from ops.shifts s
  where s.cafe_id = v_cafe_id
    and s.closed_at is not null;

  select count(*)::integer
    into v_open_sessions_count
  from ops.service_sessions ss
  where ss.cafe_id = v_cafe_id
    and ss.closed_at is null;

  select count(distinct ss.opened_by_staff_id)::integer
    into v_active_staff_count
  from ops.service_sessions ss
  where ss.cafe_id = v_cafe_id
    and ss.closed_at is null
    and ss.opened_by_staff_id is not null;

  select
    o.created_at,
    o.id,
    o.service_session_id,
    ss.session_label,
    o.status,
    count(oi.id)::integer
  into
    v_last_open_order_at,
    v_last_open_order_id,
    v_last_open_order_session_id,
    v_last_open_order_session_label,
    v_last_open_order_status,
    v_last_open_order_items_count
  from ops.orders o
  join ops.service_sessions ss
    on ss.cafe_id = o.cafe_id
   and ss.id = o.service_session_id
   and ss.closed_at is null
   and ss.status = 'open'
  left join ops.order_items oi
    on oi.cafe_id = o.cafe_id
   and oi.order_id = o.id
  where o.cafe_id = v_cafe_id
    and o.status <> 'cancelled'
    and (v_open_shift_id is null or o.shift_id = v_open_shift_id)
  group by o.created_at, o.id, o.service_session_id, ss.session_label, o.status
  order by o.created_at desc, o.id desc
  limit 1;

  v_usage_state := case
    when coalesce(v_online_users_count, 0) > 0 then 'active_now'
    when v_has_open_shift then 'active_now'
    when v_effective_last_activity_at is not null and v_effective_last_activity_at >= now() - interval '24 hours' then 'active_today'
    when v_effective_last_activity_at is not null and v_effective_last_activity_at >= now() - interval '7 days' then 'active_recently'
    else 'inactive'
  end;

  return jsonb_build_object(
    'cafe_id', v_cafe_id,
    'last_activity_at', v_effective_last_activity_at,
    'operational_last_activity_at', v_operational_last_activity_at,
    'last_online_at', v_last_online_at,
    'last_app_opened_at', v_last_app_opened_at,
    'online_users_count', coalesce(v_online_users_count, 0),
    'visible_runtime_count', coalesce(v_visible_runtime_count, 0),
    'usage_state', v_usage_state,
    'has_open_shift', coalesce(v_has_open_shift, false),
    'open_shift_id', v_open_shift_id,
    'open_shift_kind', v_open_shift_kind,
    'open_shift_business_date', v_open_shift_business_date,
    'open_shift_opened_at', v_open_shift_opened_at,
    'last_shift_closed_at', v_last_shift_closed_at,
    'open_sessions_count', coalesce(v_open_sessions_count, 0),
    'active_staff_count', coalesce(v_active_staff_count, 0),
    'last_open_order_at', v_last_open_order_at,
    'last_open_order_id', v_last_open_order_id,
    'last_open_order_session_id', v_last_open_order_session_id,
    'last_open_order_session_label', v_last_open_order_session_label,
    'last_open_order_status', v_last_open_order_status,
    'last_open_order_items_count', coalesce(v_last_open_order_items_count, 0),
    'source_updated_at', now(),
    'source_kind', 'runtime_push',
    'notes', jsonb_build_object(
      'producer', 'ops_get_cafe_runtime_status_snapshot',
      'open_sessions_count', coalesce(v_open_sessions_count, 0),
      'active_staff_count', coalesce(v_active_staff_count, 0),
      'online_users_count', coalesce(v_online_users_count, 0),
      'visible_runtime_count', coalesce(v_visible_runtime_count, 0),
      'last_open_order', case
        when v_last_open_order_id is null then null
        else jsonb_build_object(
          'id', v_last_open_order_id,
          'created_at', v_last_open_order_at,
          'service_session_id', v_last_open_order_session_id,
          'session_label', v_last_open_order_session_label,
          'status', v_last_open_order_status,
          'items_count', coalesce(v_last_open_order_items_count, 0)
        )
      end
    )
  );
end;
$$;

grant execute on function public.ops_get_cafe_runtime_status_snapshot(uuid) to service_role;

commit;
