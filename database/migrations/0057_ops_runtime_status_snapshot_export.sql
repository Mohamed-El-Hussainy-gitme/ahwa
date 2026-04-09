begin;

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
  v_last_activity_at timestamptz;
  v_has_open_shift boolean := false;
  v_open_shift_id uuid;
  v_open_shift_kind text;
  v_open_shift_business_date date;
  v_open_shift_opened_at timestamptz;
  v_last_shift_closed_at timestamptz;
  v_open_sessions_count integer := 0;
  v_active_staff_count integer := 0;
  v_usage_state text := 'inactive';
begin
  if v_cafe_id is null then
    raise exception 'cafe_id_required';
  end if;

  if not exists (select 1 from ops.cafes where id = v_cafe_id) then
    raise exception 'cafe_not_found';
  end if;

  select max(activity_at)
    into v_last_activity_at
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

  v_usage_state := case
    when v_has_open_shift then 'active_now'
    when v_last_activity_at is not null and v_last_activity_at >= now() - interval '24 hours' then 'active_today'
    when v_last_activity_at is not null and v_last_activity_at >= now() - interval '7 days' then 'active_recently'
    else 'inactive'
  end;

  return jsonb_build_object(
    'cafe_id', v_cafe_id,
    'last_activity_at', v_last_activity_at,
    'usage_state', v_usage_state,
    'has_open_shift', coalesce(v_has_open_shift, false),
    'open_shift_id', v_open_shift_id,
    'open_shift_kind', v_open_shift_kind,
    'open_shift_business_date', v_open_shift_business_date,
    'open_shift_opened_at', v_open_shift_opened_at,
    'last_shift_closed_at', v_last_shift_closed_at,
    'open_sessions_count', coalesce(v_open_sessions_count, 0),
    'active_staff_count', coalesce(v_active_staff_count, 0),
    'source_updated_at', now(),
    'source_kind', 'runtime_push',
    'notes', jsonb_build_object(
      'producer', 'ops_get_cafe_runtime_status_snapshot',
      'open_sessions_count', coalesce(v_open_sessions_count, 0),
      'active_staff_count', coalesce(v_active_staff_count, 0)
    )
  );
end;
$$;

grant execute on function public.ops_get_cafe_runtime_status_snapshot(uuid) to service_role;

commit;
