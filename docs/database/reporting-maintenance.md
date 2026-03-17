# Reporting maintenance and archive automation

Canonical read-path note:

- closed-shift truth stays in `ops.shift_snapshots`
- day/week/month/year summaries are performance layers, not a stronger source of truth than the closed-shift detail
- any stale or incomplete summary row must be rejected in favor of the detail path until backfill/reconcile catches up

## Phase 4 - archive as a cleaning layer only

- Archive eligibility now requires:
  - `ops.shifts.status = ''closed''`
  - `ops.daily_snapshots.is_finalized = true`
  - `ops.shifts.detail_archived_at is null`
  - `business_date <= archive_before_date`
- `public.ops_archive_closed_data(...)` now supports `p_dry_run`.
- Every archive/backfill/reconcile execution is logged in `ops.reporting_maintenance_runs`.

## Phase 5 - scheduler

The App Router route handler:
- `/api/internal/maintenance/reporting`

Actions:
- `action=backfill`
- `action=reconcile`
- `action=archive`

Authentication:
- Vercel cron should send `Authorization: Bearer ${CRON_SECRET}` automatically when `CRON_SECRET` is configured.

Configured schedules live in `apps/web/vercel.json`:
- Daily backfill window refresh
- Daily reconciliation window check
- Weekly archive run with grace days

## Phase 6 - backfill and reconciliation

### Backfill

Use:
- `public.ops_backfill_reporting_history(...)`

This rebuilds:
- day
- week
- month
- year
- deferred customer balances

### Reconciliation

Use:
- `public.ops_reconcile_reporting_window(...)`

This compares each `daily_snapshot` against the source `shift_snapshots` for the selected window and also checks the existence of weekly/monthly/yearly summary rows.


## Phase 7 - release gate and smoke verification

- Static verification now lives in `scripts/verify-reporting-maintenance-release.mjs`.
- Runtime smoke now lives in `scripts/smoke-reporting-maintenance.mjs`.
- The smoke sequence is intentionally ordered as: `backfill` -> `reconcile` -> `archive dry-run`.
- Real archive execution remains manual after reviewing the dry-run output.
- The verification matrix lives in `docs/execution/reporting-maintenance-verification-matrix.md`.


## Phase 8 - archive approval flow and post-archive checks

The weekly cron no longer performs destructive archive execution directly.

The new production flow is:
- `archive-plan` via GET
- review the pending approval
- `archive-execute` via POST with `ARCHIVE_APPROVAL_SECRET`
- post-archive runtime check

New SQL objects:
- `ops.archive_execution_approvals`
- `public.ops_request_archive_execution_approval(...)`
- `public.ops_post_archive_runtime_check(...)`
- `public.ops_execute_archive_execution_approval(...)`

The post-archive runtime check verifies both runtime residue cleanup and summary coverage for archived days, weeks, months, and years.

## Phase 9 - deferred finance stays live

Deferred customer finance is now explicitly outside the archive layer:
- `ops.deferred_ledger_entries` stays live
- `ops.deferred_customer_balances` stays live
- archived service sessions and payments may null out ledger foreign keys through `ON DELETE SET NULL`

Operational meaning:
- deferred settlement is still counted inside day/week/month/year reporting through the closed-shift snapshots
- the debtor ledger itself is not archived
- table/session/order/payment detail may move to `archive.*` after the grace window without removing the open debtor balance

New SQL object:
- `public.ops_assert_deferred_finance_non_archival_policy()`

The post-archive runtime check now also verifies:
- no `archive.deferred_ledger_entries` table exists
- no `archive.deferred_customer_balances` table exists
- deferred ledger/payment foreign keys still use `ON DELETE SET NULL`
- the live deferred finance tables still exist for the cafe
