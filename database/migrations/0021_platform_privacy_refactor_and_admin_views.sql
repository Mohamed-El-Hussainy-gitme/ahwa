begin;

create or replace function public.platform_dashboard_overview(
  p_super_admin_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, platform
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
    last_activity as (
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
          when coalesce(os.has_open_shift, false) then 'active_now'
          when la.last_activity_at is not null and la.last_activity_at >= v_now - interval '24 hours' then 'active_today'
          when la.last_activity_at is not null and la.last_activity_at >= v_now - interval '7 days' then 'active_recently'
          else 'inactive'
        end as usage_state,
        la.last_activity_at,
        coalesce(os.has_open_shift, false) as has_open_shift,
        os.open_shift_business_date,
        os.open_shift_started_at,
        array_remove(array[
          case when c.is_active = false then 'cafe_disabled' end,
          case when coalesce(oc.active_owner_count, 0) = 0 then 'no_active_owner' end,
          case when ls.id is null then 'no_subscription' end,
          case when ls.effective_status = 'expired'
            and (coalesce(os.has_open_shift, false) or (la.last_activity_at is not null and la.last_activity_at >= v_now - interval '7 days'))
            then 'expired_but_active'
          end,
          case when ls.effective_status = 'suspended'
            and (coalesce(os.has_open_shift, false) or (la.last_activity_at is not null and la.last_activity_at >= v_now - interval '7 days'))
            then 'suspended_but_active'
          end,
          case when coalesce(os.has_open_shift, false) and os.open_shift_started_at <= v_now - interval '18 hours' then 'open_shift_too_long' end,
          case when ls.effective_status = 'active'
            and coalesce(os.has_open_shift, false) = false
            and (la.last_activity_at is null or la.last_activity_at < v_now - interval '14 days')
            and c.created_at <= v_now - interval '14 days'
            then 'paid_but_inactive'
          end
        ], null::text) as attention_reasons
      from ops.cafes c
      left join owner_counts oc
        on oc.cafe_id = c.id
      left join latest_subscription ls
        on ls.cafe_id = c.id
      left join open_shift_now os
        on os.cafe_id = c.id
      left join last_activity la
        on la.cafe_id = c.id
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
set search_path = public, ops, platform
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
    where s.cafe_id = p_cafe_id
    order by s.cafe_id, s.created_at desc, s.id desc
  ),
  owner_rows as (
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
  ),
  last_activity as (
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
  ),
  open_shift as (
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
  ),
  usage_state as (
    select case
      when exists(select 1 from open_shift) then 'active_now'
      when (select last_activity_at from last_activity) is not null and (select last_activity_at from last_activity) >= v_now - interval '24 hours' then 'active_today'
      when (select last_activity_at from last_activity) is not null and (select last_activity_at from last_activity) >= v_now - interval '7 days' then 'active_recently'
      else 'inactive'
    end as value
  ),
  attention as (
    select array_remove(array[
      case when v_cafe.is_active = false then 'cafe_disabled' end,
      case when (select count(*) from owner_rows where is_active = true) = 0 then 'no_active_owner' end,
      case when (select count(*) from latest_subscription) = 0 then 'no_subscription' end,
      case when exists (select 1 from latest_subscription ls where ls.effective_status = 'expired')
        and (exists (select 1 from open_shift) or ((select last_activity_at from last_activity) is not null and (select last_activity_at from last_activity) >= v_now - interval '7 days'))
        then 'expired_but_active'
      end,
      case when exists (select 1 from latest_subscription ls where ls.effective_status = 'suspended')
        and (exists (select 1 from open_shift) or ((select last_activity_at from last_activity) is not null and (select last_activity_at from last_activity) >= v_now - interval '7 days'))
        then 'suspended_but_active'
      end,
      case when exists (select 1 from open_shift os where os.opened_at <= v_now - interval '18 hours') then 'open_shift_too_long' end,
      case when exists (select 1 from latest_subscription ls where ls.effective_status = 'active')
        and not exists (select 1 from open_shift)
        and ((select last_activity_at from last_activity) is null or (select last_activity_at from last_activity) < v_now - interval '14 days')
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
      'last_activity_at', (select last_activity_at from last_activity),
      'usage_state', (select value from usage_state),
      'has_open_shift', exists(select 1 from open_shift),
      'open_shift', (
        select case
          when os.id is null then null
          else jsonb_build_object(
            'id', os.id,
            'shift_kind', os.shift_kind,
            'business_date', os.business_date,
            'opened_at', os.opened_at
          )
        end
        from open_shift os
      ),
      'last_shift_closed_at', (
        select max(s.closed_at)
        from ops.shifts s
        where s.cafe_id = p_cafe_id
          and s.status = 'closed'
      )
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
