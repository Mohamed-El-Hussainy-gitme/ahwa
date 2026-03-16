begin;

create table if not exists ops.monthly_summaries (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  month_start_date date not null,
  month_end_date date not null,
  summary_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cafe_id, month_start_date),
  constraint ck_monthly_summaries_range check (month_end_date >= month_start_date)
);

create index if not exists idx_monthly_summaries_cafe_month
  on ops.monthly_summaries(cafe_id, month_start_date desc);

create table if not exists ops.yearly_summaries (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  year_start_date date not null,
  year_end_date date not null,
  summary_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cafe_id, year_start_date),
  constraint ck_yearly_summaries_range check (year_end_date >= year_start_date)
);

create index if not exists idx_yearly_summaries_cafe_year
  on ops.yearly_summaries(cafe_id, year_start_date desc);

create or replace function public.ops_refresh_monthly_summary(
  p_cafe_id uuid,
  p_month_start_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_month_start date := date_trunc('month', p_month_start_date::timestamp)::date;
  v_month_end date := ((v_month_start + interval '1 month')::date - 1);
  v_summary jsonb;
begin
  with source as (
    select business_date, snapshot_json
    from ops.daily_snapshots
    where cafe_id = p_cafe_id
      and business_date between v_month_start and v_month_end
  ),
  counts as (
    select count(*)::int as day_count from source
  ),
  totals as (
    select
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'shift_count')::numeric, 0)), 0) as shift_count,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'submitted_qty')::numeric, 0)), 0) as submitted_qty,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'ready_qty')::numeric, 0)), 0) as ready_qty,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'delivered_qty')::numeric, 0)), 0) as delivered_qty,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'replacement_delivered_qty')::numeric, 0)), 0) as replacement_delivered_qty,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'paid_qty')::numeric, 0)), 0) as paid_qty,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'deferred_qty')::numeric, 0)), 0) as deferred_qty,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'remade_qty')::numeric, 0)), 0) as remade_qty,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'cancelled_qty')::numeric, 0)), 0) as cancelled_qty,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'waived_qty')::numeric, 0)), 0) as waived_qty,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'net_sales')::numeric, 0)), 0)::numeric(12,2) as net_sales,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'cash_total')::numeric, 0)), 0)::numeric(12,2) as cash_total,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'deferred_total')::numeric, 0)), 0)::numeric(12,2) as deferred_total,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'repayment_total')::numeric, 0)), 0)::numeric(12,2) as repayment_total,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'complaint_total')::numeric, 0)), 0) as complaint_total,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'complaint_open')::numeric, 0)), 0) as complaint_open,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'complaint_resolved')::numeric, 0)), 0) as complaint_resolved,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'complaint_dismissed')::numeric, 0)), 0) as complaint_dismissed,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'complaint_remake')::numeric, 0)), 0) as complaint_remake,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'complaint_cancel')::numeric, 0)), 0) as complaint_cancel,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'complaint_waive')::numeric, 0)), 0) as complaint_waive,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'item_issue_total')::numeric, 0)), 0) as item_issue_total,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'item_issue_note')::numeric, 0)), 0) as item_issue_note,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'item_issue_remake')::numeric, 0)), 0) as item_issue_remake,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'item_issue_cancel')::numeric, 0)), 0) as item_issue_cancel,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'item_issue_waive')::numeric, 0)), 0) as item_issue_waive,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'open_sessions')::numeric, 0)), 0) as open_sessions,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'closed_sessions')::numeric, 0)), 0) as closed_sessions,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'total_sessions')::numeric, 0)), 0) as total_sessions
    from source
  ),
  products as (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.product_name, x.station_code), '[]'::jsonb) as value
    from (
      select
        prod ->> 'product_id' as product_id,
        prod ->> 'product_name' as product_name,
        prod ->> 'station_code' as station_code,
        sum(coalesce((prod ->> 'qty_submitted')::numeric, 0))::bigint as qty_submitted,
        sum(coalesce((prod ->> 'qty_ready')::numeric, 0))::bigint as qty_ready,
        sum(coalesce((prod ->> 'qty_delivered')::numeric, 0))::bigint as qty_delivered,
        sum(coalesce((prod ->> 'qty_replacement_delivered')::numeric, 0))::bigint as qty_replacement_delivered,
        sum(coalesce((prod ->> 'qty_paid')::numeric, 0))::bigint as qty_paid,
        sum(coalesce((prod ->> 'qty_deferred')::numeric, 0))::bigint as qty_deferred,
        sum(coalesce((prod ->> 'qty_remade')::numeric, 0))::bigint as qty_remade,
        sum(coalesce((prod ->> 'qty_cancelled')::numeric, 0))::bigint as qty_cancelled,
        sum(coalesce((prod ->> 'qty_waived')::numeric, 0))::bigint as qty_waived,
        sum(coalesce((prod ->> 'gross_sales')::numeric, 0))::numeric(12,2) as gross_sales,
        sum(coalesce((prod ->> 'net_sales')::numeric, 0))::numeric(12,2) as net_sales
      from source,
      lateral jsonb_array_elements(coalesce(source.snapshot_json -> 'products', '[]'::jsonb)) as prod
      group by prod ->> 'product_id', prod ->> 'product_name', prod ->> 'station_code'
    ) x
  ),
  staff as (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.actor_label), '[]'::jsonb) as value
    from (
      select
        perf ->> 'actor_label' as actor_label,
        sum(coalesce((perf ->> 'submitted_qty')::numeric, 0))::bigint as submitted_qty,
        sum(coalesce((perf ->> 'ready_qty')::numeric, 0))::bigint as ready_qty,
        sum(coalesce((perf ->> 'delivered_qty')::numeric, 0))::bigint as delivered_qty,
        sum(coalesce((perf ->> 'replacement_delivered_qty')::numeric, 0))::bigint as replacement_delivered_qty,
        sum(coalesce((perf ->> 'remade_qty')::numeric, 0))::bigint as remade_qty,
        sum(coalesce((perf ->> 'cancelled_qty')::numeric, 0))::bigint as cancelled_qty,
        sum(coalesce((perf ->> 'waived_qty')::numeric, 0))::bigint as waived_qty,
        sum(coalesce((perf ->> 'payment_total')::numeric, 0))::numeric(12,2) as payment_total,
        sum(coalesce((perf ->> 'cash_sales')::numeric, 0))::numeric(12,2) as cash_sales,
        sum(coalesce((perf ->> 'deferred_sales')::numeric, 0))::numeric(12,2) as deferred_sales,
        sum(coalesce((perf ->> 'repayment_total')::numeric, 0))::numeric(12,2) as repayment_total,
        sum(coalesce((perf ->> 'complaint_count')::numeric, 0))::bigint as complaint_count,
        sum(coalesce((perf ->> 'item_issue_count')::numeric, 0))::bigint as item_issue_count
      from source,
      lateral jsonb_array_elements(coalesce(source.snapshot_json -> 'staff', '[]'::jsonb)) as perf
      group by perf ->> 'actor_label'
    ) x
  ),
  day_refs as (
    select
      coalesce(jsonb_agg(business_date order by business_date), '[]'::jsonb) as business_dates,
      min(business_date) as min_business_date,
      max(business_date) as max_business_date
    from source
  )
  select case
    when (select day_count from counts) = 0 then null
    else jsonb_build_object(
      'version', 1,
      'month_start_date', v_month_start,
      'month_end_date', v_month_end,
      'summary', jsonb_build_object(
        'day_count', (select day_count from counts),
        'shift_count', coalesce((select shift_count from totals), 0),
        'submitted_qty', coalesce((select submitted_qty from totals), 0),
        'ready_qty', coalesce((select ready_qty from totals), 0),
        'delivered_qty', coalesce((select delivered_qty from totals), 0),
        'replacement_delivered_qty', coalesce((select replacement_delivered_qty from totals), 0),
        'paid_qty', coalesce((select paid_qty from totals), 0),
        'deferred_qty', coalesce((select deferred_qty from totals), 0),
        'remade_qty', coalesce((select remade_qty from totals), 0),
        'cancelled_qty', coalesce((select cancelled_qty from totals), 0),
        'waived_qty', coalesce((select waived_qty from totals), 0),
        'net_sales', coalesce((select net_sales from totals), 0),
        'cash_total', coalesce((select cash_total from totals), 0),
        'deferred_total', coalesce((select deferred_total from totals), 0),
        'repayment_total', coalesce((select repayment_total from totals), 0),
        'complaint_total', coalesce((select complaint_total from totals), 0),
        'complaint_open', coalesce((select complaint_open from totals), 0),
        'complaint_resolved', coalesce((select complaint_resolved from totals), 0),
        'complaint_dismissed', coalesce((select complaint_dismissed from totals), 0),
        'complaint_remake', coalesce((select complaint_remake from totals), 0),
        'complaint_cancel', coalesce((select complaint_cancel from totals), 0),
        'complaint_waive', coalesce((select complaint_waive from totals), 0),
        'item_issue_total', coalesce((select item_issue_total from totals), 0),
        'item_issue_note', coalesce((select item_issue_note from totals), 0),
        'item_issue_remake', coalesce((select item_issue_remake from totals), 0),
        'item_issue_cancel', coalesce((select item_issue_cancel from totals), 0),
        'item_issue_waive', coalesce((select item_issue_waive from totals), 0),
        'open_sessions', coalesce((select open_sessions from totals), 0),
        'closed_sessions', coalesce((select closed_sessions from totals), 0),
        'total_sessions', coalesce((select total_sessions from totals), 0)
      ),
      'products', coalesce((select value from products), '[]'::jsonb),
      'staff', coalesce((select value from staff), '[]'::jsonb),
      'source_business_dates', coalesce((select business_dates from day_refs), '[]'::jsonb),
      'first_business_date', (select min_business_date from day_refs),
      'last_business_date', (select max_business_date from day_refs)
    )
  end into v_summary;

  if v_summary is null then
    delete from ops.monthly_summaries
    where cafe_id = p_cafe_id
      and month_start_date = v_month_start;

    return jsonb_build_object(
      'ok', true,
      'deleted', true,
      'month_start_date', v_month_start,
      'month_end_date', v_month_end
    );
  end if;

  insert into ops.monthly_summaries (
    cafe_id,
    month_start_date,
    month_end_date,
    summary_json,
    updated_at
  ) values (
    p_cafe_id,
    v_month_start,
    v_month_end,
    v_summary,
    now()
  )
  on conflict (cafe_id, month_start_date)
  do update set month_end_date = excluded.month_end_date,
                summary_json = excluded.summary_json,
                updated_at = now();

  return v_summary;
end;
$$;

create or replace function public.ops_refresh_yearly_summary(
  p_cafe_id uuid,
  p_year_start_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_year_start date := date_trunc('year', p_year_start_date::timestamp)::date;
  v_year_end date := ((v_year_start + interval '1 year')::date - 1);
  v_summary jsonb;
begin
  with source as (
    select month_start_date, summary_json
    from ops.monthly_summaries
    where cafe_id = p_cafe_id
      and month_start_date between v_year_start and v_year_end
  ),
  counts as (
    select count(*)::int as month_count from source
  ),
  totals as (
    select
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'day_count')::numeric, 0)), 0) as day_count,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'shift_count')::numeric, 0)), 0) as shift_count,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'submitted_qty')::numeric, 0)), 0) as submitted_qty,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'ready_qty')::numeric, 0)), 0) as ready_qty,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'delivered_qty')::numeric, 0)), 0) as delivered_qty,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'replacement_delivered_qty')::numeric, 0)), 0) as replacement_delivered_qty,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'paid_qty')::numeric, 0)), 0) as paid_qty,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'deferred_qty')::numeric, 0)), 0) as deferred_qty,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'remade_qty')::numeric, 0)), 0) as remade_qty,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'cancelled_qty')::numeric, 0)), 0) as cancelled_qty,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'waived_qty')::numeric, 0)), 0) as waived_qty,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'net_sales')::numeric, 0)), 0)::numeric(12,2) as net_sales,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'cash_total')::numeric, 0)), 0)::numeric(12,2) as cash_total,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'deferred_total')::numeric, 0)), 0)::numeric(12,2) as deferred_total,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'repayment_total')::numeric, 0)), 0)::numeric(12,2) as repayment_total,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'complaint_total')::numeric, 0)), 0) as complaint_total,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'complaint_open')::numeric, 0)), 0) as complaint_open,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'complaint_resolved')::numeric, 0)), 0) as complaint_resolved,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'complaint_dismissed')::numeric, 0)), 0) as complaint_dismissed,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'complaint_remake')::numeric, 0)), 0) as complaint_remake,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'complaint_cancel')::numeric, 0)), 0) as complaint_cancel,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'complaint_waive')::numeric, 0)), 0) as complaint_waive,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'item_issue_total')::numeric, 0)), 0) as item_issue_total,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'item_issue_note')::numeric, 0)), 0) as item_issue_note,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'item_issue_remake')::numeric, 0)), 0) as item_issue_remake,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'item_issue_cancel')::numeric, 0)), 0) as item_issue_cancel,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'item_issue_waive')::numeric, 0)), 0) as item_issue_waive,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'open_sessions')::numeric, 0)), 0) as open_sessions,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'closed_sessions')::numeric, 0)), 0) as closed_sessions,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'total_sessions')::numeric, 0)), 0) as total_sessions
    from source
  ),
  products as (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.product_name, x.station_code), '[]'::jsonb) as value
    from (
      select
        prod ->> 'product_id' as product_id,
        prod ->> 'product_name' as product_name,
        prod ->> 'station_code' as station_code,
        sum(coalesce((prod ->> 'qty_submitted')::numeric, 0))::bigint as qty_submitted,
        sum(coalesce((prod ->> 'qty_ready')::numeric, 0))::bigint as qty_ready,
        sum(coalesce((prod ->> 'qty_delivered')::numeric, 0))::bigint as qty_delivered,
        sum(coalesce((prod ->> 'qty_replacement_delivered')::numeric, 0))::bigint as qty_replacement_delivered,
        sum(coalesce((prod ->> 'qty_paid')::numeric, 0))::bigint as qty_paid,
        sum(coalesce((prod ->> 'qty_deferred')::numeric, 0))::bigint as qty_deferred,
        sum(coalesce((prod ->> 'qty_remade')::numeric, 0))::bigint as qty_remade,
        sum(coalesce((prod ->> 'qty_cancelled')::numeric, 0))::bigint as qty_cancelled,
        sum(coalesce((prod ->> 'qty_waived')::numeric, 0))::bigint as qty_waived,
        sum(coalesce((prod ->> 'gross_sales')::numeric, 0))::numeric(12,2) as gross_sales,
        sum(coalesce((prod ->> 'net_sales')::numeric, 0))::numeric(12,2) as net_sales
      from source,
      lateral jsonb_array_elements(coalesce(source.summary_json -> 'products', '[]'::jsonb)) as prod
      group by prod ->> 'product_id', prod ->> 'product_name', prod ->> 'station_code'
    ) x
  ),
  staff as (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.actor_label), '[]'::jsonb) as value
    from (
      select
        perf ->> 'actor_label' as actor_label,
        sum(coalesce((perf ->> 'submitted_qty')::numeric, 0))::bigint as submitted_qty,
        sum(coalesce((perf ->> 'ready_qty')::numeric, 0))::bigint as ready_qty,
        sum(coalesce((perf ->> 'delivered_qty')::numeric, 0))::bigint as delivered_qty,
        sum(coalesce((perf ->> 'replacement_delivered_qty')::numeric, 0))::bigint as replacement_delivered_qty,
        sum(coalesce((perf ->> 'remade_qty')::numeric, 0))::bigint as remade_qty,
        sum(coalesce((perf ->> 'cancelled_qty')::numeric, 0))::bigint as cancelled_qty,
        sum(coalesce((perf ->> 'waived_qty')::numeric, 0))::bigint as waived_qty,
        sum(coalesce((perf ->> 'payment_total')::numeric, 0))::numeric(12,2) as payment_total,
        sum(coalesce((perf ->> 'cash_sales')::numeric, 0))::numeric(12,2) as cash_sales,
        sum(coalesce((perf ->> 'deferred_sales')::numeric, 0))::numeric(12,2) as deferred_sales,
        sum(coalesce((perf ->> 'repayment_total')::numeric, 0))::numeric(12,2) as repayment_total,
        sum(coalesce((perf ->> 'complaint_count')::numeric, 0))::bigint as complaint_count,
        sum(coalesce((perf ->> 'item_issue_count')::numeric, 0))::bigint as item_issue_count
      from source,
      lateral jsonb_array_elements(coalesce(source.summary_json -> 'staff', '[]'::jsonb)) as perf
      group by perf ->> 'actor_label'
    ) x
  ),
  month_refs as (
    select
      coalesce(jsonb_agg(month_start_date order by month_start_date), '[]'::jsonb) as month_starts,
      min(month_start_date) as min_month_start,
      max(month_start_date) as max_month_start
    from source
  )
  select case
    when (select month_count from counts) = 0 then null
    else jsonb_build_object(
      'version', 1,
      'year_start_date', v_year_start,
      'year_end_date', v_year_end,
      'summary', jsonb_build_object(
        'month_count', (select month_count from counts),
        'day_count', coalesce((select day_count from totals), 0),
        'shift_count', coalesce((select shift_count from totals), 0),
        'submitted_qty', coalesce((select submitted_qty from totals), 0),
        'ready_qty', coalesce((select ready_qty from totals), 0),
        'delivered_qty', coalesce((select delivered_qty from totals), 0),
        'replacement_delivered_qty', coalesce((select replacement_delivered_qty from totals), 0),
        'paid_qty', coalesce((select paid_qty from totals), 0),
        'deferred_qty', coalesce((select deferred_qty from totals), 0),
        'remade_qty', coalesce((select remade_qty from totals), 0),
        'cancelled_qty', coalesce((select cancelled_qty from totals), 0),
        'waived_qty', coalesce((select waived_qty from totals), 0),
        'net_sales', coalesce((select net_sales from totals), 0),
        'cash_total', coalesce((select cash_total from totals), 0),
        'deferred_total', coalesce((select deferred_total from totals), 0),
        'repayment_total', coalesce((select repayment_total from totals), 0),
        'complaint_total', coalesce((select complaint_total from totals), 0),
        'complaint_open', coalesce((select complaint_open from totals), 0),
        'complaint_resolved', coalesce((select complaint_resolved from totals), 0),
        'complaint_dismissed', coalesce((select complaint_dismissed from totals), 0),
        'complaint_remake', coalesce((select complaint_remake from totals), 0),
        'complaint_cancel', coalesce((select complaint_cancel from totals), 0),
        'complaint_waive', coalesce((select complaint_waive from totals), 0),
        'item_issue_total', coalesce((select item_issue_total from totals), 0),
        'item_issue_note', coalesce((select item_issue_note from totals), 0),
        'item_issue_remake', coalesce((select item_issue_remake from totals), 0),
        'item_issue_cancel', coalesce((select item_issue_cancel from totals), 0),
        'item_issue_waive', coalesce((select item_issue_waive from totals), 0),
        'open_sessions', coalesce((select open_sessions from totals), 0),
        'closed_sessions', coalesce((select closed_sessions from totals), 0),
        'total_sessions', coalesce((select total_sessions from totals), 0)
      ),
      'products', coalesce((select value from products), '[]'::jsonb),
      'staff', coalesce((select value from staff), '[]'::jsonb),
      'source_month_start_dates', coalesce((select month_starts from month_refs), '[]'::jsonb),
      'first_month_start_date', (select min_month_start from month_refs),
      'last_month_start_date', (select max_month_start from month_refs)
    )
  end into v_summary;

  if v_summary is null then
    delete from ops.yearly_summaries
    where cafe_id = p_cafe_id
      and year_start_date = v_year_start;

    return jsonb_build_object(
      'ok', true,
      'deleted', true,
      'year_start_date', v_year_start,
      'year_end_date', v_year_end
    );
  end if;

  insert into ops.yearly_summaries (
    cafe_id,
    year_start_date,
    year_end_date,
    summary_json,
    updated_at
  ) values (
    p_cafe_id,
    v_year_start,
    v_year_end,
    v_summary,
    now()
  )
  on conflict (cafe_id, year_start_date)
  do update set year_end_date = excluded.year_end_date,
                summary_json = excluded.summary_json,
                updated_at = now();

  return v_summary;
end;
$$;

create or replace function public.ops_deferred_customer_summaries(
  p_cafe_id uuid
)
returns table (
  debtor_name text,
  entry_count bigint,
  debt_total numeric,
  repayment_total numeric,
  balance numeric,
  last_entry_at timestamptz,
  last_debt_at timestamptz,
  last_repayment_at timestamptz,
  last_entry_kind text
)
language sql
security definer
set search_path = public, ops
as $$
  with rows as (
    select id, debtor_name, entry_kind, amount, created_at
    from ops.deferred_ledger_entries
    where cafe_id = p_cafe_id
      and coalesce(trim(debtor_name), '') <> ''
  ),
  grouped as (
    select
      debtor_name,
      count(*)::bigint as entry_count,
      coalesce(sum(case when entry_kind = 'debt' then amount else 0 end), 0)::numeric as debt_total,
      coalesce(sum(case when entry_kind = 'repayment' then amount else 0 end), 0)::numeric as repayment_total,
      max(created_at) as last_entry_at,
      max(case when entry_kind = 'debt' then created_at end) as last_debt_at,
      max(case when entry_kind = 'repayment' then created_at end) as last_repayment_at
    from rows
    group by debtor_name
  ),
  latest as (
    select distinct on (debtor_name)
      debtor_name,
      entry_kind as last_entry_kind
    from rows
    order by debtor_name, created_at desc, id desc
  )
  select
    grouped.debtor_name,
    grouped.entry_count,
    grouped.debt_total,
    grouped.repayment_total,
    (grouped.debt_total - grouped.repayment_total)::numeric as balance,
    grouped.last_entry_at,
    grouped.last_debt_at,
    grouped.last_repayment_at,
    latest.last_entry_kind
  from grouped
  left join latest using (debtor_name)
  order by grouped.debtor_name;
$$;

create or replace function public.ops_archive_closed_data(
  p_cafe_id uuid,
  p_archive_before_date date default (current_date - 14),
  p_rebuild_rollups boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, archive
as $$
declare
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
begin
  select array_agg(s.id order by s.business_date, s.opened_at), count(*)::int
  into v_shift_ids, v_shift_count
  from ops.shifts s
  where s.cafe_id = p_cafe_id
    and s.status = 'closed'
    and s.business_date <= p_archive_before_date
    and s.detail_archived_at is null;

  if v_shift_count = 0 or v_shift_ids is null then
    return jsonb_build_object(
      'ok', true,
      'archived', false,
      'reason', 'NO_ELIGIBLE_SHIFTS',
      'archive_before_date', p_archive_before_date
    );
  end if;

  select array_agg(distinct s.business_date order by s.business_date)
  into v_days
  from ops.shifts s
  where s.cafe_id = p_cafe_id
    and s.id = any(v_shift_ids);

  if p_rebuild_rollups and v_days is not null then
    foreach v_day in array v_days loop
      perform public.ops_refresh_daily_snapshot(p_cafe_id, v_day);
    end loop;

    select array_agg(distinct date_trunc('week', day_value::timestamp)::date order by date_trunc('week', day_value::timestamp)::date)
    into v_weeks
    from unnest(v_days) as t(day_value);

    if v_weeks is not null then
      foreach v_week in array v_weeks loop
        perform public.ops_refresh_weekly_summary(p_cafe_id, v_week);
      end loop;
    end if;

    select array_agg(distinct date_trunc('month', day_value::timestamp)::date order by date_trunc('month', day_value::timestamp)::date)
    into v_months
    from unnest(v_days) as t(day_value);

    if v_months is not null then
      foreach v_month in array v_months loop
        perform public.ops_refresh_monthly_summary(p_cafe_id, v_month);
      end loop;
    end if;

    select array_agg(distinct date_trunc('year', day_value::timestamp)::date order by date_trunc('year', day_value::timestamp)::date)
    into v_years
    from unnest(v_days) as t(day_value);

    if v_years is not null then
      foreach v_year in array v_years loop
        perform public.ops_refresh_yearly_summary(p_cafe_id, v_year);
      end loop;
    end if;
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

  get diagnostics v_session_count = row_count;

  insert into archive.orders
  select o.*, now() as archived_at, sh.business_date as archived_business_date
  from ops.orders o
  join ops.shifts sh
    on sh.cafe_id = o.cafe_id
   and sh.id = o.shift_id
  where o.cafe_id = p_cafe_id
    and o.shift_id = any(v_shift_ids)
  on conflict (cafe_id, id) do nothing;

  get diagnostics v_order_count = row_count;

  insert into archive.order_items
  select oi.*, now() as archived_at, sh.business_date as archived_business_date
  from ops.order_items oi
  join ops.shifts sh
    on sh.cafe_id = oi.cafe_id
   and sh.id = oi.shift_id
  where oi.cafe_id = p_cafe_id
    and oi.shift_id = any(v_shift_ids)
  on conflict (cafe_id, id) do nothing;

  get diagnostics v_item_count = row_count;

  insert into archive.fulfillment_events
  select fe.*, now() as archived_at, sh.business_date as archived_business_date
  from ops.fulfillment_events fe
  join ops.shifts sh
    on sh.cafe_id = fe.cafe_id
   and sh.id = fe.shift_id
  where fe.cafe_id = p_cafe_id
    and fe.shift_id = any(v_shift_ids)
  on conflict (cafe_id, id) do nothing;

  get diagnostics v_fulfillment_count = row_count;

  insert into archive.payments
  select p.*, now() as archived_at, sh.business_date as archived_business_date
  from ops.payments p
  join ops.shifts sh
    on sh.cafe_id = p.cafe_id
   and sh.id = p.shift_id
  where p.cafe_id = p_cafe_id
    and p.shift_id = any(v_shift_ids)
  on conflict (cafe_id, id) do nothing;

  get diagnostics v_payment_count = row_count;

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

  get diagnostics v_allocation_count = row_count;

  insert into archive.complaints
  select c.*, now() as archived_at, sh.business_date as archived_business_date
  from ops.complaints c
  join ops.shifts sh
    on sh.cafe_id = c.cafe_id
   and sh.id = c.shift_id
  where c.cafe_id = p_cafe_id
    and c.shift_id = any(v_shift_ids)
  on conflict (cafe_id, id) do nothing;

  get diagnostics v_complaint_count = row_count;

  insert into archive.order_item_issues
  select i.*, now() as archived_at, sh.business_date as archived_business_date
  from ops.order_item_issues i
  join ops.shifts sh
    on sh.cafe_id = i.cafe_id
   and sh.id = i.shift_id
  where i.cafe_id = p_cafe_id
    and i.shift_id = any(v_shift_ids)
  on conflict (cafe_id, id) do nothing;

  get diagnostics v_issue_count = row_count;

  insert into archive.audit_events
  select ae.*, now() as archived_at, (ae.created_at at time zone 'utc')::date as archived_business_date
  from ops.audit_events ae
  where ae.cafe_id = p_cafe_id
    and (ae.created_at at time zone 'utc')::date <= p_archive_before_date
  on conflict (cafe_id, id) do nothing;

  get diagnostics v_audit_count = row_count;

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

  return jsonb_build_object(
    'ok', true,
    'archived', true,
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
end;
$$;

commit;
