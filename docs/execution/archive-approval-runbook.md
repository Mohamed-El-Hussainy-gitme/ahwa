# Archive approval runbook

## Purpose

Run archive cleanup safely in production without breaking billing, dashboards, or reporting.

## Windows PowerShell secret generation

Use these commands to create and persist both deployment secrets on Windows:

```powershell
$CRON_SECRET = -join ((1..64) | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) })
$ARCHIVE_APPROVAL_SECRET = -join ((1..64) | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) })

$env:CRON_SECRET = $CRON_SECRET
$env:ARCHIVE_APPROVAL_SECRET = $ARCHIVE_APPROVAL_SECRET

[Environment]::SetEnvironmentVariable('CRON_SECRET', $CRON_SECRET, 'User')
[Environment]::SetEnvironmentVariable('ARCHIVE_APPROVAL_SECRET', $ARCHIVE_APPROVAL_SECRET, 'User')

Write-Host "CRON_SECRET=$CRON_SECRET"
Write-Host "ARCHIVE_APPROVAL_SECRET=$ARCHIVE_APPROVAL_SECRET"
```

## Step 1 - create plan

Use:

```bash
npm run archive:plan
```

Required environment:

```bash
export AHWA_REPORTING_MAINTENANCE_BASE_URL="https://<your-host>"
export AHWA_REPORTING_MAINTENANCE_CRON_SECRET="<cron-secret>"
export AHWA_REPORTING_MAINTENANCE_CAFE_ID="<optional-cafe-id>"
export AHWA_REPORTING_MAINTENANCE_GRACE_DAYS="14"
```

Expected output:
- `approvalId`
- `archiveBeforeDate`
- `shiftCount`
- whether approval is required

If `approvalRequired=false`, stop. There is nothing eligible to archive.

## Step 2 - review plan

Review the plan payload before execution:
- `shift_count`
- `service_session_count`
- `order_count`
- `order_item_count`
- `fulfillment_event_count`
- `payment_count`
- `complaint_count`
- `daily_snapshot_dates`
- `weekly_summary_weeks`
- `monthly_summary_months`
- `yearly_summary_years`

Do not approve execution if the window is unexpectedly large.

Also confirm the business rule for deferred finance remains intact:
- deferred settlements are already represented in reporting totals
- `ops.deferred_ledger_entries` is not part of the archive target
- `ops.deferred_customer_balances` remains the live debtor read model

## Step 3 - execute approved archive

Use:

```bash
export AHWA_REPORTING_ARCHIVE_APPROVAL_ID="<approval-id-from-plan>"
export AHWA_REPORTING_ARCHIVE_APPROVAL_SECRET="<archive-approval-secret>"
export AHWA_REPORTING_ARCHIVE_APPROVED_BY="mohamed-ahmed"
export AHWA_REPORTING_ARCHIVE_NOTES="weekly archive after review"

npm run archive:execute
```

The execute request requires both:
- `CRON_SECRET`
- `ARCHIVE_APPROVAL_SECRET`

## Step 4 - inspect post-check result

A successful execution must return:
- `result.execution.ok = true`
- `result.post_check.ok = true`

Inspect these sections carefully:
- `lingering_runtime_rows`
- `missing_daily_finalized_snapshots`
- `missing_weekly_summaries`
- `missing_monthly_summaries`
- `missing_yearly_summaries`
- `deferred_live_finance`
- `deferred_finance_policy`

## Failure rules

### `APPROVAL_STALE_REPLAN_REQUIRED`
The eligible shift set changed after planning. Generate a new plan and do not reuse the old approval.

### `ARCHIVE_APPROVAL_EXPIRED`
The pending approval passed its expiry window. Generate a new plan.

### `failed_post_check`
Archive execution finished but runtime verification detected residue or missing summary coverage. Treat this as operational failure and investigate before approving the next run.
