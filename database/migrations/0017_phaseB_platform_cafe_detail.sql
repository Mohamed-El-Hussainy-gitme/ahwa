begin;

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
  v_today date := timezone('Africa/Cairo', now())::date;
  v_result jsonb;
begin
  select * into v_admin from platform.super_admin_users where id = p_super_admin_user_id and is_active = true;
  if not found then raise exception 'active super admin not found'; end if;

  select * into v_cafe from ops.cafes where id = p_cafe_id;
  if not found then raise exception 'cafe_not_found'; end if;

  with latest_subscription as (
    select distinct on (s.cafe_id)
      s.cafe_id, s.id, s.starts_at, s.ends_at, s.grace_days, s.status, s.notes, s.created_at, s.updated_at,
      case when s.status = 'suspended' then 'suspended' when v_now > s.ends_at + make_interval(days => s.grace_days) then 'expired' else s.status end as effective_status,
      greatest(0, floor(extract(epoch from (s.ends_at - v_now))))::bigint as countdown_seconds
    from platform.cafe_subscriptions s
    where s.cafe_id = p_cafe_id
    order by s.cafe_id, s.created_at desc, s.id desc
  ), owner_rows as (
    select ou.id, ou.full_name, ou.phone, ou.owner_label, ou.is_active, ou.created_at
    from ops.owner_users ou where ou.cafe_id = p_cafe_id order by ou.created_at asc
  ), last_activity as (
    select max(activity_at) as last_activity_at from (
      select max(created_at) as activity_at from ops.audit_events where cafe_id = p_cafe_id
      union all select max(opened_at) from ops.shifts where cafe_id = p_cafe_id
      union all select max(opened_at) from ops.service_sessions where cafe_id = p_cafe_id
      union all select max(created_at) from ops.orders where cafe_id = p_cafe_id
      union all select max(created_at) from ops.fulfillment_events where cafe_id = p_cafe_id
      union all select max(created_at) from ops.payments where cafe_id = p_cafe_id
      union all select max(created_at) from ops.complaints where cafe_id = p_cafe_id
    ) activities
  ), open_shift as (
    select s.id, s.shift_kind, s.business_date, s.opened_at
    from ops.shifts s where s.cafe_id = p_cafe_id and s.status = 'open'
    order by s.opened_at desc nulls last limit 1
  ), shift_today as (
    select count(*)::int as shifts_count, max(closed_at) as last_closed_at
    from ops.shifts s where s.cafe_id = p_cafe_id and s.business_date = v_today
  ), metrics_today as (
    select
      coalesce(count(distinct ss.id), 0)::int as sessions_count,
      coalesce(sum(oi.qty_delivered + oi.qty_replacement_delivered), 0)::int as served_qty,
      coalesce(sum((oi.qty_paid + oi.qty_deferred) * oi.unit_price), 0)::numeric(12,2) as net_sales,
      coalesce(sum(oi.qty_remade), 0)::int as remake_qty,
      coalesce(sum(oi.qty_cancelled), 0)::int as cancelled_qty,
      coalesce(count(distinct c.id), 0)::int as complaints_count,
      coalesce(count(distinct case when c.status = 'open' then c.id end), 0)::int as open_complaints_count,
      coalesce(count(distinct coalesce(sra.staff_member_id::text, 'owner:' || sra.owner_user_id::text)), 0)::int as active_staff_count,
      coalesce(sum(case when p.payment_kind = 'cash' then p.total_amount else 0 end), 0)::numeric(12,2) as cash_collected,
      coalesce(sum(case when p.payment_kind = 'deferred' then p.total_amount else 0 end), 0)::numeric(12,2) as deferred_sold,
      coalesce(sum(case when p.payment_kind = 'repayment' then p.total_amount else 0 end), 0)::numeric(12,2) as repayments_total
    from ops.shifts s
    left join ops.service_sessions ss on ss.cafe_id = s.cafe_id and ss.shift_id = s.id
    left join ops.order_items oi on oi.cafe_id = s.cafe_id and oi.shift_id = s.id
    left join ops.complaints c on c.cafe_id = s.cafe_id and c.shift_id = s.id
    left join ops.shift_role_assignments sra on sra.cafe_id = s.cafe_id and sra.shift_id = s.id and sra.is_active = true
    left join ops.payments p on p.cafe_id = s.cafe_id and p.shift_id = s.id
    where s.cafe_id = p_cafe_id and s.business_date = v_today
  ), metrics_7d as (
    select count(distinct s.business_date)::int as active_days, count(distinct s.id)::int as shifts_count,
      coalesce(count(distinct ss.id),0)::int as sessions_count,
      coalesce(sum(oi.qty_delivered + oi.qty_replacement_delivered),0)::int as served_qty,
      coalesce(sum((oi.qty_paid + oi.qty_deferred) * oi.unit_price),0)::numeric(12,2) as net_sales,
      coalesce(sum(oi.qty_remade),0)::int as remake_qty,
      coalesce(sum(oi.qty_cancelled),0)::int as cancelled_qty,
      coalesce(count(distinct c.id),0)::int as complaints_count
    from ops.shifts s
    left join ops.service_sessions ss on ss.cafe_id = s.cafe_id and ss.shift_id = s.id
    left join ops.order_items oi on oi.cafe_id = s.cafe_id and oi.shift_id = s.id
    left join ops.complaints c on c.cafe_id = s.cafe_id and c.shift_id = s.id
    where s.cafe_id = p_cafe_id and s.business_date between v_today - 6 and v_today
  ), metrics_30d as (
    select count(distinct s.business_date)::int as active_days, count(distinct s.id)::int as shifts_count,
      coalesce(count(distinct ss.id),0)::int as sessions_count,
      coalesce(sum(oi.qty_delivered + oi.qty_replacement_delivered),0)::int as served_qty,
      coalesce(sum((oi.qty_paid + oi.qty_deferred) * oi.unit_price),0)::numeric(12,2) as net_sales,
      coalesce(sum(oi.qty_remade),0)::int as remake_qty,
      coalesce(sum(oi.qty_cancelled),0)::int as cancelled_qty,
      coalesce(count(distinct c.id),0)::int as complaints_count
    from ops.shifts s
    left join ops.service_sessions ss on ss.cafe_id = s.cafe_id and ss.shift_id = s.id
    left join ops.order_items oi on oi.cafe_id = s.cafe_id and oi.shift_id = s.id
    left join ops.complaints c on c.cafe_id = s.cafe_id and c.shift_id = s.id
    where s.cafe_id = p_cafe_id and s.business_date between v_today - 29 and v_today
  ), deferred_balance as (
    select coalesce(sum(case dle.entry_kind when 'debt' then dle.amount when 'repayment' then -dle.amount else 0 end),0)::numeric(12,2) as outstanding
    from ops.deferred_ledger_entries dle where dle.cafe_id = p_cafe_id
  ), open_sessions as (
    select count(*)::int as count from ops.service_sessions ss where ss.cafe_id = p_cafe_id and ss.status = 'open'
  ), active_staff_all as (
    select count(*)::int as count from ops.staff_members sm where sm.cafe_id = p_cafe_id and sm.is_active = true
  ), attention as (
    select array_remove(array[
      case when v_cafe.is_active = false then 'cafe_disabled' end,
      case when (select count(*) from owner_rows where is_active = true) = 0 then 'no_active_owner' end,
      case when (select count(*) from latest_subscription) = 0 then 'no_subscription' end,
      case when exists (select 1 from latest_subscription ls where ls.effective_status = 'expired') and ((select id from open_shift) is not null or (select active_days from metrics_7d) > 0) then 'expired_but_active' end,
      case when exists (select 1 from latest_subscription ls where ls.effective_status = 'suspended') and ((select id from open_shift) is not null or (select active_days from metrics_7d) > 0) then 'suspended_but_active' end,
      case when exists (select 1 from open_shift os where os.opened_at <= v_now - interval '18 hours') then 'open_shift_too_long' end,
      case when (select open_complaints_count from metrics_today) > 0 then 'open_complaints' end,
      case when exists (select 1 from latest_subscription ls where ls.effective_status = 'active') and (select active_days from metrics_7d) = 0 and v_cafe.created_at <= v_now - interval '14 days' then 'paid_but_inactive' end
    ], null::text) as reasons
  )
  select jsonb_build_object(
    'generated_at', v_now,
    'cafe', jsonb_build_object(
      'id', v_cafe.id, 'slug', v_cafe.slug, 'display_name', v_cafe.display_name, 'is_active', v_cafe.is_active, 'created_at', v_cafe.created_at,
      'owner_count', (select count(*)::int from owner_rows),
      'active_owner_count', (select count(*)::int from owner_rows where is_active = true),
      'owners', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'full_name', full_name, 'phone', phone, 'owner_label', owner_label, 'is_active', is_active, 'created_at', created_at) order by created_at asc) from owner_rows), '[]'::jsonb)
    ),
    'subscription', jsonb_build_object(
      'current', (select case when ls.id is null then null else jsonb_build_object('id', ls.id, 'starts_at', ls.starts_at, 'ends_at', ls.ends_at, 'grace_days', ls.grace_days, 'status', ls.status, 'effective_status', ls.effective_status, 'notes', ls.notes, 'created_at', ls.created_at, 'updated_at', ls.updated_at, 'countdown_seconds', ls.countdown_seconds) end from latest_subscription ls),
      'history', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'starts_at', s.starts_at, 'ends_at', s.ends_at, 'grace_days', s.grace_days, 'status', s.status, 'effective_status', case when s.status = 'suspended' then 'suspended' when v_now > s.ends_at + make_interval(days => s.grace_days) then 'expired' else s.status end, 'notes', s.notes, 'created_at', s.created_at, 'updated_at', s.updated_at, 'countdown_seconds', greatest(0, floor(extract(epoch from (s.ends_at - v_now))))::bigint) order by s.created_at desc, s.id desc) from (select * from platform.cafe_subscriptions s where s.cafe_id = p_cafe_id order by s.created_at desc, s.id desc limit 12) s), '[]'::jsonb)
    ),
    'usage', jsonb_build_object(
      'last_activity_at', (select last_activity_at from last_activity),
      'today', (select jsonb_build_object('business_date', v_today, 'shifts_count', shifts_count, 'sessions_count', sessions_count, 'served_qty', served_qty, 'net_sales', net_sales, 'remake_qty', remake_qty, 'cancelled_qty', cancelled_qty, 'complaints_count', complaints_count, 'open_complaints_count', open_complaints_count, 'active_staff_count', active_staff_count, 'cash_collected', cash_collected, 'deferred_sold', deferred_sold, 'repayments_total', repayments_total) from (select * from shift_today cross join metrics_today) t),
      'trailing_7d', (select jsonb_build_object('active_days', active_days, 'shifts_count', shifts_count, 'sessions_count', sessions_count, 'served_qty', served_qty, 'net_sales', net_sales, 'remake_qty', remake_qty, 'cancelled_qty', cancelled_qty, 'complaints_count', complaints_count) from metrics_7d),
      'trailing_30d', (select jsonb_build_object('active_days', active_days, 'shifts_count', shifts_count, 'sessions_count', sessions_count, 'served_qty', served_qty, 'net_sales', net_sales, 'remake_qty', remake_qty, 'cancelled_qty', cancelled_qty, 'complaints_count', complaints_count) from metrics_30d)
    ),
    'health', jsonb_build_object(
      'has_open_shift', exists(select 1 from open_shift),
      'open_shift', (select case when os.id is null then null else jsonb_build_object('id', os.id, 'shift_kind', os.shift_kind, 'business_date', os.business_date, 'opened_at', os.opened_at) end from open_shift os),
      'open_sessions_count', (select count from open_sessions),
      'open_complaints_count', (select open_complaints_count from metrics_today),
      'deferred_outstanding', (select outstanding from deferred_balance),
      'active_owner_count', (select count(*)::int from owner_rows where is_active = true),
      'active_staff_count', (select count from active_staff_all),
      'last_shift_closed_at', (select max(s.closed_at) from ops.shifts s where s.cafe_id = p_cafe_id and s.status = 'closed'),
      'attention_reasons', to_jsonb((select reasons from attention))
    ),
    'support', jsonb_build_object(
      'recent_grants', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'is_active', g.is_active, 'notes', g.notes, 'expires_at', g.expires_at, 'revoked_at', g.revoked_at, 'created_at', g.created_at) order by g.created_at desc) from (select * from platform.support_access_grants g where g.cafe_id = p_cafe_id order by g.created_at desc limit 10) g), '[]'::jsonb)
    ),
    'recent', jsonb_build_object(
      'shifts', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'shift_kind', s.shift_kind, 'business_date', s.business_date, 'status', s.status, 'opened_at', s.opened_at, 'closed_at', s.closed_at, 'snapshot_created_at', ss.created_at, 'snapshot_summary', ss.snapshot_json -> 'summary') order by s.business_date desc, s.opened_at desc nulls last) from (select * from ops.shifts s where s.cafe_id = p_cafe_id order by s.business_date desc, s.opened_at desc nulls last limit 12) s left join ops.shift_snapshots ss on ss.cafe_id = s.cafe_id and ss.shift_id = s.id), '[]'::jsonb),
      'complaints', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'complaint_kind', c.complaint_kind, 'status', c.status, 'resolution_kind', c.resolution_kind, 'requested_quantity', c.requested_quantity, 'resolved_quantity', c.resolved_quantity, 'notes', c.notes, 'created_at', c.created_at, 'resolved_at', c.resolved_at, 'session_label', ss.session_label, 'product_name', mp.product_name) order by c.created_at desc) from (select * from ops.complaints c where c.cafe_id = p_cafe_id order by c.created_at desc limit 12) c left join ops.service_sessions ss on ss.cafe_id = c.cafe_id and ss.id = c.service_session_id left join ops.order_items oi on oi.cafe_id = c.cafe_id and oi.id = c.order_item_id left join ops.menu_products mp on mp.cafe_id = oi.cafe_id and mp.id = oi.product_id), '[]'::jsonb),
      'audit_events', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'actor_type', a.actor_type, 'actor_label', a.actor_label, 'event_code', a.event_code, 'entity_type', a.entity_type, 'entity_id', a.entity_id, 'payload', a.payload, 'created_at', a.created_at) order by a.created_at desc) from (select * from ops.audit_events a where a.cafe_id = p_cafe_id order by a.created_at desc limit 20) a), '[]'::jsonb)
    )
  ) into v_result;

  return v_result;
end;
$$;

commit;
