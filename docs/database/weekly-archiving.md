# Weekly archiving and rollups

This migration adds three layers without changing the live runtime flow:

1. `ops.daily_snapshots`
2. `ops.weekly_summaries`
3. `archive.*` tables for closed operational detail rows

## What stays hot

Operational tables stay focused on the current and recent working set:

- open or recently closed shifts
- current service sessions
- current orders and order items
- recent fulfillment and payments

## What gets archived

The archive job moves closed historical detail rows into `archive.*` and leaves the canonical summaries behind:

- `archive.service_sessions`
- `archive.orders`
- `archive.order_items`
- `archive.fulfillment_events`
- `archive.payments`
- `archive.payment_allocations`
- `archive.complaints`
- `archive.order_item_issues`
- `archive.audit_events`

`ops.shift_snapshots` remain in place and are the source for daily and weekly rollups.

## Rollup functions

### Refresh one day

```sql
select public.ops_refresh_daily_snapshot(
  '<cafe-id>'::uuid,
  date '2026-03-16'
);
```

### Refresh one week

```sql
select public.ops_refresh_weekly_summary(
  '<cafe-id>'::uuid,
  date '2026-03-16'
);
```

The week start is normalized internally using PostgreSQL `date_trunc('week', ...)`.

## Archive functions

### Archive closed detail rows up to a cutoff date

```sql
select public.ops_archive_closed_data(
  '<cafe-id>'::uuid,
  current_date - 14,
  true
);
```

Arguments:

- `p_cafe_id`: tenant cafe id
- `p_archive_before_date`: archive closed shifts whose `business_date` is on or before this date
- `p_rebuild_rollups`: rebuild daily and weekly summaries for affected dates before moving detail rows

### Weekly convenience wrapper

```sql
select public.ops_run_weekly_archive(
  '<cafe-id>'::uuid,
  14
);
```

This keeps a grace window in the hot tables so late corrections can still happen before detail rows move to archive.

## Recommended cadence

- On every shift close: continue building `ops.shift_snapshots`
- Nightly: refresh `ops.daily_snapshots` for recently closed business dates
- Weekly: refresh `ops.weekly_summaries`
- Weekly after grace window: run `public.ops_run_weekly_archive(...)`

## Important note about deferred ledger

This first archive layer intentionally leaves `ops.deferred_ledger_entries` in the live schema.

Reason:

- current debtor balances still read raw ledger rows in the application
- moving ledger rows requires a carried-forward balance model first

This keeps customer balances correct while still reducing most operational table growth.


## التجميع الشهري والسنوي

بعد هذه المرحلة أصبح المسار كالتالي:

- `ops.shift_snapshots` عند إغلاق كل وردية
- `ops.daily_snapshots` من الوردية/اليوم
- `ops.weekly_summaries` من الأيام
- `ops.monthly_summaries` من الأيام
- `ops.yearly_summaries` من الشهور

ودالة `public.ops_archive_closed_data(...)` صارت تعيد بناء اليومي والأسبوعي والشهري والسنوي قبل نقل التفاصيل القديمة إلى `archive.*`.

## ملاحظة التشغيل الساخن

ما زال كل من:

- `ops.deferred_ledger_entries`
- `ops.menu_sections`
- `ops.menu_products`

خارج الأرشفة عمدًا، لأنها جزء من التشغيل الساخن.
