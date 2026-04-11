begin;

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
      greatest(coalesce(rm.open_sessions_count, 0), 0) as open_sessions_count,
      greatest(coalesce(rm.active_staff_count, 0), 0) as active_staff_count,
      rm.last_open_order_at,
      rm.last_open_order_id,
      rm.last_open_order_session_id,
      rm.last_open_order_session_label,
      rm.last_open_order_status,
      greatest(coalesce(rm.last_open_order_items_count, 0), 0) as last_open_order_items_count,
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
        rm.open_sessions_count,
        rm.active_staff_count,
        rm.last_open_order_at,
        rm.last_open_order_id,
        rm.last_open_order_session_id,
        rm.last_open_order_session_label,
        rm.last_open_order_status,
        rm.last_open_order_items_count,
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
        greatest(coalesce(rm.open_sessions_count, 0), 0) as open_sessions_count,
        greatest(coalesce(rm.active_staff_count, 0), 0) as active_staff_count,
        rm.last_open_order_at,
        rm.last_open_order_id,
        rm.last_open_order_session_id,
        rm.last_open_order_session_label,
        rm.last_open_order_status,
        greatest(coalesce(rm.last_open_order_items_count, 0), 0) as last_open_order_items_count,
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
            'open_sessions_count', p.open_sessions_count,
            'active_staff_count', p.active_staff_count,
            'last_open_order_at', p.last_open_order_at,
            'last_open_order_id', p.last_open_order_id,
            'last_open_order_session_id', p.last_open_order_session_id,
            'last_open_order_session_label', p.last_open_order_session_label,
            'last_open_order_status', p.last_open_order_status,
            'last_open_order_items_count', p.last_open_order_items_count,
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

commit;
