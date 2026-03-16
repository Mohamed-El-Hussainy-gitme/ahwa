begin;

create schema if not exists archive;

alter table ops.shifts
  add column if not exists detail_archived_at timestamptz;

create table if not exists ops.daily_snapshots (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  business_date date not null,
  snapshot_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cafe_id, business_date)
);

create index if not exists idx_daily_snapshots_cafe_date
  on ops.daily_snapshots(cafe_id, business_date desc);

create table if not exists ops.weekly_summaries (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  week_start_date date not null,
  week_end_date date not null,
  summary_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cafe_id, week_start_date),
  constraint ck_weekly_summaries_range check (week_end_date = week_start_date + 6)
);

create index if not exists idx_weekly_summaries_cafe_week
  on ops.weekly_summaries(cafe_id, week_start_date desc);

create table if not exists archive.service_sessions (like ops.service_sessions including defaults);
create table if not exists archive.orders (like ops.orders including defaults);
create table if not exists archive.order_items (like ops.order_items including defaults);
create table if not exists archive.fulfillment_events (like ops.fulfillment_events including defaults);
create table if not exists archive.payments (like ops.payments including defaults);
create table if not exists archive.payment_allocations (like ops.payment_allocations including defaults);
create table if not exists archive.complaints (like ops.complaints including defaults);
create table if not exists archive.order_item_issues (like ops.order_item_issues including defaults);
create table if not exists archive.audit_events (like ops.audit_events including defaults);

alter table archive.service_sessions add column if not exists archived_at timestamptz not null default now();
alter table archive.service_sessions add column if not exists archived_business_date date;
alter table archive.orders add column if not exists archived_at timestamptz not null default now();
alter table archive.orders add column if not exists archived_business_date date;
alter table archive.order_items add column if not exists archived_at timestamptz not null default now();
alter table archive.order_items add column if not exists archived_business_date date;
alter table archive.fulfillment_events add column if not exists archived_at timestamptz not null default now();
alter table archive.fulfillment_events add column if not exists archived_business_date date;
alter table archive.payments add column if not exists archived_at timestamptz not null default now();
alter table archive.payments add column if not exists archived_business_date date;
alter table archive.payment_allocations add column if not exists archived_at timestamptz not null default now();
alter table archive.payment_allocations add column if not exists archived_business_date date;
alter table archive.complaints add column if not exists archived_at timestamptz not null default now();
alter table archive.complaints add column if not exists archived_business_date date;
alter table archive.order_item_issues add column if not exists archived_at timestamptz not null default now();
alter table archive.order_item_issues add column if not exists archived_business_date date;
alter table archive.audit_events add column if not exists archived_at timestamptz not null default now();
alter table archive.audit_events add column if not exists archived_business_date date;

create unique index if not exists idx_archive_service_sessions_key on archive.service_sessions(cafe_id, id);
create unique index if not exists idx_archive_orders_key on archive.orders(cafe_id, id);
create unique index if not exists idx_archive_order_items_key on archive.order_items(cafe_id, id);
create unique index if not exists idx_archive_fulfillment_events_key on archive.fulfillment_events(cafe_id, id);
create unique index if not exists idx_archive_payments_key on archive.payments(cafe_id, id);
create unique index if not exists idx_archive_payment_allocations_key on archive.payment_allocations(cafe_id, id);
create unique index if not exists idx_archive_complaints_key on archive.complaints(cafe_id, id);
create unique index if not exists idx_archive_order_item_issues_key on archive.order_item_issues(cafe_id, id);
create unique index if not exists idx_archive_audit_events_key on archive.audit_events(cafe_id, id);

create index if not exists idx_archive_service_sessions_cafe_date on archive.service_sessions(cafe_id, archived_business_date desc, closed_at desc nulls last);
create index if not exists idx_archive_orders_cafe_date on archive.orders(cafe_id, archived_business_date desc, created_at desc);
create index if not exists idx_archive_order_items_cafe_date on archive.order_items(cafe_id, archived_business_date desc, created_at desc);
create index if not exists idx_archive_fulfillment_events_cafe_date on archive.fulfillment_events(cafe_id, archived_business_date desc, created_at desc);
create index if not exists idx_archive_payments_cafe_date on archive.payments(cafe_id, archived_business_date desc, created_at desc);
create index if not exists idx_archive_payment_allocations_cafe_date on archive.payment_allocations(cafe_id, archived_business_date desc, created_at desc);
create index if not exists idx_archive_complaints_cafe_date on archive.complaints(cafe_id, archived_business_date desc, created_at desc);
create index if not exists idx_archive_order_item_issues_cafe_date on archive.order_item_issues(cafe_id, archived_business_date desc, created_at desc);
create index if not exists idx_archive_audit_events_cafe_date on archive.audit_events(cafe_id, archived_business_date desc, created_at desc);

create or replace function public.ops_refresh_daily_snapshot(
  p_cafe_id uuid,
  p_business_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_snapshot jsonb;
begin
  with source as (
    select
      s.id as shift_id,
      s.shift_kind,
      s.business_date,
      s.opened_at,
      s.closed_at,
      ss.snapshot_json
    from ops.shifts s
    join ops.shift_snapshots ss
      on ss.cafe_id = s.cafe_id
     and ss.shift_id = s.id
    where s.cafe_id = p_cafe_id
      and s.business_date = p_business_date
      and s.status = 'closed'
  ),
  counts as (
    select count(*)::int as shift_count from source
  ),
  totals as (
    select
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'submitted_qty')::numeric, 0)), 0) as submitted_qty,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'ready_qty')::numeric, 0)), 0) as ready_qty,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'delivered_qty')::numeric, 0)), 0) as delivered_qty,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'replacement_delivered_qty')::numeric, 0)), 0) as replacement_delivered_qty,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'paid_qty')::numeric, 0)), 0) as paid_qty,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'deferred_qty')::numeric, 0)), 0) as deferred_qty,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'remade_qty')::numeric, 0)), 0) as remade_qty,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'cancelled_qty')::numeric, 0)), 0) as cancelled_qty,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'waived_qty')::numeric, 0)), 0) as waived_qty,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'net_sales')::numeric, 0)), 0)::numeric(12,2) as net_sales,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'cash_total')::numeric, 0)), 0)::numeric(12,2) as cash_total,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'deferred_total')::numeric, 0)), 0)::numeric(12,2) as deferred_total,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'repayment_total')::numeric, 0)), 0)::numeric(12,2) as repayment_total,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'complaint_total')::numeric, 0)), 0) as complaint_total,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'complaint_open')::numeric, 0)), 0) as complaint_open,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'complaint_resolved')::numeric, 0)), 0) as complaint_resolved,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'complaint_dismissed')::numeric, 0)), 0) as complaint_dismissed,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'complaint_remake')::numeric, 0)), 0) as complaint_remake,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'complaint_cancel')::numeric, 0)), 0) as complaint_cancel,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'complaint_waive')::numeric, 0)), 0) as complaint_waive,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'item_issue_total')::numeric, 0)), 0) as item_issue_total,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'item_issue_note')::numeric, 0)), 0) as item_issue_note,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'item_issue_remake')::numeric, 0)), 0) as item_issue_remake,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'item_issue_cancel')::numeric, 0)), 0) as item_issue_cancel,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'item_issue_waive')::numeric, 0)), 0) as item_issue_waive,
      coalesce(sum(coalesce((snapshot_json -> 'sessions' ->> 'open_sessions')::numeric, 0)), 0) as open_sessions,
      coalesce(sum(coalesce((snapshot_json -> 'sessions' ->> 'closed_sessions')::numeric, 0)), 0) as closed_sessions,
      coalesce(sum(coalesce((snapshot_json -> 'sessions' ->> 'total_sessions')::numeric, 0)), 0) as total_sessions,
      bool_or(shift_kind = 'morning') as has_morning_shift,
      bool_or(shift_kind = 'evening') as has_evening_shift
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
  shift_refs as (
    select
      coalesce(jsonb_agg(shift_id order by shift_kind, shift_id), '[]'::jsonb) as shift_ids,
      min(opened_at) as first_opened_at,
      max(closed_at) as last_closed_at
    from source
  )
  select case
    when (select shift_count from counts) = 0 then null
    else jsonb_build_object(
      'version', 1,
      'business_date', p_business_date,
      'summary', jsonb_build_object(
        'shift_count', (select shift_count from counts),
        'has_morning_shift', coalesce((select has_morning_shift from totals), false),
        'has_evening_shift', coalesce((select has_evening_shift from totals), false),
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
      'source_shift_ids', coalesce((select shift_ids from shift_refs), '[]'::jsonb),
      'first_opened_at', (select first_opened_at from shift_refs),
      'last_closed_at', (select last_closed_at from shift_refs)
    )
  end
  into v_snapshot;

  if v_snapshot is null then
    delete from ops.daily_snapshots
    where cafe_id = p_cafe_id
      and business_date = p_business_date;

    return jsonb_build_object(
      'ok', true,
      'deleted', true,
      'business_date', p_business_date
    );
  end if;

  insert into ops.daily_snapshots (
    cafe_id,
    business_date,
    snapshot_json,
    updated_at
  )
  values (
    p_cafe_id,
    p_business_date,
    v_snapshot,
    now()
  )
  on conflict (cafe_id, business_date)
  do update set snapshot_json = excluded.snapshot_json,
                updated_at = now();

  return v_snapshot;
end;
$$;

create or replace function public.ops_refresh_weekly_summary(
  p_cafe_id uuid,
  p_week_start_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_week_start date := date_trunc('week', p_week_start_date::timestamp)::date;
  v_week_end date := (date_trunc('week', p_week_start_date::timestamp)::date + 6);
  v_summary jsonb;
begin
  with source as (
    select
      business_date,
      snapshot_json
    from ops.daily_snapshots
    where cafe_id = p_cafe_id
      and business_date between v_week_start and v_week_end
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
      'week_start_date', v_week_start,
      'week_end_date', v_week_end,
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
  end
  into v_summary;

  if v_summary is null then
    delete from ops.weekly_summaries
    where cafe_id = p_cafe_id
      and week_start_date = v_week_start;

    return jsonb_build_object(
      'ok', true,
      'deleted', true,
      'week_start_date', v_week_start,
      'week_end_date', v_week_end
    );
  end if;

  insert into ops.weekly_summaries (
    cafe_id,
    week_start_date,
    week_end_date,
    summary_json,
    updated_at
  )
  values (
    p_cafe_id,
    v_week_start,
    v_week_end,
    v_summary,
    now()
  )
  on conflict (cafe_id, week_start_date)
  do update set week_end_date = excluded.week_end_date,
                summary_json = excluded.summary_json,
                updated_at = now();

  return v_summary;
end;
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
    'weekly_summary_weeks', coalesce(to_jsonb(v_weeks), '[]'::jsonb)
  );
end;
$$;

create or replace function public.ops_run_weekly_archive(
  p_cafe_id uuid,
  p_grace_days integer default 14
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
  return public.ops_archive_closed_data(p_cafe_id, v_cutoff, true);
end;
$$;

commit;
