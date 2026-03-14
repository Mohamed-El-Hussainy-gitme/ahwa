begin;

create or replace function public.ops_build_shift_snapshot(
  p_cafe_id uuid,
  p_shift_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_shift ops.shifts%rowtype;
  v_snapshot jsonb;
  v_totals jsonb;
  v_products jsonb;
  v_staff jsonb;
  v_sessions jsonb;
  v_complaints jsonb;
  v_item_issues jsonb;
begin
  select *
  into v_shift
  from ops.shifts
  where cafe_id = p_cafe_id
    and id = p_shift_id;

  if not found then
    raise exception 'shift not found';
  end if;

  with item_totals as (
    select
      coalesce(sum(oi.qty_submitted), 0) as submitted_qty,
      coalesce(sum(oi.qty_ready), 0) as ready_qty,
      coalesce(sum(oi.qty_delivered), 0) as delivered_qty,
      coalesce(sum(oi.qty_replacement_delivered), 0) as replacement_delivered_qty,
      coalesce(sum(oi.qty_paid), 0) as paid_qty,
      coalesce(sum(oi.qty_deferred), 0) as deferred_qty,
      coalesce(sum(oi.qty_remade), 0) as remade_qty,
      coalesce(sum(oi.qty_cancelled), 0) as cancelled_qty,
      coalesce(sum(oi.qty_waived), 0) as waived_qty,
      coalesce(sum(greatest(oi.qty_delivered - oi.qty_waived, 0) * oi.unit_price), 0)::numeric(12,2) as net_sales
    from ops.order_items oi
    where oi.cafe_id = p_cafe_id
      and oi.shift_id = p_shift_id
  ),
  payment_totals as (
    select
      coalesce(sum(case when p.payment_kind in ('cash', 'mixed') then p.total_amount else 0 end), 0)::numeric(12,2) as cash_total,
      coalesce(sum(case when p.payment_kind = 'deferred' then p.total_amount else 0 end), 0)::numeric(12,2) as deferred_total,
      coalesce(sum(case when p.payment_kind = 'repayment' then p.total_amount else 0 end), 0)::numeric(12,2) as repayment_total
    from ops.payments p
    where p.cafe_id = p_cafe_id
      and p.shift_id = p_shift_id
  ),
  complaint_totals as (
    select
      count(*)::integer as complaint_total,
      coalesce(sum(case when c.status = 'open' then 1 else 0 end), 0)::integer as complaint_open,
      coalesce(sum(case when c.status = 'resolved' then 1 else 0 end), 0)::integer as complaint_resolved,
      coalesce(sum(case when c.status = 'dismissed' then 1 else 0 end), 0)::integer as complaint_dismissed,
      coalesce(sum(case when c.resolution_kind = 'remake' then 1 else 0 end), 0)::integer as complaint_remake,
      coalesce(sum(case when c.resolution_kind = 'cancel_undelivered' then 1 else 0 end), 0)::integer as complaint_cancel,
      coalesce(sum(case when c.resolution_kind = 'waive_delivered' then 1 else 0 end), 0)::integer as complaint_waive
    from ops.complaints c
    where c.cafe_id = p_cafe_id
      and c.shift_id = p_shift_id
      and c.complaint_scope = 'general'
  ),
  item_issue_totals as (
    select
      count(*)::integer as item_issue_total,
      coalesce(sum(case when i.action_kind = 'note' then 1 else 0 end), 0)::integer as item_issue_note,
      coalesce(sum(case when i.action_kind = 'remake' then 1 else 0 end), 0)::integer as item_issue_remake,
      coalesce(sum(case when i.action_kind = 'cancel_undelivered' then 1 else 0 end), 0)::integer as item_issue_cancel,
      coalesce(sum(case when i.action_kind = 'waive_delivered' then 1 else 0 end), 0)::integer as item_issue_waive
    from ops.order_item_issues i
    where i.cafe_id = p_cafe_id
      and i.shift_id = p_shift_id
  )
  select jsonb_build_object(
    'submitted_qty', it.submitted_qty,
    'ready_qty', it.ready_qty,
    'delivered_qty', it.delivered_qty,
    'replacement_delivered_qty', it.replacement_delivered_qty,
    'paid_qty', it.paid_qty,
    'deferred_qty', it.deferred_qty,
    'remade_qty', it.remade_qty,
    'cancelled_qty', it.cancelled_qty,
    'waived_qty', it.waived_qty,
    'net_sales', it.net_sales,
    'cash_total', pt.cash_total,
    'deferred_total', pt.deferred_total,
    'repayment_total', pt.repayment_total,
    'complaint_total', ct.complaint_total,
    'complaint_open', ct.complaint_open,
    'complaint_resolved', ct.complaint_resolved,
    'complaint_dismissed', ct.complaint_dismissed,
    'complaint_remake', ct.complaint_remake,
    'complaint_cancel', ct.complaint_cancel,
    'complaint_waive', ct.complaint_waive,
    'item_issue_total', iit.item_issue_total,
    'item_issue_note', iit.item_issue_note,
    'item_issue_remake', iit.item_issue_remake,
    'item_issue_cancel', iit.item_issue_cancel,
    'item_issue_waive', iit.item_issue_waive
  )
  into v_totals
  from item_totals it
  cross join payment_totals pt
  cross join complaint_totals ct
  cross join item_issue_totals iit;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.product_name), '[]'::jsonb)
  into v_products
  from (
    select
      mp.id as product_id,
      mp.product_name,
      oi.station_code,
      sum(oi.qty_submitted) as qty_submitted,
      sum(oi.qty_ready) as qty_ready,
      sum(oi.qty_delivered) as qty_delivered,
      sum(oi.qty_replacement_delivered) as qty_replacement_delivered,
      sum(oi.qty_paid) as qty_paid,
      sum(oi.qty_deferred) as qty_deferred,
      sum(oi.qty_remade) as qty_remade,
      sum(oi.qty_cancelled) as qty_cancelled,
      sum(oi.qty_waived) as qty_waived,
      sum(oi.qty_delivered * oi.unit_price)::numeric(12,2) as gross_sales,
      sum(greatest(oi.qty_delivered - oi.qty_waived, 0) * oi.unit_price)::numeric(12,2) as net_sales
    from ops.order_items oi
    join ops.menu_products mp
      on mp.id = oi.menu_product_id
     and mp.cafe_id = oi.cafe_id
    where oi.cafe_id = p_cafe_id
      and oi.shift_id = p_shift_id
    group by mp.id, mp.product_name, oi.station_code
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.actor_label), '[]'::jsonb)
  into v_staff
  from (
    select
      actor_label,
      sum(submitted_qty) as submitted_qty,
      sum(ready_qty) as ready_qty,
      sum(delivered_qty) as delivered_qty,
      sum(replacement_delivered_qty) as replacement_delivered_qty,
      sum(remade_qty) as remade_qty,
      sum(cancelled_qty) as cancelled_qty,
      sum(waived_qty) as waived_qty,
      sum(payment_total)::numeric(12,2) as payment_total,
      sum(cash_sales)::numeric(12,2) as cash_sales,
      sum(deferred_sales)::numeric(12,2) as deferred_sales,
      sum(repayment_total)::numeric(12,2) as repayment_total,
      sum(complaint_count) as complaint_count,
      sum(item_issue_count) as item_issue_count
    from (
      select
        sm.full_name as actor_label,
        0::bigint as submitted_qty,
        0::bigint as ready_qty,
        0::bigint as delivered_qty,
        0::bigint as replacement_delivered_qty,
        0::bigint as remade_qty,
        0::bigint as cancelled_qty,
        0::bigint as waived_qty,
        coalesce(sum(p.total_amount), 0)::numeric(12,2) as payment_total,
        coalesce(sum(case when p.payment_kind in ('cash', 'mixed') then p.total_amount else 0 end), 0)::numeric(12,2) as cash_sales,
        coalesce(sum(case when p.payment_kind = 'deferred' then p.total_amount else 0 end), 0)::numeric(12,2) as deferred_sales,
        coalesce(sum(case when p.payment_kind = 'repayment' then p.total_amount else 0 end), 0)::numeric(12,2) as repayment_total,
        0::bigint as complaint_count,
        0::bigint as item_issue_count
      from ops.payments p
      join ops.staff_members sm
        on sm.id = p.by_staff_id
       and sm.cafe_id = p.cafe_id
      where p.cafe_id = p_cafe_id
        and p.shift_id = p_shift_id
      group by sm.full_name

      union all

      select
        ou.full_name as actor_label,
        0::bigint,
        0::bigint,
        0::bigint,
        0::bigint,
        0::bigint,
        0::bigint,
        0::bigint,
        coalesce(sum(p.total_amount), 0)::numeric(12,2),
        coalesce(sum(case when p.payment_kind in ('cash', 'mixed') then p.total_amount else 0 end), 0)::numeric(12,2),
        coalesce(sum(case when p.payment_kind = 'deferred' then p.total_amount else 0 end), 0)::numeric(12,2),
        coalesce(sum(case when p.payment_kind = 'repayment' then p.total_amount else 0 end), 0)::numeric(12,2),
        0::bigint,
        0::bigint
      from ops.payments p
      join ops.owner_users ou
        on ou.id = p.by_owner_id
       and ou.cafe_id = p.cafe_id
      where p.cafe_id = p_cafe_id
        and p.shift_id = p_shift_id
      group by ou.full_name

      union all

      select
        sm.full_name as actor_label,
        coalesce(sum(case when fe.event_code = 'submitted' then fe.quantity else 0 end), 0)::bigint,
        coalesce(sum(case when fe.event_code in ('partial_ready', 'ready') then fe.quantity else 0 end), 0)::bigint,
        coalesce(sum(case when fe.event_code = 'delivered' then fe.quantity else 0 end), 0)::bigint,
        coalesce(sum(case when fe.event_code = 'remake_delivered' then fe.quantity else 0 end), 0)::bigint,
        coalesce(sum(case when fe.event_code = 'remake_submitted' then fe.quantity else 0 end), 0)::bigint,
        coalesce(sum(case when fe.event_code = 'cancelled' then fe.quantity else 0 end), 0)::bigint,
        coalesce(sum(case when fe.event_code = 'waived' then fe.quantity else 0 end), 0)::bigint,
        0::numeric(12,2),
        0::numeric(12,2),
        0::numeric(12,2),
        0::numeric(12,2),
        0::bigint,
        0::bigint
      from ops.fulfillment_events fe
      join ops.staff_members sm
        on sm.id = fe.by_staff_id
       and sm.cafe_id = fe.cafe_id
      where fe.cafe_id = p_cafe_id
        and fe.shift_id = p_shift_id
      group by sm.full_name

      union all

      select
        ou.full_name as actor_label,
        coalesce(sum(case when fe.event_code = 'submitted' then fe.quantity else 0 end), 0)::bigint,
        coalesce(sum(case when fe.event_code in ('partial_ready', 'ready') then fe.quantity else 0 end), 0)::bigint,
        coalesce(sum(case when fe.event_code = 'delivered' then fe.quantity else 0 end), 0)::bigint,
        coalesce(sum(case when fe.event_code = 'remake_delivered' then fe.quantity else 0 end), 0)::bigint,
        coalesce(sum(case when fe.event_code = 'remake_submitted' then fe.quantity else 0 end), 0)::bigint,
        coalesce(sum(case when fe.event_code = 'cancelled' then fe.quantity else 0 end), 0)::bigint,
        coalesce(sum(case when fe.event_code = 'waived' then fe.quantity else 0 end), 0)::bigint,
        0::numeric(12,2),
        0::numeric(12,2),
        0::numeric(12,2),
        0::numeric(12,2),
        0::bigint,
        0::bigint
      from ops.fulfillment_events fe
      join ops.owner_users ou
        on ou.id = fe.by_owner_id
       and ou.cafe_id = fe.cafe_id
      where fe.cafe_id = p_cafe_id
        and fe.shift_id = p_shift_id
      group by ou.full_name

      union all

      select
        coalesce(sm.full_name, ou.full_name, 'unknown') as actor_label,
        0::bigint,
        0::bigint,
        0::bigint,
        0::bigint,
        0::bigint,
        0::bigint,
        0::bigint,
        0::numeric(12,2),
        0::numeric(12,2),
        0::numeric(12,2),
        0::numeric(12,2),
        count(*)::bigint,
        0::bigint
      from ops.complaints c
      left join ops.staff_members sm
        on sm.id = c.created_by_staff_id
       and sm.cafe_id = c.cafe_id
      left join ops.owner_users ou
        on ou.id = c.created_by_owner_id
       and ou.cafe_id = c.cafe_id
      where c.cafe_id = p_cafe_id
        and c.shift_id = p_shift_id
        and c.complaint_scope = 'general'
      group by coalesce(sm.full_name, ou.full_name, 'unknown')

      union all

      select
        coalesce(sm.full_name, ou.full_name, 'unknown') as actor_label,
        0::bigint,
        0::bigint,
        0::bigint,
        0::bigint,
        0::bigint,
        0::bigint,
        0::bigint,
        0::numeric(12,2),
        0::numeric(12,2),
        0::numeric(12,2),
        0::numeric(12,2),
        0::bigint,
        count(*)::bigint
      from ops.order_item_issues i
      left join ops.staff_members sm
        on sm.id = i.created_by_staff_id
       and sm.cafe_id = i.cafe_id
      left join ops.owner_users ou
        on ou.id = i.created_by_owner_id
       and ou.cafe_id = i.cafe_id
      where i.cafe_id = p_cafe_id
        and i.shift_id = p_shift_id
      group by coalesce(sm.full_name, ou.full_name, 'unknown')
    ) raw
    group by actor_label
  ) x;

  select jsonb_build_object(
    'open_sessions', coalesce(sum(case when status = 'open' then 1 else 0 end), 0),
    'closed_sessions', coalesce(sum(case when status = 'closed' then 1 else 0 end), 0),
    'total_sessions', count(*)
  )
  into v_sessions
  from ops.service_sessions
  where cafe_id = p_cafe_id
    and shift_id = p_shift_id;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
  into v_complaints
  from (
    select
      c.id,
      c.service_session_id,
      ss.session_label,
      c.complaint_kind,
      c.status,
      c.resolution_kind,
      c.requested_quantity,
      c.resolved_quantity,
      c.notes,
      c.created_at,
      c.resolved_at,
      coalesce(cs.full_name, co.full_name) as created_by_label,
      coalesce(rs.full_name, ro.full_name) as resolved_by_label
    from ops.complaints c
    join ops.service_sessions ss
      on ss.id = c.service_session_id
     and ss.cafe_id = c.cafe_id
    left join ops.staff_members cs
      on cs.id = c.created_by_staff_id
     and cs.cafe_id = c.cafe_id
    left join ops.owner_users co
      on co.id = c.created_by_owner_id
     and co.cafe_id = c.cafe_id
    left join ops.staff_members rs
      on rs.id = c.resolved_by_staff_id
     and rs.cafe_id = c.cafe_id
    left join ops.owner_users ro
      on ro.id = c.resolved_by_owner_id
     and ro.cafe_id = c.cafe_id
    where c.cafe_id = p_cafe_id
      and c.shift_id = p_shift_id
      and c.complaint_scope = 'general'
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
  into v_item_issues
  from (
    select
      i.id,
      i.order_item_id,
      i.service_session_id,
      ss.session_label,
      mp.product_name,
      i.issue_kind,
      i.action_kind,
      i.status,
      i.requested_quantity,
      i.resolved_quantity,
      i.notes,
      i.created_at,
      i.resolved_at,
      coalesce(cs.full_name, co.full_name) as created_by_label,
      coalesce(rs.full_name, ro.full_name) as resolved_by_label
    from ops.order_item_issues i
    join ops.service_sessions ss
      on ss.id = i.service_session_id
     and ss.cafe_id = i.cafe_id
    join ops.order_items oi
      on oi.id = i.order_item_id
     and oi.cafe_id = i.cafe_id
    join ops.menu_products mp
      on mp.id = oi.menu_product_id
     and mp.cafe_id = oi.cafe_id
    left join ops.staff_members cs
      on cs.id = i.created_by_staff_id
     and cs.cafe_id = i.cafe_id
    left join ops.owner_users co
      on co.id = i.created_by_owner_id
     and co.cafe_id = i.cafe_id
    left join ops.staff_members rs
      on rs.id = i.resolved_by_staff_id
     and rs.cafe_id = i.cafe_id
    left join ops.owner_users ro
      on ro.id = i.resolved_by_owner_id
     and ro.cafe_id = i.cafe_id
    where i.cafe_id = p_cafe_id
      and i.shift_id = p_shift_id
  ) x;

  v_snapshot := jsonb_build_object(
    'version', 2,
    'shift', jsonb_build_object(
      'shift_id', v_shift.id,
      'shift_kind', v_shift.shift_kind,
      'business_date', v_shift.business_date,
      'status', v_shift.status,
      'opened_at', v_shift.opened_at,
      'closed_at', v_shift.closed_at
    ),
    'totals', coalesce(v_totals, '{}'::jsonb),
    'sessions', coalesce(v_sessions, '{}'::jsonb),
    'products', coalesce(v_products, '[]'::jsonb),
    'staff', coalesce(v_staff, '[]'::jsonb),
    'complaints', coalesce(v_complaints, '[]'::jsonb),
    'item_issues', coalesce(v_item_issues, '[]'::jsonb)
  );

  insert into ops.shift_snapshots (
    cafe_id,
    shift_id,
    snapshot_json
  )
  values (
    p_cafe_id,
    p_shift_id,
    v_snapshot
  )
  on conflict (cafe_id, shift_id)
  do update set snapshot_json = excluded.snapshot_json,
                created_at = now();

  return v_snapshot;
end;
$$;

commit;
