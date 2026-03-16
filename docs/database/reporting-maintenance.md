# Reporting maintenance and archive automation

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
