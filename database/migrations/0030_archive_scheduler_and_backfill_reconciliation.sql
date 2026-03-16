begin;

create table if not exists ops.reporting_maintenance_runs (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid references ops.cafes(id) on delete cascade,
  run_kind text not null check (run_kind in ('archive', 'backfill', 'reconcile')),
  triggered_by text not null default 'system',
  dry_run boolean not null default false,
  window_start_date date,
  window_end_date date,
  request_json jsonb not null default '{}'::jsonb,
  result_json jsonb,
  status text not null default 'started' check (status in ('started', 'succeeded', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists idx_reporting_maintenance_runs_cafe_started
  on ops.reporting_maintenance_runs(cafe_id, started_at desc);

create index if not exists idx_reporting_maintenance_runs_kind_started
  on ops.reporting_maintenance_runs(run_kind, started_at desc);

create or replace function public.ops_archive_closed_data(
  p_cafe_id uuid,
  p_archive_before_date date default (current_date - 14),
  p_rebuild_rollups boolean default true,
  p_dry_run boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, archive
as $$
declare
  v_run_id uuid;
  v_shift_ids uuid[];
  v_shift_count integer := 0;
  v_days date[];
  v_day date;
  v_weeks date[];
  v_week date;
  v_months date[];
  v_month date;
  v_years date[];
  v_year date;
  v_session_count integer := 0;
  v_order_count integer := 0;
  v_item_count integer := 0;
  v_fulfillment_count integer := 0;
  v_payment_count integer := 0;
  v_allocation_count integer := 0;
  v_complaint_count integer := 0;
  v_issue_count integer := 0;
  v_audit_count integer := 0;
  v_result jsonb;
begin
  insert into ops.reporting_maintenance_runs (
    cafe_id,
    run_kind,
    triggered_by,
    dry_run,
    window_end_date,
    request_json
  ) values (
    p_cafe_id,
    'archive',
    'db',
    coalesce(p_dry_run, false),
    p_archive_before_date,
    jsonb_build_object(
      'archive_before_date', p_archive_before_date,
      'rebuild_rollups', coalesce(p_rebuild_rollups, true),
      'dry_run', coalesce(p_dry_run, false)
    )
  ) returning id into v_run_id;

  select array_agg(s.id order by s.business_date, s.opened_at), count(*)::int
  into v_shift_ids, v_shift_count
  from ops.shifts s
  join ops.daily_snapshots ds
    on ds.cafe_id = s.cafe_id
   and ds.business_date = s.business_date
   and ds.is_finalized = true
  where s.cafe_id = p_cafe_id
    and s.status = 'closed'
    and s.business_date <= p_archive_before_date
    and s.detail_archived_at is null;

  if v_shift_count = 0 or v_shift_ids is null then
    v_result := jsonb_build_object(
      'ok', true,
      'archived', false,
      'reason', 'NO_ELIGIBLE_SHIFTS',
      'archive_before_date', p_archive_before_date
    );

    update ops.reporting_maintenance_runs
    set status = 'succeeded',
        result_json = v_result,
        finished_at = now()
    where id = v_run_id;

    return v_result;
  end if;

  select array_agg(distinct s.business_date order by s.business_date)
  into v_days
  from ops.shifts s
  where s.cafe_id = p_cafe_id
    and s.id = any(v_shift_ids);

  select count(*)::int into v_session_count
  from ops.service_sessions
  where cafe_id = p_cafe_id
    and shift_id = any(v_shift_ids);

  select count(*)::int into v_order_count
  from ops.orders
  where cafe_id = p_cafe_id
    and shift_id = any(v_shift_ids);

  select count(*)::int into v_item_count
  from ops.order_items
  where cafe_id = p_cafe_id
    and shift_id = any(v_shift_ids);

  select count(*)::int into v_fulfillment_count
  from ops.fulfillment_events
  where cafe_id = p_cafe_id
    and shift_id = any(v_shift_ids);

  select count(*)::int into v_payment_count
  from ops.payments
  where cafe_id = p_cafe_id
    and shift_id = any(v_shift_ids);

  select count(*)::int into v_allocation_count
  from ops.payment_allocations pa
  join ops.payments p
    on p.cafe_id = pa.cafe_id
   and p.id = pa.payment_id
  where pa.cafe_id = p_cafe_id
    and p.shift_id = any(v_shift_ids);

  select count(*)::int into v_complaint_count
  from ops.complaints
  where cafe_id = p_cafe_id
    and shift_id = any(v_shift_ids);

  select count(*)::int into v_issue_count
  from ops.order_item_issues
  where cafe_id = p_cafe_id
    and shift_id = any(v_shift_ids);

  select count(*)::int into v_audit_count
  from ops.audit_events
  where cafe_id = p_cafe_id
    and (created_at at time zone 'utc')::date <= p_archive_before_date;

  if v_days is not null then
    select array_agg(distinct date_trunc('week', day_value::timestamp)::date order by date_trunc('week', day_value::timestamp)::date)
    into v_weeks
    from unnest(v_days) as t(day_value);

    select array_agg(distinct date_trunc('month', day_value::timestamp)::date order by date_trunc('month', day_value::timestamp)::date)
    into v_months
    from unnest(v_days) as t(day_value);

    select array_agg(distinct date_trunc('year', day_value::timestamp)::date order by date_trunc('year', day_value::timestamp)::date)
    into v_years
    from unnest(v_days) as t(day_value);
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'archived', not coalesce(p_dry_run, false),
    'dry_run', coalesce(p_dry_run, false),
    'archive_before_date', p_archive_before_date,
    'shift_count', v_shift_count,
    'service_session_count', v_session_count,
    'order_count', v_order_count,
    'order_item_count', v_item_count,
    'fulfillment_event_count', v_fulfillment_count,
    'payment_count', v_payment_count,
    'payment_allocation_count', v_allocation_count,
    'complaint_count', v_complaint_count,
    'order_item_issue_count', v_issue_count,
    'audit_event_count', v_audit_count,
    'daily_snapshot_dates', coalesce(to_jsonb(v_days), '[]'::jsonb),
    'weekly_summary_weeks', coalesce(to_jsonb(v_weeks), '[]'::jsonb),
    'monthly_summary_months', coalesce(to_jsonb(v_months), '[]'::jsonb),
    'yearly_summary_years', coalesce(to_jsonb(v_years), '[]'::jsonb)
  );

  if coalesce(p_dry_run, false) then
    update ops.reporting_maintenance_runs
    set status = 'succeeded',
        result_json = v_result,
        finished_at = now()
    where id = v_run_id;

    return v_result;
  end if;

  if coalesce(p_rebuild_rollups, true) and v_days is not null then
    foreach v_day in array v_days loop
      perform public.ops_refresh_reporting_chain(p_cafe_id, v_day);
    end loop;
  end if;

  insert into archive.service_sessions
  select ss.*, now() as archived_at, sh.business_date as archived_business_date
  from ops.service_sessions ss
  join ops.shifts sh
    on sh.cafe_id = ss.cafe_id
   and sh.id = ss.shift_id
  where ss.cafe_id = p_cafe_id
    and ss.shift_id = any(v_shift_ids)
  on conflict (cafe_id, id) do nothing;

  insert into archive.orders
  select o.*, now() as archived_at, sh.business_date as archived_business_date
  from ops.orders o
  join ops.shifts sh
    on sh.cafe_id = o.cafe_id
   and sh.id = o.shift_id
  where o.cafe_id = p_cafe_id
    and o.shift_id = any(v_shift_ids)
  on conflict (cafe_id, id) do nothing;

  insert into archive.order_items
  select oi.*, now() as archived_at, sh.business_date as archived_business_date
  from ops.order_items oi
  join ops.shifts sh
    on sh.cafe_id = oi.cafe_id
   and sh.id = oi.shift_id
  where oi.cafe_id = p_cafe_id
    and oi.shift_id = any(v_shift_ids)
  on conflict (cafe_id, id) do nothing;

  insert into archive.fulfillment_events
  select fe.*, now() as archived_at, sh.business_date as archived_business_date
  from ops.fulfillment_events fe
  join ops.shifts sh
    on sh.cafe_id = fe.cafe_id
   and sh.id = fe.shift_id
  where fe.cafe_id = p_cafe_id
    and fe.shift_id = any(v_shift_ids)
  on conflict (cafe_id, id) do nothing;

  insert into archive.payments
  select p.*, now() as archived_at, sh.business_date as archived_business_date
  from ops.payments p
  join ops.shifts sh
    on sh.cafe_id = p.cafe_id
   and sh.id = p.shift_id
  where p.cafe_id = p_cafe_id
    and p.shift_id = any(v_shift_ids)
  on conflict (cafe_id, id) do nothing;

  insert into archive.payment_allocations
  select pa.*, now() as archived_at, sh.business_date as archived_business_date
  from ops.payment_allocations pa
  join ops.payments p
    on p.cafe_id = pa.cafe_id
   and p.id = pa.payment_id
  join ops.shifts sh
    on sh.cafe_id = p.cafe_id
   and sh.id = p.shift_id
  where pa.cafe_id = p_cafe_id
    and p.shift_id = any(v_shift_ids)
  on conflict (cafe_id, id) do nothing;

  insert into archive.complaints
  select c.*, now() as archived_at, sh.business_date as archived_business_date
  from ops.complaints c
  join ops.shifts sh
    on sh.cafe_id = c.cafe_id
   and sh.id = c.shift_id
  where c.cafe_id = p_cafe_id
    and c.shift_id = any(v_shift_ids)
  on conflict (cafe_id, id) do nothing;

  insert into archive.order_item_issues
  select i.*, now() as archived_at, sh.business_date as archived_business_date
  from ops.order_item_issues i
  join ops.shifts sh
    on sh.cafe_id = i.cafe_id
   and sh.id = i.shift_id
  where i.cafe_id = p_cafe_id
    and i.shift_id = any(v_shift_ids)
  on conflict (cafe_id, id) do nothing;

  insert into archive.audit_events
  select ae.*, now() as archived_at, (ae.created_at at time zone 'utc')::date as archived_business_date
  from ops.audit_events ae
  where ae.cafe_id = p_cafe_id
    and (ae.created_at at time zone 'utc')::date <= p_archive_before_date
  on conflict (cafe_id, id) do nothing;

  delete from ops.payment_allocations pa
  using ops.payments p
  where pa.cafe_id = p_cafe_id
    and p.cafe_id = pa.cafe_id
    and p.id = pa.payment_id
    and p.shift_id = any(v_shift_ids);

  delete from ops.fulfillment_events
  where cafe_id = p_cafe_id
    and shift_id = any(v_shift_ids);

  delete from ops.complaints
  where cafe_id = p_cafe_id
    and shift_id = any(v_shift_ids);

  delete from ops.order_item_issues
  where cafe_id = p_cafe_id
    and shift_id = any(v_shift_ids);

  delete from ops.payments
  where cafe_id = p_cafe_id
    and shift_id = any(v_shift_ids);

  delete from ops.order_items
  where cafe_id = p_cafe_id
    and shift_id = any(v_shift_ids);

  delete from ops.orders
  where cafe_id = p_cafe_id
    and shift_id = any(v_shift_ids);

  delete from ops.service_sessions
  where cafe_id = p_cafe_id
    and shift_id = any(v_shift_ids);

  delete from ops.audit_events
  where cafe_id = p_cafe_id
    and (created_at at time zone 'utc')::date <= p_archive_before_date;

  update ops.shifts
  set detail_archived_at = now()
  where cafe_id = p_cafe_id
    and id = any(v_shift_ids)
    and detail_archived_at is null;

  update ops.reporting_maintenance_runs
  set status = 'succeeded',
      result_json = v_result,
      finished_at = now()
  where id = v_run_id;

  return v_result;
exception
  when others then
    update ops.reporting_maintenance_runs
    set status = 'failed',
        result_json = jsonb_build_object('ok', false, 'error', sqlerrm),
        finished_at = now()
    where id = v_run_id;
    raise;
end;
$$;

drop function if exists public.ops_run_weekly_archive(uuid, integer);
create or replace function public.ops_run_weekly_archive(
  p_cafe_id uuid,
  p_grace_days integer default 14,
  p_dry_run boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, archive
as $$
declare
  v_cutoff date;
begin
  v_cutoff := current_date - greatest(coalesce(p_grace_days, 14), 0);
  return public.ops_archive_closed_data(p_cafe_id, v_cutoff, true, p_dry_run);
end;
$$;

create or replace function public.ops_backfill_reporting_history(
  p_cafe_id uuid,
  p_start_date date default null,
  p_end_date date default current_date,
  p_rebuild_deferred_balances boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_run_id uuid;
  v_effective_start date;
  v_days date[];
  v_day date;
  v_weeks date[];
  v_months date[];
  v_years date[];
  v_result jsonb;
begin
  select coalesce(p_start_date, min(business_date)), coalesce(array_agg(distinct business_date order by business_date), '{}'::date[])
  into v_effective_start, v_days
  from ops.shifts
  where cafe_id = p_cafe_id
    and business_date <= coalesce(p_end_date, current_date)
    and business_date >= coalesce(p_start_date, business_date);

  insert into ops.reporting_maintenance_runs (
    cafe_id,
    run_kind,
    triggered_by,
    dry_run,
    window_start_date,
    window_end_date,
    request_json
  ) values (
    p_cafe_id,
    'backfill',
    'db',
    false,
    v_effective_start,
    coalesce(p_end_date, current_date),
    jsonb_build_object(
      'start_date', v_effective_start,
      'end_date', coalesce(p_end_date, current_date),
      'rebuild_deferred_balances', coalesce(p_rebuild_deferred_balances, true)
    )
  ) returning id into v_run_id;

  if coalesce(array_length(v_days, 1), 0) = 0 then
    v_result := jsonb_build_object(
      'ok', true,
      'backfilled', false,
      'reason', 'NO_SOURCE_DAYS',
      'start_date', v_effective_start,
      'end_date', coalesce(p_end_date, current_date)
    );

    update ops.reporting_maintenance_runs
    set status = 'succeeded',
        result_json = v_result,
        finished_at = now()
    where id = v_run_id;

    return v_result;
  end if;

  if coalesce(p_rebuild_deferred_balances, true) then
    perform public.ops_rebuild_deferred_customer_balances(p_cafe_id);
  end if;

  foreach v_day in array v_days loop
    perform public.ops_refresh_reporting_chain(p_cafe_id, v_day);
  end loop;

  select array_agg(distinct date_trunc('week', day_value::timestamp)::date order by date_trunc('week', day_value::timestamp)::date)
  into v_weeks
  from unnest(v_days) as t(day_value);

  select array_agg(distinct date_trunc('month', day_value::timestamp)::date order by date_trunc('month', day_value::timestamp)::date)
  into v_months
  from unnest(v_days) as t(day_value);

  select array_agg(distinct date_trunc('year', day_value::timestamp)::date order by date_trunc('year', day_value::timestamp)::date)
  into v_years
  from unnest(v_days) as t(day_value);

  v_result := jsonb_build_object(
    'ok', true,
    'backfilled', true,
    'start_date', v_effective_start,
    'end_date', coalesce(p_end_date, current_date),
    'business_day_count', coalesce(array_length(v_days, 1), 0),
    'business_dates', to_jsonb(v_days),
    'weekly_summary_weeks', coalesce(to_jsonb(v_weeks), '[]'::jsonb),
    'monthly_summary_months', coalesce(to_jsonb(v_months), '[]'::jsonb),
    'yearly_summary_years', coalesce(to_jsonb(v_years), '[]'::jsonb),
    'rebuild_deferred_balances', coalesce(p_rebuild_deferred_balances, true)
  );

  update ops.reporting_maintenance_runs
  set status = 'succeeded',
      result_json = v_result,
      finished_at = now()
  where id = v_run_id;

  return v_result;
exception
  when others then
    update ops.reporting_maintenance_runs
    set status = 'failed',
        result_json = jsonb_build_object('ok', false, 'error', sqlerrm),
        finished_at = now()
    where id = v_run_id;
    raise;
end;
$$;

create or replace function public.ops_reconcile_reporting_window(
  p_cafe_id uuid,
  p_start_date date,
  p_end_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_run_id uuid;
  v_result jsonb;
begin
  insert into ops.reporting_maintenance_runs (
    cafe_id,
    run_kind,
    triggered_by,
    dry_run,
    window_start_date,
    window_end_date,
    request_json
  ) values (
    p_cafe_id,
    'reconcile',
    'db',
    true,
    p_start_date,
    coalesce(p_end_date, current_date),
    jsonb_build_object(
      'start_date', p_start_date,
      'end_date', coalesce(p_end_date, current_date)
    )
  ) returning id into v_run_id;

  with source as (
    select
      s.business_date,
      count(*)::int as shift_count,
      coalesce(sum(coalesce((ss.snapshot_json -> 'totals' ->> 'submitted_qty')::numeric, 0)), 0) as submitted_qty,
      coalesce(sum(coalesce((ss.snapshot_json -> 'totals' ->> 'delivered_qty')::numeric, 0)), 0) as delivered_qty,
      coalesce(sum(coalesce((ss.snapshot_json -> 'totals' ->> 'paid_qty')::numeric, 0)), 0) as paid_qty,
      coalesce(sum(coalesce((ss.snapshot_json -> 'totals' ->> 'deferred_qty')::numeric, 0)), 0) as deferred_qty,
      coalesce(sum(coalesce((ss.snapshot_json -> 'totals' ->> 'net_sales')::numeric, 0)), 0)::numeric(12,2) as net_sales,
      coalesce(sum(coalesce((ss.snapshot_json -> 'totals' ->> 'cash_total')::numeric, 0)), 0)::numeric(12,2) as cash_total,
      coalesce(sum(coalesce((ss.snapshot_json -> 'totals' ->> 'deferred_total')::numeric, 0)), 0)::numeric(12,2) as deferred_total,
      coalesce(sum(coalesce((ss.snapshot_json -> 'totals' ->> 'repayment_total')::numeric, 0)), 0)::numeric(12,2) as repayment_total,
      coalesce(sum(coalesce((ss.snapshot_json -> 'totals' ->> 'complaint_total')::numeric, 0)), 0) as complaint_total,
      coalesce(sum(coalesce((ss.snapshot_json -> 'totals' ->> 'item_issue_total')::numeric, 0)), 0) as item_issue_total,
      count(distinct s.shift_kind)::int as shift_kind_count
    from ops.shifts s
    join ops.shift_snapshots ss
      on ss.cafe_id = s.cafe_id
     and ss.shift_id = s.id
    where s.cafe_id = p_cafe_id
      and s.status = 'closed'
      and s.business_date between p_start_date and coalesce(p_end_date, current_date)
    group by s.business_date
  ),
  compared as (
    select
      src.business_date,
      src.shift_count,
      src.shift_kind_count,
      ds.is_finalized,
      ds.closed_shift_count,
      (ds.id is null) as missing_daily,
      coalesce((ds.snapshot_json -> 'summary' ->> 'shift_count')::int, 0) as snapshot_shift_count,
      coalesce((ds.snapshot_json -> 'summary' ->> 'submitted_qty')::numeric, 0) as snapshot_submitted_qty,
      coalesce((ds.snapshot_json -> 'summary' ->> 'delivered_qty')::numeric, 0) as snapshot_delivered_qty,
      coalesce((ds.snapshot_json -> 'summary' ->> 'paid_qty')::numeric, 0) as snapshot_paid_qty,
      coalesce((ds.snapshot_json -> 'summary' ->> 'deferred_qty')::numeric, 0) as snapshot_deferred_qty,
      coalesce((ds.snapshot_json -> 'summary' ->> 'net_sales')::numeric, 0) as snapshot_net_sales,
      coalesce((ds.snapshot_json -> 'summary' ->> 'cash_total')::numeric, 0) as snapshot_cash_total,
      coalesce((ds.snapshot_json -> 'summary' ->> 'deferred_total')::numeric, 0) as snapshot_deferred_total,
      coalesce((ds.snapshot_json -> 'summary' ->> 'repayment_total')::numeric, 0) as snapshot_repayment_total,
      coalesce((ds.snapshot_json -> 'summary' ->> 'complaint_total')::numeric, 0) as snapshot_complaint_total,
      coalesce((ds.snapshot_json -> 'summary' ->> 'item_issue_total')::numeric, 0) as snapshot_item_issue_total,
      src.submitted_qty,
      src.delivered_qty,
      src.paid_qty,
      src.deferred_qty,
      src.net_sales,
      src.cash_total,
      src.deferred_total,
      src.repayment_total,
      src.complaint_total,
      src.item_issue_total
    from source src
    left join ops.daily_snapshots ds
      on ds.cafe_id = p_cafe_id
     and ds.business_date = src.business_date
  ),
  mismatches as (
    select
      business_date,
      jsonb_strip_nulls(jsonb_build_object(
        'business_date', business_date,
        'reason', case when missing_daily then 'missing_daily_snapshot' end,
        'expected_shift_count', shift_count,
        'actual_shift_count', snapshot_shift_count,
        'expected_submitted_qty', submitted_qty,
        'actual_submitted_qty', snapshot_submitted_qty,
        'expected_delivered_qty', delivered_qty,
        'actual_delivered_qty', snapshot_delivered_qty,
        'expected_paid_qty', paid_qty,
        'actual_paid_qty', snapshot_paid_qty,
        'expected_deferred_qty', deferred_qty,
        'actual_deferred_qty', snapshot_deferred_qty,
        'expected_net_sales', net_sales,
        'actual_net_sales', snapshot_net_sales,
        'expected_cash_total', cash_total,
        'actual_cash_total', snapshot_cash_total,
        'expected_deferred_total', deferred_total,
        'actual_deferred_total', snapshot_deferred_total,
        'expected_repayment_total', repayment_total,
        'actual_repayment_total', snapshot_repayment_total,
        'expected_complaint_total', complaint_total,
        'actual_complaint_total', snapshot_complaint_total,
        'expected_item_issue_total', item_issue_total,
        'actual_item_issue_total', snapshot_item_issue_total,
        'is_finalized', is_finalized,
        'closed_shift_count', closed_shift_count
      )) as detail
    from compared
    where missing_daily
       or snapshot_shift_count <> shift_count
       or snapshot_submitted_qty <> submitted_qty
       or snapshot_delivered_qty <> delivered_qty
       or snapshot_paid_qty <> paid_qty
       or snapshot_deferred_qty <> deferred_qty
       or snapshot_net_sales <> net_sales
       or snapshot_cash_total <> cash_total
       or snapshot_deferred_total <> deferred_total
       or snapshot_repayment_total <> repayment_total
       or snapshot_complaint_total <> complaint_total
       or snapshot_item_issue_total <> item_issue_total
       or ((shift_kind_count = 2) and coalesce(is_finalized, false) = false)
  ),
  weeks as (
    select array_agg(distinct date_trunc('week', business_date::timestamp)::date order by date_trunc('week', business_date::timestamp)::date) as value
    from source
  ),
  missing_weekly as (
    select coalesce(jsonb_agg(week_start_date order by week_start_date), '[]'::jsonb) as value
    from (
      select week_start_date
      from unnest(coalesce((select value from weeks), '{}'::date[])) as week_start_date
      where not exists (
        select 1
        from ops.weekly_summaries ws
        where ws.cafe_id = p_cafe_id
          and ws.week_start_date = week_start_date
      )
    ) q
  ),
  months as (
    select array_agg(distinct date_trunc('month', business_date::timestamp)::date order by date_trunc('month', business_date::timestamp)::date) as value
    from source
  ),
  missing_monthly as (
    select coalesce(jsonb_agg(month_start_date order by month_start_date), '[]'::jsonb) as value
    from (
      select month_start_date
      from unnest(coalesce((select value from months), '{}'::date[])) as month_start_date
      where not exists (
        select 1
        from ops.monthly_summaries ms
        where ms.cafe_id = p_cafe_id
          and ms.month_start_date = month_start_date
      )
    ) q
  ),
  years as (
    select array_agg(distinct date_trunc('year', business_date::timestamp)::date order by date_trunc('year', business_date::timestamp)::date) as value
    from source
  ),
  missing_yearly as (
    select coalesce(jsonb_agg(year_start_date order by year_start_date), '[]'::jsonb) as value
    from (
      select year_start_date
      from unnest(coalesce((select value from years), '{}'::date[])) as year_start_date
      where not exists (
        select 1
        from ops.yearly_summaries ys
        where ys.cafe_id = p_cafe_id
          and ys.year_start_date = year_start_date
      )
    ) q
  )
  select jsonb_build_object(
    'ok', true,
    'start_date', p_start_date,
    'end_date', coalesce(p_end_date, current_date),
    'business_day_count', coalesce((select count(*)::int from source), 0),
    'daily_mismatch_count', coalesce((select count(*)::int from mismatches), 0),
    'daily_mismatches', coalesce((select jsonb_agg(detail order by business_date) from mismatches), '[]'::jsonb),
    'missing_weekly_summaries', (select value from missing_weekly),
    'missing_monthly_summaries', (select value from missing_monthly),
    'missing_yearly_summaries', (select value from missing_yearly)
  ) into v_result;

  update ops.reporting_maintenance_runs
  set status = 'succeeded',
      result_json = v_result,
      finished_at = now()
  where id = v_run_id;

  return v_result;
exception
  when others then
    update ops.reporting_maintenance_runs
    set status = 'failed',
        result_json = jsonb_build_object('ok', false, 'error', sqlerrm),
        finished_at = now()
    where id = v_run_id;
    raise;
end;
$$;

commit;
