# Post-archive runtime check matrix

## Scope

This matrix defines what must be true after a real archive execution.

## Database checks

### Runtime residue must be zero
- `ops.service_sessions` for archived shifts
- `ops.orders` for archived shifts
- `ops.order_items` for archived shifts
- `ops.fulfillment_events` for archived shifts
- `ops.payments` for archived shifts
- `ops.payment_allocations` for archived shifts
- `ops.complaints` for archived shifts
- `ops.order_item_issues` for archived shifts

### Historical coverage must exist
- finalized `ops.daily_snapshots` for each archived business day
- `ops.weekly_summaries` for each archived week
- `ops.monthly_summaries` for each archived month
- `ops.yearly_summaries` for each archived year

## Route-level expectations

### archive-plan
- returns `approval_required=false` when there is no eligible work
- returns `approval_required=true` and `approval_id` when there is eligible work
- never deletes runtime data

### archive-execute
- rejects missing approval id
- rejects invalid archive approval secret
- rejects expired approval
- rejects stale approval when eligibility changed
- returns `ok=true` only when both archive execution and post-check succeed

## Acceptance rule

A production archive run is acceptable only when:
- archive execution succeeded
- post-check succeeded
- no lingering runtime rows remain
- summary coverage is complete for archived periods
