begin;

alter table control.cafe_runtime_status_read_model
  add column if not exists operational_last_activity_at timestamptz null,
  add column if not exists last_online_at timestamptz null,
  add column if not exists last_app_opened_at timestamptz null,
  add column if not exists online_users_count integer not null default 0,
  add column if not exists visible_runtime_count integer not null default 0,
  add column if not exists open_sessions_count integer not null default 0,
  add column if not exists active_staff_count integer not null default 0,
  add column if not exists last_open_order_at timestamptz null,
  add column if not exists last_open_order_id uuid null,
  add column if not exists last_open_order_session_id uuid null,
  add column if not exists last_open_order_session_label text null,
  add column if not exists last_open_order_status text null,
  add column if not exists last_open_order_items_count integer not null default 0;

drop function if exists public.control_upsert_cafe_runtime_status_read_model(uuid, text, timestamptz, text, boolean, uuid, text, date, timestamptz, timestamptz, timestamptz, text, jsonb);

create function public.control_upsert_cafe_runtime_status_read_model(
  p_cafe_id uuid,
  p_database_key text default null,
  p_last_activity_at timestamptz default null,
  p_usage_state text default null,
  p_has_open_shift boolean default null,
  p_open_shift_id uuid default null,
  p_open_shift_kind text default null,
  p_open_shift_business_date date default null,
  p_open_shift_opened_at timestamptz default null,
  p_last_shift_closed_at timestamptz default null,
  p_source_updated_at timestamptz default null,
  p_source_kind text default 'runtime_push',
  p_notes jsonb default '{}'::jsonb,
  p_operational_last_activity_at timestamptz default null,
  p_last_online_at timestamptz default null,
  p_last_app_opened_at timestamptz default null,
  p_online_users_count integer default 0,
  p_visible_runtime_count integer default 0,
  p_open_sessions_count integer default 0,
  p_active_staff_count integer default 0,
  p_last_open_order_at timestamptz default null,
  p_last_open_order_id uuid default null,
  p_last_open_order_session_id uuid default null,
  p_last_open_order_session_label text default null,
  p_last_open_order_status text default null,
  p_last_open_order_items_count integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, control, ops
as $$
declare
  v_database_key text := lower(nullif(btrim(p_database_key), ''));
  v_source_kind text := lower(coalesce(nullif(btrim(p_source_kind), ''), 'runtime_push'));
  v_row control.cafe_runtime_status_read_model%rowtype;
begin
  if p_cafe_id is null then
    raise exception 'p_cafe_id is required';
  end if;

  if not exists (select 1 from ops.cafes c where c.id = p_cafe_id) then
    raise exception 'cafe_not_found';
  end if;

  if v_database_key is not null and not exists (
    select 1
    from control.operational_databases od
    where od.database_key = v_database_key
  ) then
    raise exception 'operational_database_not_found';
  end if;

  if v_source_kind not in ('manual_sync', 'runtime_push', 'control_repair') then
    raise exception 'invalid_source_kind';
  end if;

  insert into control.cafe_runtime_status_read_model (
    cafe_id,
    database_key,
    last_activity_at,
    operational_last_activity_at,
    last_online_at,
    last_app_opened_at,
    online_users_count,
    visible_runtime_count,
    usage_state,
    has_open_shift,
    open_shift_id,
    open_shift_kind,
    open_shift_business_date,
    open_shift_opened_at,
    last_shift_closed_at,
    open_sessions_count,
    active_staff_count,
    last_open_order_at,
    last_open_order_id,
    last_open_order_session_id,
    last_open_order_session_label,
    last_open_order_status,
    last_open_order_items_count,
    source_updated_at,
    source_kind,
    notes,
    created_at,
    updated_at
  ) values (
    p_cafe_id,
    v_database_key,
    p_last_activity_at,
    p_operational_last_activity_at,
    p_last_online_at,
    p_last_app_opened_at,
    greatest(coalesce(p_online_users_count, 0), 0),
    greatest(coalesce(p_visible_runtime_count, 0), 0),
    case
      when p_usage_state is null then null
      when lower(btrim(p_usage_state)) in ('active_now', 'active_today', 'active_recently', 'inactive', 'external_runtime') then lower(btrim(p_usage_state))
      else null
    end,
    p_has_open_shift,
    p_open_shift_id,
    nullif(btrim(p_open_shift_kind), ''),
    p_open_shift_business_date,
    p_open_shift_opened_at,
    p_last_shift_closed_at,
    greatest(coalesce(p_open_sessions_count, 0), 0),
    greatest(coalesce(p_active_staff_count, 0), 0),
    p_last_open_order_at,
    p_last_open_order_id,
    p_last_open_order_session_id,
    nullif(btrim(p_last_open_order_session_label), ''),
    nullif(btrim(p_last_open_order_status), ''),
    greatest(coalesce(p_last_open_order_items_count, 0), 0),
    p_source_updated_at,
    v_source_kind,
    coalesce(p_notes, '{}'::jsonb),
    now(),
    now()
  )
  on conflict (cafe_id) do update set
    database_key = excluded.database_key,
    last_activity_at = excluded.last_activity_at,
    operational_last_activity_at = excluded.operational_last_activity_at,
    last_online_at = excluded.last_online_at,
    last_app_opened_at = excluded.last_app_opened_at,
    online_users_count = excluded.online_users_count,
    visible_runtime_count = excluded.visible_runtime_count,
    usage_state = excluded.usage_state,
    has_open_shift = excluded.has_open_shift,
    open_shift_id = excluded.open_shift_id,
    open_shift_kind = excluded.open_shift_kind,
    open_shift_business_date = excluded.open_shift_business_date,
    open_shift_opened_at = excluded.open_shift_opened_at,
    last_shift_closed_at = excluded.last_shift_closed_at,
    open_sessions_count = excluded.open_sessions_count,
    active_staff_count = excluded.active_staff_count,
    last_open_order_at = excluded.last_open_order_at,
    last_open_order_id = excluded.last_open_order_id,
    last_open_order_session_id = excluded.last_open_order_session_id,
    last_open_order_session_label = excluded.last_open_order_session_label,
    last_open_order_status = excluded.last_open_order_status,
    last_open_order_items_count = excluded.last_open_order_items_count,
    source_updated_at = excluded.source_updated_at,
    source_kind = excluded.source_kind,
    notes = excluded.notes,
    updated_at = now()
  returning * into v_row;

  return jsonb_build_object(
    'cafe_id', v_row.cafe_id,
    'database_key', v_row.database_key,
    'last_activity_at', v_row.last_activity_at,
    'operational_last_activity_at', v_row.operational_last_activity_at,
    'last_online_at', v_row.last_online_at,
    'last_app_opened_at', v_row.last_app_opened_at,
    'online_users_count', v_row.online_users_count,
    'visible_runtime_count', v_row.visible_runtime_count,
    'usage_state', v_row.usage_state,
    'has_open_shift', v_row.has_open_shift,
    'open_shift_id', v_row.open_shift_id,
    'open_shift_kind', v_row.open_shift_kind,
    'open_shift_business_date', v_row.open_shift_business_date,
    'open_shift_opened_at', v_row.open_shift_opened_at,
    'last_shift_closed_at', v_row.last_shift_closed_at,
    'open_sessions_count', v_row.open_sessions_count,
    'active_staff_count', v_row.active_staff_count,
    'last_open_order_at', v_row.last_open_order_at,
    'last_open_order_id', v_row.last_open_order_id,
    'last_open_order_session_id', v_row.last_open_order_session_id,
    'last_open_order_session_label', v_row.last_open_order_session_label,
    'last_open_order_status', v_row.last_open_order_status,
    'last_open_order_items_count', v_row.last_open_order_items_count,
    'source_updated_at', v_row.source_updated_at,
    'source_kind', v_row.source_kind,
    'notes', v_row.notes,
    'updated_at', v_row.updated_at
  );
end;
$$;

grant execute on function public.control_upsert_cafe_runtime_status_read_model(uuid, text, timestamptz, text, boolean, uuid, text, date, timestamptz, timestamptz, timestamptz, text, jsonb, timestamptz, timestamptz, timestamptz, integer, integer, integer, integer, timestamptz, uuid, uuid, text, text, integer) to service_role;

create or replace function public.platform_list_cafes()
returns jsonb
language sql
security definer
set search_path = public, ops, platform, control
as $$
  with latest_subscription as (
    select distinct on (s.cafe_id)
      s.cafe_id,
      s.id,
      s.starts_at,
      s.ends_at,
      s.grace_days,
      s.status,
      s.amount_paid,
      s.is_complimentary,
      s.notes,
      s.created_at,
      s.updated_at,
      case
        when s.status = 'suspended' then 'suspended'
        when now() > s.ends_at + make_interval(days => s.grace_days) then 'expired'
        else s.status
      end as effective_status,
      greatest(0, floor(extract(epoch from (s.ends_at - now()))))::bigint as countdown_seconds
    from platform.cafe_subscriptions s
    order by s.cafe_id, s.created_at desc, s.id desc
  ), local_last_activity as (
    select
      activity.cafe_id,
      max(activity.activity_at) as last_activity_at
    from (
      select cafe_id, max(created_at) as activity_at from ops.audit_events group by cafe_id
      union all
      select cafe_id, max(opened_at) as activity_at from ops.shifts group by cafe_id
      union all
      select cafe_id, max(opened_at) as activity_at from ops.service_sessions group by cafe_id
      union all
      select cafe_id, max(created_at) as activity_at from ops.orders group by cafe_id
      union all
      select cafe_id, max(created_at) as activity_at from ops.payments group by cafe_id
      union all
      select cafe_id, max(created_at) as activity_at from ops.complaints group by cafe_id
      union all
      select cafe_id, max(created_at) as activity_at from ops.order_item_issues group by cafe_id
    ) activity
    group by activity.cafe_id
  ), local_presence as (
    select
      rp.cafe_id,
      max(rp.last_seen_at) as last_online_at,
      max(rp.last_app_opened_at) as last_app_opened_at,
      count(distinct rp.runtime_user_id) filter (where rp.last_seen_at >= now() - interval '90 seconds')::integer as online_users_count,
      count(distinct rp.runtime_user_id) filter (where rp.last_visible_at >= now() - interval '90 seconds')::integer as visible_runtime_count
    from ops.runtime_presence rp
    group by rp.cafe_id
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by x.online_now desc, x.last_activity_at desc nulls last, x.created_at desc), '[]'::jsonb)
  from (
    select
      c.id,
      c.slug,
      c.display_name,
      c.is_active,
      c.created_at,
      coalesce(rm.last_activity_at, lp.last_online_at, lp.last_app_opened_at, la.last_activity_at) as last_activity_at,
      coalesce(rm.operational_last_activity_at, la.last_activity_at) as operational_last_activity_at,
      coalesce(rm.last_online_at, lp.last_online_at) as last_online_at,
      coalesce(rm.last_app_opened_at, lp.last_app_opened_at) as last_app_opened_at,
      greatest(coalesce(rm.online_users_count, lp.online_users_count, 0), 0) as online_users_count,
      greatest(coalesce(rm.visible_runtime_count, lp.visible_runtime_count, 0), 0) as visible_runtime_count,
      (greatest(coalesce(rm.online_users_count, lp.online_users_count, 0), 0) > 0) as online_now,
      coalesce(rm.usage_state, case
        when greatest(coalesce(lp.online_users_count, 0), 0) > 0 then 'active_now'
        when la.last_activity_at is not null and la.last_activity_at >= now() - interval '24 hours' then 'active_today'
        when la.last_activity_at is not null and la.last_activity_at >= now() - interval '7 days' then 'active_recently'
        else 'inactive'
      end) as usage_state,
      (
        select count(*)::integer
        from ops.owner_users ou
        where ou.cafe_id = c.id
      ) as owner_count,
      (
        select count(*)::integer
        from ops.owner_users ou
        where ou.cafe_id = c.id
          and ou.is_active = true
      ) as active_owner_count,
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', ou.id,
            'full_name', ou.full_name,
            'phone', ou.phone,
            'owner_label', ou.owner_label,
            'is_active', ou.is_active,
            'created_at', ou.created_at
          ) order by ou.created_at asc
        )
        from ops.owner_users ou
        where ou.cafe_id = c.id
      ), '[]'::jsonb) as owners,
      case
        when ls.cafe_id is null then null
        else jsonb_build_object(
          'id', ls.id,
          'starts_at', ls.starts_at,
          'ends_at', ls.ends_at,
          'grace_days', ls.grace_days,
          'status', ls.status,
          'effective_status', ls.effective_status,
          'amount_paid', ls.amount_paid,
          'is_complimentary', ls.is_complimentary,
          'notes', ls.notes,
          'created_at', ls.created_at,
          'updated_at', ls.updated_at,
          'countdown_seconds', ls.countdown_seconds
        )
      end as current_subscription,
      jsonb_build_object(
        'database_key', b.database_key,
        'binding_source', b.binding_source,
        'binding_updated_at', b.updated_at,
        'runtime_status_available', rm.cafe_id is not null,
        'runtime_status_updated_at', rm.updated_at
      ) as database_binding
    from ops.cafes c
    left join latest_subscription ls on ls.cafe_id = c.id
    left join local_last_activity la on la.cafe_id = c.id
    left join local_presence lp on lp.cafe_id = c.id
    left join control.cafe_database_bindings b on b.cafe_id = c.id
    left join control.cafe_runtime_status_read_model rm
      on rm.cafe_id = c.id
     and (rm.database_key is null or b.database_key is null or rm.database_key = b.database_key)
  ) x;
$$;

create or replace function public.platform_dashboard_overview(
  p_super_admin_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, platform, control
as $$
declare
  v_admin platform.super_admin_users%rowtype;
  v_now timestamptz := now();
  v_capacity_bytes bigint := null;
  v_used_bytes bigint := 0;
begin
  select *
  into v_admin
  from platform.super_admin_users
  where id = p_super_admin_user_id
    and is_active = true;

  if not found then
    raise exception 'active super admin not found';
  end if;

  select case
    when setting_value_text ~ '^[0-9]+$' then setting_value_text::bigint
    else null
  end
  into v_capacity_bytes
  from platform.runtime_settings
  where setting_key = 'database_capacity_bytes';

  v_used_bytes := pg_database_size(current_database());

  return (
    with latest_subscription as (
      select distinct on (s.cafe_id)
        s.cafe_id,
        s.id,
        s.starts_at,
        s.ends_at,
        s.grace_days,
        s.status,
        s.notes,
        s.created_at,
        s.updated_at,
        case
          when s.status = 'suspended' then 'suspended'
          when v_now > s.ends_at + make_interval(days => s.grace_days) then 'expired'
          else s.status
        end as effective_status,
        greatest(0, floor(extract(epoch from (s.ends_at - v_now))))::bigint as countdown_seconds
      from platform.cafe_subscriptions s
      order by s.cafe_id, s.created_at desc, s.id desc
    ),
    owner_counts as (
      select
        ou.cafe_id,
        count(*)::int as owner_count,
        count(*) filter (where ou.is_active)::int as active_owner_count
      from ops.owner_users ou
      group by ou.cafe_id
    ),
    open_shift_now as (
      select
        s.cafe_id,
        true as has_open_shift,
        min(s.business_date) as open_shift_business_date,
        max(s.opened_at) as open_shift_started_at
      from ops.shifts s
      where s.status = 'open'
      group by s.cafe_id
    ),
    local_last_activity as (
      select
        activity.cafe_id,
        max(activity.activity_at) as last_activity_at
      from (
        select cafe_id, max(created_at) as activity_at from ops.audit_events group by cafe_id
        union all
        select cafe_id, max(opened_at) as activity_at from ops.shifts group by cafe_id
        union all
        select cafe_id, max(opened_at) as activity_at from ops.service_sessions group by cafe_id
        union all
        select cafe_id, max(created_at) as activity_at from ops.orders group by cafe_id
        union all
        select cafe_id, max(created_at) as activity_at from ops.payments group by cafe_id
        union all
        select cafe_id, max(created_at) as activity_at from ops.complaints group by cafe_id
        union all
        select cafe_id, max(created_at) as activity_at from ops.order_item_issues group by cafe_id
      ) activity
      group by activity.cafe_id
    ),
    local_presence as (
      select
        rp.cafe_id,
        max(rp.last_seen_at) as last_online_at,
        max(rp.last_app_opened_at) as last_app_opened_at,
        count(distinct rp.runtime_user_id) filter (where rp.last_seen_at >= v_now - interval '90 seconds')::integer as online_users_count,
        count(distinct rp.runtime_user_id) filter (where rp.last_visible_at >= v_now - interval '90 seconds')::integer as visible_runtime_count
      from ops.runtime_presence rp
      group by rp.cafe_id
    ),
    runtime_model as (
      select
        rm.cafe_id,
        rm.last_activity_at,
        rm.operational_last_activity_at,
        rm.last_online_at,
        rm.last_app_opened_at,
        rm.online_users_count,
        rm.visible_runtime_count,
        rm.usage_state,
        rm.has_open_shift,
        rm.open_shift_business_date,
        rm.open_shift_opened_at
      from control.cafe_runtime_status_read_model rm
    ),
    portfolio as (
      select
        c.id,
        c.slug,
        c.display_name,
        c.is_active,
        c.created_at,
        coalesce(oc.owner_count, 0) as owner_count,
        coalesce(oc.active_owner_count, 0) as active_owner_count,
        ls.id as subscription_id,
        ls.starts_at as subscription_starts_at,
        ls.ends_at as subscription_ends_at,
        ls.grace_days as subscription_grace_days,
        ls.status as subscription_status,
        ls.effective_status as subscription_effective_status,
        ls.notes as subscription_notes,
        ls.created_at as subscription_created_at,
        ls.updated_at as subscription_updated_at,
        ls.countdown_seconds as subscription_countdown_seconds,
        case
          when ls.id is null then 'none'
          else ls.effective_status
        end as subscription_state,
        case
          when ls.id is null then 'trial_or_free'
          when ls.effective_status = 'suspended' then 'suspended'
          when ls.effective_status = 'expired' then 'overdue'
          when ls.effective_status = 'trial' then 'trial_or_free'
          else 'paid_current'
        end as payment_state,
        case
          when greatest(coalesce(rm.online_users_count, lp.online_users_count, 0), 0) > 0 then 'active_now'
          when coalesce(rm.has_open_shift, os.has_open_shift, false) then 'active_now'
          when coalesce(rm.last_activity_at, lp.last_online_at, lp.last_app_opened_at, la.last_activity_at) is not null and coalesce(rm.last_activity_at, lp.last_online_at, lp.last_app_opened_at, la.last_activity_at) >= v_now - interval '24 hours' then 'active_today'
          when coalesce(rm.last_activity_at, lp.last_online_at, lp.last_app_opened_at, la.last_activity_at) is not null and coalesce(rm.last_activity_at, lp.last_online_at, lp.last_app_opened_at, la.last_activity_at) >= v_now - interval '7 days' then 'active_recently'
          else 'inactive'
        end as usage_state,
        coalesce(rm.last_activity_at, lp.last_online_at, lp.last_app_opened_at, la.last_activity_at) as last_activity_at,
        coalesce(rm.operational_last_activity_at, la.last_activity_at) as operational_last_activity_at,
        coalesce(rm.last_online_at, lp.last_online_at) as last_online_at,
        coalesce(rm.last_app_opened_at, lp.last_app_opened_at) as last_app_opened_at,
        greatest(coalesce(rm.online_users_count, lp.online_users_count, 0), 0) as online_users_count,
        greatest(coalesce(rm.visible_runtime_count, lp.visible_runtime_count, 0), 0) as visible_runtime_count,
        coalesce(rm.has_open_shift, os.has_open_shift, false) as has_open_shift,
        coalesce(rm.open_shift_business_date, os.open_shift_business_date) as open_shift_business_date,
        coalesce(rm.open_shift_opened_at, os.open_shift_started_at) as open_shift_started_at,
        array_remove(array[
          case when c.is_active = false then 'cafe_disabled' end,
          case when coalesce(oc.active_owner_count, 0) = 0 then 'no_active_owner' end,
          case when ls.id is null then 'no_subscription' end,
          case when ls.effective_status = 'expired'
            and (coalesce(rm.has_open_shift, os.has_open_shift, false) or (coalesce(rm.last_activity_at, lp.last_online_at, lp.last_app_opened_at, la.last_activity_at) is not null and coalesce(rm.last_activity_at, lp.last_online_at, lp.last_app_opened_at, la.last_activity_at) >= v_now - interval '7 days'))
            then 'expired_but_active'
          end,
          case when ls.effective_status = 'suspended'
            and (coalesce(rm.has_open_shift, os.has_open_shift, false) or (coalesce(rm.last_activity_at, lp.last_online_at, lp.last_app_opened_at, la.last_activity_at) is not null and coalesce(rm.last_activity_at, lp.last_online_at, lp.last_app_opened_at, la.last_activity_at) >= v_now - interval '7 days'))
            then 'suspended_but_active'
          end,
          case when coalesce(rm.has_open_shift, os.has_open_shift, false) and coalesce(rm.open_shift_opened_at, os.open_shift_started_at) <= v_now - interval '18 hours' then 'open_shift_too_long' end,
          case when ls.effective_status = 'active'
            and coalesce(rm.has_open_shift, os.has_open_shift, false) = false
            and (coalesce(rm.last_activity_at, lp.last_online_at, lp.last_app_opened_at, la.last_activity_at) is null or coalesce(rm.last_activity_at, lp.last_online_at, lp.last_app_opened_at, la.last_activity_at) < v_now - interval '14 days')
            and c.created_at <= v_now - interval '14 days'
            then 'paid_but_inactive'
          end
        ], null::text) as attention_reasons
      from ops.cafes c
      left join owner_counts oc on oc.cafe_id = c.id
      left join latest_subscription ls on ls.cafe_id = c.id
      left join open_shift_now os on os.cafe_id = c.id
      left join local_last_activity la on la.cafe_id = c.id
      left join local_presence lp on lp.cafe_id = c.id
      left join runtime_model rm on rm.cafe_id = c.id
    )
    select jsonb_build_object(
      'generated_at', v_now,
      'database_usage', jsonb_build_object(
        'used_bytes', v_used_bytes,
        'used_pretty', pg_size_pretty(v_used_bytes),
        'capacity_bytes', v_capacity_bytes,
        'capacity_pretty', case when v_capacity_bytes is null then null else pg_size_pretty(v_capacity_bytes) end,
        'usage_percent', case when v_capacity_bytes is null or v_capacity_bytes = 0 then null else round((v_used_bytes::numeric / v_capacity_bytes::numeric) * 100, 2) end,
        'database_name', current_database()
      ),
      'summary', jsonb_build_object(
        'cafes_total', (select count(*)::int from portfolio),
        'cafes_active', (select count(*)::int from portfolio where is_active),
        'paid_current', (select count(*)::int from portfolio where payment_state = 'paid_current'),
        'trial_or_free', (select count(*)::int from portfolio where payment_state = 'trial_or_free'),
        'overdue', (select count(*)::int from portfolio where payment_state = 'overdue'),
        'suspended', (select count(*)::int from portfolio where payment_state = 'suspended'),
        'no_subscription', (select count(*)::int from portfolio where subscription_state = 'none'),
        'active_now', (select count(*)::int from portfolio where usage_state = 'active_now'),
        'active_today', (select count(*)::int from portfolio where usage_state = 'active_today'),
        'inactive', (select count(*)::int from portfolio where usage_state = 'inactive'),
        'needs_attention', (select count(*)::int from portfolio where coalesce(array_length(attention_reasons, 1), 0) > 0),
        'open_shifts_now', (select count(*)::int from portfolio where has_open_shift)
      ),
      'cafes', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'slug', p.slug,
            'display_name', p.display_name,
            'is_active', p.is_active,
            'created_at', p.created_at,
            'owner_count', p.owner_count,
            'active_owner_count', p.active_owner_count,
            'current_subscription', case
              when p.subscription_id is null then null
              else jsonb_build_object(
                'id', p.subscription_id,
                'starts_at', p.subscription_starts_at,
                'ends_at', p.subscription_ends_at,
                'grace_days', p.subscription_grace_days,
                'status', p.subscription_status,
                'effective_status', p.subscription_effective_status,
                'notes', p.subscription_notes,
                'created_at', p.subscription_created_at,
                'updated_at', p.subscription_updated_at,
                'countdown_seconds', p.subscription_countdown_seconds
              )
            end,
            'subscription_state', p.subscription_state,
            'payment_state', p.payment_state,
            'usage_state', p.usage_state,
            'last_activity_at', p.last_activity_at,
            'operational_last_activity_at', p.operational_last_activity_at,
            'last_online_at', p.last_online_at,
            'last_app_opened_at', p.last_app_opened_at,
            'online_users_count', p.online_users_count,
            'visible_runtime_count', p.visible_runtime_count,
            'has_open_shift', p.has_open_shift,
            'open_shift_business_date', p.open_shift_business_date,
            'open_shift_started_at', p.open_shift_started_at,
            'attention_reasons', to_jsonb(p.attention_reasons)
          )
          order by p.last_activity_at desc nulls last, p.created_at desc
        )
        from portfolio p
      ), '[]'::jsonb),
      'attention_queue', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'slug', p.slug,
            'display_name', p.display_name,
            'usage_state', p.usage_state,
            'payment_state', p.payment_state,
            'last_activity_at', p.last_activity_at,
            'attention_reasons', to_jsonb(p.attention_reasons)
          )
          order by p.last_activity_at desc nulls last, p.created_at desc
        )
        from portfolio p
        where coalesce(array_length(p.attention_reasons, 1), 0) > 0
      ), '[]'::jsonb)
    )
  );
end;
$$;

create or replace function public.platform_get_cafe_detail(
  p_super_admin_user_id uuid,
  p_cafe_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, platform, control
as $$
declare
  v_admin platform.super_admin_users%rowtype;
  v_cafe ops.cafes%rowtype;
  v_now timestamptz := now();
  v_result jsonb;
begin
  select *
  into v_admin
  from platform.super_admin_users
  where id = p_super_admin_user_id
    and is_active = true;

  if not found then
    raise exception 'active super admin not found';
  end if;

  select *
  into v_cafe
  from ops.cafes
  where id = p_cafe_id;

  if not found then
    raise exception 'cafe_not_found';
  end if;

  with binding_row as (
    select
      b.cafe_id,
      b.database_key,
      b.binding_source,
      b.created_at,
      b.updated_at
    from control.cafe_database_bindings b
    where b.cafe_id = p_cafe_id
    limit 1
  ), latest_subscription as (
    select distinct on (s.cafe_id)
      s.cafe_id,
      s.id,
      s.starts_at,
      s.ends_at,
      s.grace_days,
      s.status,
      s.amount_paid,
      s.is_complimentary,
      s.notes,
      s.created_at,
      s.updated_at,
      case
        when s.status = 'suspended' then 'suspended'
        when v_now > s.ends_at + make_interval(days => s.grace_days) then 'expired'
        else s.status
      end as effective_status,
      greatest(0, floor(extract(epoch from (s.ends_at - v_now))))::bigint as countdown_seconds
    from platform.cafe_subscriptions s
    where s.cafe_id = p_cafe_id
    order by s.cafe_id, s.created_at desc, s.id desc
  ), owner_rows as (
    select
      ou.id,
      ou.full_name,
      ou.phone,
      ou.owner_label,
      ou.is_active,
      ou.created_at
    from ops.owner_users ou
    where ou.cafe_id = p_cafe_id
    order by ou.created_at asc
  ), local_last_activity as (
    select max(activity_at) as last_activity_at
    from (
      select max(created_at) as activity_at from ops.audit_events where cafe_id = p_cafe_id
      union all
      select max(opened_at) as activity_at from ops.shifts where cafe_id = p_cafe_id
      union all
      select max(opened_at) as activity_at from ops.service_sessions where cafe_id = p_cafe_id
      union all
      select max(created_at) as activity_at from ops.orders where cafe_id = p_cafe_id
      union all
      select max(created_at) as activity_at from ops.payments where cafe_id = p_cafe_id
      union all
      select max(created_at) as activity_at from ops.complaints where cafe_id = p_cafe_id
      union all
      select max(created_at) as activity_at from ops.order_item_issues where cafe_id = p_cafe_id
    ) activity
  ), local_presence as (
    select
      max(rp.last_seen_at) as last_online_at,
      max(rp.last_app_opened_at) as last_app_opened_at,
      count(distinct rp.runtime_user_id) filter (where rp.last_seen_at >= v_now - interval '90 seconds')::integer as online_users_count,
      count(distinct rp.runtime_user_id) filter (where rp.last_visible_at >= v_now - interval '90 seconds')::integer as visible_runtime_count
    from ops.runtime_presence rp
    where rp.cafe_id = p_cafe_id
  ), local_open_shift as (
    select
      s.id,
      s.shift_kind,
      s.business_date,
      s.opened_at
    from ops.shifts s
    where s.cafe_id = p_cafe_id
      and s.status = 'open'
    order by s.business_date desc, s.opened_at desc nulls last
    limit 1
  ), local_open_sessions as (
    select count(*)::integer as open_sessions_count
    from ops.service_sessions ss
    where ss.cafe_id = p_cafe_id
      and ss.closed_at is null
  ), local_last_open_order as (
    select
      o.created_at as last_open_order_at,
      o.id as last_open_order_id,
      o.service_session_id as last_open_order_session_id,
      ss.session_label as last_open_order_session_label,
      o.status as last_open_order_status,
      count(oi.id)::integer as last_open_order_items_count
    from ops.orders o
    join ops.service_sessions ss
      on ss.cafe_id = o.cafe_id
     and ss.id = o.service_session_id
     and ss.closed_at is null
     and ss.status = 'open'
    left join ops.order_items oi
      on oi.cafe_id = o.cafe_id
     and oi.order_id = o.id
    where o.cafe_id = p_cafe_id
      and o.status <> 'cancelled'
    group by o.created_at, o.id, o.service_session_id, ss.session_label, o.status
    order by o.created_at desc, o.id desc
    limit 1
  ), runtime_model as (
    select
      rm.cafe_id,
      rm.database_key,
      rm.last_activity_at,
      rm.operational_last_activity_at,
      rm.last_online_at,
      rm.last_app_opened_at,
      rm.online_users_count,
      rm.visible_runtime_count,
      rm.usage_state,
      rm.has_open_shift,
      rm.open_shift_id,
      rm.open_shift_kind,
      rm.open_shift_business_date,
      rm.open_shift_opened_at,
      rm.last_shift_closed_at,
      rm.open_sessions_count,
      rm.active_staff_count,
      rm.last_open_order_at,
      rm.last_open_order_id,
      rm.last_open_order_session_id,
      rm.last_open_order_session_label,
      rm.last_open_order_status,
      rm.last_open_order_items_count,
      rm.source_updated_at,
      rm.source_kind,
      rm.notes,
      rm.updated_at
    from control.cafe_runtime_status_read_model rm
    where rm.cafe_id = p_cafe_id
      and (not exists (select 1 from binding_row br) or rm.database_key is null or rm.database_key = (select br.database_key from binding_row br limit 1))
    limit 1
  ), active_support_access as (
    select
      g.support_message_id,
      g.expires_at,
      m.status as message_status,
      m.issue_type
    from platform.support_access_grants g
    left join platform.support_messages m on m.id = g.support_message_id
    where g.super_admin_user_id = p_super_admin_user_id
      and g.cafe_id = p_cafe_id
      and g.is_active = true
      and g.revoked_at is null
      and (g.expires_at is null or g.expires_at > v_now)
    order by g.created_at desc, g.id desc
    limit 1
  ), effective_activity as (
    select
      coalesce((select rm.last_activity_at from runtime_model rm), (select lp.last_online_at from local_presence lp), (select lp.last_app_opened_at from local_presence lp), (select lla.last_activity_at from local_last_activity lla)) as last_activity_at,
      coalesce((select rm.operational_last_activity_at from runtime_model rm), (select lla.last_activity_at from local_last_activity lla)) as operational_last_activity_at,
      coalesce((select rm.last_online_at from runtime_model rm), (select lp.last_online_at from local_presence lp)) as last_online_at,
      coalesce((select rm.last_app_opened_at from runtime_model rm), (select lp.last_app_opened_at from local_presence lp)) as last_app_opened_at,
      greatest(coalesce((select rm.online_users_count from runtime_model rm), (select lp.online_users_count from local_presence lp), 0), 0) as online_users_count,
      greatest(coalesce((select rm.visible_runtime_count from runtime_model rm), (select lp.visible_runtime_count from local_presence lp), 0), 0) as visible_runtime_count,
      coalesce((select rm.has_open_shift from runtime_model rm), exists(select 1 from local_open_shift)) as has_open_shift,
      coalesce((select rm.last_shift_closed_at from runtime_model rm), (select max(s.closed_at) from ops.shifts s where s.cafe_id = p_cafe_id and s.status = 'closed')) as last_shift_closed_at,
      coalesce((select rm.open_sessions_count from runtime_model rm), (select los.open_sessions_count from local_open_sessions los), 0) as open_sessions_count,
      coalesce((select rm.active_staff_count from runtime_model rm), 0) as active_staff_count,
      coalesce((select rm.usage_state from runtime_model rm), case
        when greatest(coalesce((select rm.online_users_count from runtime_model rm), (select lp.online_users_count from local_presence lp), 0), 0) > 0 then 'active_now'
        when exists(select 1 from local_open_shift) then 'active_now'
        when coalesce((select rm.last_activity_at from runtime_model rm), (select lp.last_online_at from local_presence lp), (select lp.last_app_opened_at from local_presence lp), (select lla.last_activity_at from local_last_activity lla)) is not null and coalesce((select rm.last_activity_at from runtime_model rm), (select lp.last_online_at from local_presence lp), (select lp.last_app_opened_at from local_presence lp), (select lla.last_activity_at from local_last_activity lla)) >= v_now - interval '24 hours' then 'active_today'
        when coalesce((select rm.last_activity_at from runtime_model rm), (select lp.last_online_at from local_presence lp), (select lp.last_app_opened_at from local_presence lp), (select lla.last_activity_at from local_last_activity lla)) is not null and coalesce((select rm.last_activity_at from runtime_model rm), (select lp.last_online_at from local_presence lp), (select lp.last_app_opened_at from local_presence lp), (select lla.last_activity_at from local_last_activity lla)) >= v_now - interval '7 days' then 'active_recently'
        else 'inactive'
      end) as usage_state
  ), attention as (
    select array_remove(array[
      case when v_cafe.is_active = false then 'cafe_disabled' end,
      case when (select count(*) from owner_rows where is_active = true) = 0 then 'no_active_owner' end,
      case when (select count(*) from latest_subscription) = 0 then 'no_subscription' end,
      case when exists (select 1 from latest_subscription ls where ls.effective_status = 'expired')
        and (coalesce((select has_open_shift from effective_activity), false) or ((select last_activity_at from effective_activity) is not null and (select last_activity_at from effective_activity) >= v_now - interval '7 days'))
        then 'expired_but_active'
      end,
      case when exists (select 1 from latest_subscription ls where ls.effective_status = 'suspended')
        and (coalesce((select has_open_shift from effective_activity), false) or ((select last_activity_at from effective_activity) is not null and (select last_activity_at from effective_activity) >= v_now - interval '7 days'))
        then 'suspended_but_active'
      end,
      case when coalesce((select has_open_shift from effective_activity), false)
        and coalesce((select open_shift_opened_at from runtime_model), (select opened_at from local_open_shift)) <= v_now - interval '18 hours' then 'open_shift_too_long' end,
      case when exists (select 1 from latest_subscription ls where ls.effective_status = 'active')
        and not coalesce((select has_open_shift from effective_activity), false)
        and ((select last_activity_at from effective_activity) is null or (select last_activity_at from effective_activity) < v_now - interval '14 days')
        and v_cafe.created_at <= v_now - interval '14 days'
        then 'paid_but_inactive'
      end
    ], null::text) as reasons
  )
  select jsonb_build_object(
    'generated_at', v_now,
    'cafe', jsonb_build_object(
      'id', v_cafe.id,
      'slug', v_cafe.slug,
      'display_name', v_cafe.display_name,
      'is_active', v_cafe.is_active,
      'created_at', v_cafe.created_at,
      'owner_count', (select count(*)::int from owner_rows),
      'active_owner_count', (select count(*)::int from owner_rows where is_active = true),
      'owners', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', r.id,
            'full_name', r.full_name,
            'phone', r.phone,
            'owner_label', r.owner_label,
            'is_active', r.is_active,
            'created_at', r.created_at
          )
          order by r.created_at asc
        )
        from owner_rows r
      ), '[]'::jsonb)
    ),
    'database_binding', (
      select jsonb_build_object(
        'database_key', br.database_key,
        'binding_source', br.binding_source,
        'created_at', br.created_at,
        'updated_at', br.updated_at,
        'runtime_status_available', exists(select 1 from runtime_model),
        'runtime_status_updated_at', (select rm.updated_at from runtime_model rm),
        'runtime_status_source_kind', (select rm.source_kind from runtime_model rm),
        'runtime_status_source_updated_at', (select rm.source_updated_at from runtime_model rm)
      )
      from binding_row br
    ),
    'subscription', jsonb_build_object(
      'current', (
        select case
          when ls.id is null then null
          else jsonb_build_object(
            'id', ls.id,
            'starts_at', ls.starts_at,
            'ends_at', ls.ends_at,
            'grace_days', ls.grace_days,
            'status', ls.status,
            'effective_status', ls.effective_status,
            'amount_paid', ls.amount_paid,
            'is_complimentary', ls.is_complimentary,
            'notes', ls.notes,
            'created_at', ls.created_at,
            'updated_at', ls.updated_at,
            'countdown_seconds', ls.countdown_seconds
          )
        end
        from latest_subscription ls
      ),
      'history', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', s.id,
            'starts_at', s.starts_at,
            'ends_at', s.ends_at,
            'grace_days', s.grace_days,
            'status', s.status,
            'effective_status', case
              when s.status = 'suspended' then 'suspended'
              when v_now > s.ends_at + make_interval(days => s.grace_days) then 'expired'
              else s.status
            end,
            'amount_paid', s.amount_paid,
            'is_complimentary', s.is_complimentary,
            'notes', s.notes,
            'created_at', s.created_at,
            'updated_at', s.updated_at,
            'countdown_seconds', greatest(0, floor(extract(epoch from (s.ends_at - v_now))))::bigint
          )
          order by s.created_at desc, s.id desc
        )
        from (
          select *
          from platform.cafe_subscriptions s
          where s.cafe_id = p_cafe_id
          order by s.created_at desc, s.id desc
          limit 12
        ) s
      ), '[]'::jsonb)
    ),
    'activity', jsonb_build_object(
      'last_activity_at', (select last_activity_at from effective_activity),
      'operational_last_activity_at', (select operational_last_activity_at from effective_activity),
      'last_online_at', (select last_online_at from effective_activity),
      'last_app_opened_at', (select last_app_opened_at from effective_activity),
      'online_now', ((select online_users_count from effective_activity) > 0),
      'online_users_count', (select online_users_count from effective_activity),
      'visible_runtime_count', (select visible_runtime_count from effective_activity),
      'open_sessions_count', (select open_sessions_count from effective_activity),
      'active_staff_count', (select active_staff_count from effective_activity),
      'usage_state', (select usage_state from effective_activity),
      'has_open_shift', (select has_open_shift from effective_activity),
      'open_shift', (
        select case
          when rm.open_shift_id is not null then jsonb_build_object(
            'id', rm.open_shift_id,
            'shift_kind', rm.open_shift_kind,
            'business_date', rm.open_shift_business_date,
            'opened_at', rm.open_shift_opened_at
          )
          when los.id is not null then jsonb_build_object(
            'id', los.id,
            'shift_kind', los.shift_kind,
            'business_date', los.business_date,
            'opened_at', los.opened_at
          )
          else null
        end
        from runtime_model rm
        full outer join local_open_shift los on true
        limit 1
      ),
      'last_shift_closed_at', (select last_shift_closed_at from effective_activity),
      'read_model', jsonb_build_object(
        'source', case when exists(select 1 from runtime_model) then 'control.cafe_runtime_status_read_model' else 'local_ops_tables' end,
        'runtime_status_available', exists(select 1 from runtime_model),
        'runtime_status_updated_at', (select rm.updated_at from runtime_model rm),
        'runtime_status_source_updated_at', (select rm.source_updated_at from runtime_model rm),
        'notes', coalesce((select rm.notes from runtime_model rm), '{}'::jsonb)
      )
    ),
    'last_open_order', (
      select case
        when coalesce(rm.last_open_order_id, loo.last_open_order_id) is null then null
        else jsonb_build_object(
          'id', coalesce(rm.last_open_order_id, loo.last_open_order_id),
          'created_at', coalesce(rm.last_open_order_at, loo.last_open_order_at),
          'service_session_id', coalesce(rm.last_open_order_session_id, loo.last_open_order_session_id),
          'session_label', coalesce(rm.last_open_order_session_label, loo.last_open_order_session_label),
          'status', coalesce(rm.last_open_order_status, loo.last_open_order_status),
          'items_count', coalesce(rm.last_open_order_items_count, loo.last_open_order_items_count, 0)
        )
      end
      from runtime_model rm
      full outer join local_last_open_order loo on true
      limit 1
    ),
    'support_access', jsonb_build_object(
      'active_message_id', (select asa.support_message_id from active_support_access asa),
      'expires_at', (select asa.expires_at from active_support_access asa),
      'message_status', (select asa.message_status from active_support_access asa),
      'issue_type', (select asa.issue_type from active_support_access asa)
    ),
    'billing_follow', jsonb_build_object(
      'payment_state', case
        when (select count(*) from latest_subscription) = 0 then 'trial_or_free'
        when exists (select 1 from latest_subscription ls where ls.effective_status = 'suspended') then 'suspended'
        when exists (select 1 from latest_subscription ls where ls.effective_status = 'expired') then 'overdue'
        when exists (select 1 from latest_subscription ls where ls.effective_status = 'trial') then 'trial_or_free'
        else 'paid_current'
      end,
      'current_subscription_effective_status', (select effective_status from latest_subscription limit 1),
      'subscription_expires_at', (select ends_at from latest_subscription limit 1)
    ),
    'attention', jsonb_build_object(
      'reasons', to_jsonb((select reasons from attention)),
      'scope', 'administrative_only'
    )
  ) into v_result;

  return v_result;
end;
$$;

commit;
