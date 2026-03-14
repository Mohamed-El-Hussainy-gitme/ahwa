begin;

create table if not exists platform.runtime_settings (
  setting_key text primary key,
  setting_value_text text,
  updated_by_super_admin_user_id uuid references platform.super_admin_users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create or replace function public.platform_set_database_capacity_bytes(
  p_super_admin_user_id uuid,
  p_database_capacity_bytes bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, platform
as $$
declare
  v_admin platform.super_admin_users%rowtype;
  v_capacity bigint;
begin
  select *
  into v_admin
  from platform.super_admin_users
  where id = p_super_admin_user_id
    and is_active = true;

  if not found then
    raise exception 'active super admin not found';
  end if;

  if p_database_capacity_bytes is not null and p_database_capacity_bytes <= 0 then
    raise exception 'p_database_capacity_bytes must be null or > 0';
  end if;

  v_capacity := p_database_capacity_bytes;

  if v_capacity is null then
    delete from platform.runtime_settings
    where setting_key = 'database_capacity_bytes';
  else
    insert into platform.runtime_settings (
      setting_key,
      setting_value_text,
      updated_by_super_admin_user_id,
      updated_at
    )
    values (
      'database_capacity_bytes',
      v_capacity::text,
      p_super_admin_user_id,
      now()
    )
    on conflict (setting_key)
    do update set
      setting_value_text = excluded.setting_value_text,
      updated_by_super_admin_user_id = excluded.updated_by_super_admin_user_id,
      updated_at = excluded.updated_at;
  end if;

  return jsonb_build_object(
    'database_capacity_bytes', v_capacity,
    'database_capacity_pretty', case when v_capacity is null then null else pg_size_pretty(v_capacity) end
  );
end;
$$;

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
  v_today date := timezone('Africa/Cairo', now())::date;
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
        count(*) filter (where ou.is_active)::int as active_owner_count,
        jsonb_agg(
          jsonb_build_object(
            'id', ou.id,
            'full_name', ou.full_name,
            'phone', ou.phone,
            'owner_label', ou.owner_label,
            'is_active', ou.is_active,
            'created_at', ou.created_at
          )
          order by ou.created_at asc
        ) as owners
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
    shift_days as (
      select
        s.cafe_id,
        count(distinct s.business_date) filter (where s.business_date between v_today - 6 and v_today)::int as usage_days_7,
        count(distinct s.business_date) filter (where s.business_date between v_today - 29 and v_today)::int as usage_days_30,
        count(*) filter (where s.business_date = v_today)::int as shifts_today
      from ops.shifts s
      group by s.cafe_id
    ),
    session_metrics as (
      select
        s.cafe_id,
        count(ss.id) filter (where s.business_date = v_today)::int as sessions_today
      from ops.shifts s
      join ops.service_sessions ss
        on ss.cafe_id = s.cafe_id
       and ss.shift_id = s.id
      group by s.cafe_id
    ),
    item_metrics as (
      select
        s.cafe_id,
        coalesce(sum((oi.qty_delivered + oi.qty_replacement_delivered)) filter (where s.business_date = v_today), 0)::int as served_qty_today,
        coalesce(sum((oi.qty_paid + oi.qty_deferred) * oi.unit_price) filter (where s.business_date = v_today), 0)::numeric(12,2) as net_sales_today,
        coalesce(sum(oi.qty_remade) filter (where s.business_date = v_today), 0)::int as remake_qty_today,
        coalesce(sum(oi.qty_cancelled) filter (where s.business_date = v_today), 0)::int as cancelled_qty_today
      from ops.shifts s
      join ops.order_items oi
        on oi.cafe_id = s.cafe_id
       and oi.shift_id = s.id
      group by s.cafe_id
    ),
    complaint_metrics as (
      select
        s.cafe_id,
        count(c.id) filter (where s.business_date = v_today)::int as complaints_today,
        count(c.id) filter (where c.status = 'open')::int as open_complaints_count
      from ops.shifts s
      join ops.complaints c
        on c.cafe_id = s.cafe_id
       and c.shift_id = s.id
      group by s.cafe_id
    ),
    active_staff_today as (
      select
        s.cafe_id,
        count(distinct coalesce(a.staff_member_id::text, 'owner:' || a.owner_user_id::text))::int as active_staff_today
      from ops.shifts s
      join ops.shift_role_assignments a
        on a.cafe_id = s.cafe_id
       and a.shift_id = s.id
      where s.business_date = v_today
        and a.is_active = true
      group by s.cafe_id
    ),
    deferred_balances as (
      select
        dle.cafe_id,
        coalesce(sum(
          case dle.entry_kind
            when 'debt' then dle.amount
            when 'repayment' then -dle.amount
            else 0
          end
        ), 0)::numeric(12,2) as deferred_outstanding
      from ops.deferred_ledger_entries dle
      group by dle.cafe_id
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
        select cafe_id, max(created_at) as activity_at from ops.fulfillment_events group by cafe_id
        union all
        select cafe_id, max(created_at) as activity_at from ops.payments group by cafe_id
        union all
        select cafe_id, max(created_at) as activity_at from ops.complaints group by cafe_id
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
        coalesce(oc.owners, '[]'::jsonb) as owners,
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
        coalesce(os.has_open_shift, false) as has_open_shift,
        os.open_shift_business_date,
        os.open_shift_started_at,
        coalesce(sd.usage_days_7, 0) as usage_days_7,
        coalesce(sd.usage_days_30, 0) as usage_days_30,
        coalesce(sd.shifts_today, 0) as shifts_today,
        coalesce(sm.sessions_today, 0) as sessions_today,
        coalesce(im.served_qty_today, 0) as served_qty_today,
        coalesce(im.net_sales_today, 0)::numeric(12,2) as net_sales_today,
        coalesce(im.remake_qty_today, 0) as remake_qty_today,
        coalesce(im.cancelled_qty_today, 0) as cancelled_qty_today,
        coalesce(cm.complaints_today, 0) as complaints_today,
        coalesce(cm.open_complaints_count, 0) as open_complaints_count,
        coalesce(ast.active_staff_today, 0) as active_staff_today,
        coalesce(db.deferred_outstanding, 0)::numeric(12,2) as deferred_outstanding,
        la.last_activity_at,
        case
          when ls.cafe_id is null then 'none'
          else ls.effective_status
        end as subscription_state,
        case
          when ls.cafe_id is null then 'trial_or_free'
          when ls.effective_status = 'active' then 'paid_current'
          when ls.effective_status = 'expired' then 'overdue'
          when ls.effective_status = 'suspended' then 'suspended'
          else 'trial_or_free'
        end as payment_state,
        case
          when coalesce(os.has_open_shift, false) then 'active_now'
          when coalesce(sd.shifts_today, 0) > 0
            or coalesce(sm.sessions_today, 0) > 0
            or coalesce(im.served_qty_today, 0) > 0
            or coalesce(cm.complaints_today, 0) > 0 then 'active_today'
          when la.last_activity_at is not null and la.last_activity_at >= v_now - interval '7 days' then 'active_recently'
          else 'inactive'
        end as usage_state,
        array_remove(array[
          case when c.is_active = false then 'cafe_disabled' end,
          case when coalesce(oc.active_owner_count, 0) = 0 then 'no_active_owner' end,
          case when ls.cafe_id is null then 'no_subscription' end,
          case when ls.effective_status = 'expired'
            and (coalesce(os.has_open_shift, false) or coalesce(sd.usage_days_7, 0) > 0 or (la.last_activity_at is not null and la.last_activity_at >= v_now - interval '7 days'))
            then 'expired_but_active' end,
          case when ls.effective_status = 'suspended'
            and (coalesce(os.has_open_shift, false) or (la.last_activity_at is not null and la.last_activity_at >= v_now - interval '7 days'))
            then 'suspended_but_active' end,
          case when coalesce(os.has_open_shift, false) and os.open_shift_started_at <= v_now - interval '18 hours' then 'open_shift_too_long' end,
          case when coalesce(cm.open_complaints_count, 0) > 0 then 'open_complaints' end,
          case when ls.effective_status = 'active'
            and coalesce(sd.usage_days_7, 0) = 0
            and c.created_at <= v_now - interval '14 days'
            then 'paid_but_inactive' end
        ], null::text) as attention_reasons
      from ops.cafes c
      left join owner_counts oc on oc.cafe_id = c.id
      left join latest_subscription ls on ls.cafe_id = c.id
      left join open_shift_now os on os.cafe_id = c.id
      left join shift_days sd on sd.cafe_id = c.id
      left join session_metrics sm on sm.cafe_id = c.id
      left join item_metrics im on im.cafe_id = c.id
      left join complaint_metrics cm on cm.cafe_id = c.id
      left join active_staff_today ast on ast.cafe_id = c.id
      left join deferred_balances db on db.cafe_id = c.id
      left join last_activity la on la.cafe_id = c.id
    ),
    attention_queue as (
      select *
      from portfolio p
      where cardinality(p.attention_reasons) > 0
      order by cardinality(p.attention_reasons) desc, p.has_open_shift desc, p.last_activity_at desc nulls last, p.created_at desc
      limit 12
    )
    select jsonb_build_object(
      'generated_at', v_now,
      'database_usage', jsonb_build_object(
        'used_bytes', v_used_bytes,
        'used_pretty', pg_size_pretty(v_used_bytes),
        'capacity_bytes', v_capacity_bytes,
        'capacity_pretty', case when v_capacity_bytes is null then null else pg_size_pretty(v_capacity_bytes) end,
        'usage_percent', case when v_capacity_bytes is null or v_capacity_bytes <= 0 then null else round((v_used_bytes::numeric * 100) / v_capacity_bytes::numeric, 2) end,
        'database_name', current_database()
      ),
      'summary', jsonb_build_object(
        'cafes_total', count(*)::int,
        'cafes_active', count(*) filter (where p.is_active)::int,
        'paid_current', count(*) filter (where p.payment_state = 'paid_current')::int,
        'trial_or_free', count(*) filter (where p.payment_state = 'trial_or_free')::int,
        'overdue', count(*) filter (where p.payment_state = 'overdue')::int,
        'suspended', count(*) filter (where p.payment_state = 'suspended')::int,
        'no_subscription', count(*) filter (where p.subscription_state = 'none')::int,
        'active_now', count(*) filter (where p.usage_state = 'active_now')::int,
        'active_today', count(*) filter (where p.usage_state in ('active_now', 'active_today'))::int,
        'inactive', count(*) filter (where p.usage_state = 'inactive')::int,
        'needs_attention', count(*) filter (where cardinality(p.attention_reasons) > 0)::int,
        'net_sales_today', coalesce(sum(p.net_sales_today), 0)::numeric(12,2),
        'served_qty_today', coalesce(sum(p.served_qty_today), 0)::int,
        'complaints_today', coalesce(sum(p.complaints_today), 0)::int
      ),
      'cafes', coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'slug', p.slug,
            'display_name', p.display_name,
            'is_active', p.is_active,
            'created_at', p.created_at,
            'owner_count', p.owner_count,
            'active_owner_count', p.active_owner_count,
            'owners', p.owners,
            'current_subscription', case when p.subscription_id is null then null else jsonb_build_object(
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
            ) end,
            'subscription_state', p.subscription_state,
            'payment_state', p.payment_state,
            'usage_state', p.usage_state,
            'last_activity_at', p.last_activity_at,
            'has_open_shift', p.has_open_shift,
            'open_shift_business_date', p.open_shift_business_date,
            'open_shift_started_at', p.open_shift_started_at,
            'usage_days_7', p.usage_days_7,
            'usage_days_30', p.usage_days_30,
            'shifts_today', p.shifts_today,
            'sessions_today', p.sessions_today,
            'served_qty_today', p.served_qty_today,
            'net_sales_today', p.net_sales_today,
            'remake_qty_today', p.remake_qty_today,
            'cancelled_qty_today', p.cancelled_qty_today,
            'complaints_today', p.complaints_today,
            'open_complaints_count', p.open_complaints_count,
            'active_staff_today', p.active_staff_today,
            'deferred_outstanding', p.deferred_outstanding,
            'attention_reasons', to_jsonb(p.attention_reasons)
          )
          order by p.has_open_shift desc, p.net_sales_today desc, p.created_at desc
        ),
        '[]'::jsonb
      ),
      'attention_queue', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', aq.id,
              'slug', aq.slug,
              'display_name', aq.display_name,
              'usage_state', aq.usage_state,
              'payment_state', aq.payment_state,
              'last_activity_at', aq.last_activity_at,
              'attention_reasons', to_jsonb(aq.attention_reasons)
            )
            order by cardinality(aq.attention_reasons) desc, aq.last_activity_at desc nulls last
          ),
          '[]'::jsonb
        )
        from attention_queue aq
      )
    )
    from portfolio p
  );
end;
$$;

commit;
