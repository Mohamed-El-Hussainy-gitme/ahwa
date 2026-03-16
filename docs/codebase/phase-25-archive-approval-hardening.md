# Phase 25 - archive approval hardening

## Goal

Move archive execution from a single cron-triggered step to a controlled two-step flow:

1. `archive-plan`
2. `archive-execute`

This keeps weekly archive cleanup available, while preventing an unattended destructive run from deleting operational detail without an explicit approval token and a final consistency check.

## What changed

### Database

New migration:
- `0031_archive_approval_and_post_archive_checks.sql`

New objects:
- `ops.archive_execution_approvals`
- `public.ops_request_archive_execution_approval(...)`
- `public.ops_post_archive_runtime_check(...)`
- `public.ops_execute_archive_execution_approval(...)`

### App route

Internal reporting maintenance route now supports:
- `GET action=archive-plan`
- `POST action=archive-execute`

Real execution now requires:
- `Authorization: Bearer ${CRON_SECRET}`
- `x-archive-approval-secret: ${ARCHIVE_APPROVAL_SECRET}`
- `approvalId`

### Cron behavior

The scheduled weekly job now creates an approval plan only.
It no longer runs the destructive archive directly.

## Contract

### archive-plan

- Runs the same eligibility logic as archive
- Always uses dry-run semantics
- Generates a pending approval row when there is work to archive
- Expires automatically after 24 hours
- Supersedes older pending approvals for the same cafe

### archive-execute

- Locks the approval row
- Re-runs dry-run to detect drift before execution
- Rejects stale approvals if the eligible shift window changed
- Executes the archive only after approval validation passes
- Runs a post-archive runtime check before returning success

## Post-archive runtime check

The post-check verifies that archived shifts no longer leave detail rows in:
- `ops.service_sessions`
- `ops.orders`
- `ops.order_items`
- `ops.fulfillment_events`
- `ops.payments`
- `ops.payment_allocations`
- `ops.complaints`
- `ops.order_item_issues`

It also verifies coverage for:
- finalized `daily_snapshots`
- `weekly_summaries`
- `monthly_summaries`
- `yearly_summaries`

## Operational result

The archive path is now:

`plan -> review -> approve -> execute -> post-check`

instead of:

`cron -> archive immediately`
