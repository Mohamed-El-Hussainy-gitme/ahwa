# Phase 3 / 4 / 5 baseline

Canonical execution baseline for this batch:

- Database runtime reference: `database/migrations`
- Application runtime reference: `apps/web/src`
- This batch adds only forward migrations.
- No historical migration behavior was edited in place.
- Reconciliation strategy:
  - `0019_split_general_complaints_from_item_issues.sql`
  - `0020_canonical_shift_snapshots_and_time_reports.sql`

## Scope completed in this batch

### Phase 3
- Split general complaints from item-linked remake / cancel / waive / note records.
- Keep general complaints in `ops.complaints`.
- Store item-linked reasons and action history in `ops.order_item_issues`.
- Backfill legacy item-linked complaints into the new canonical table.

### Phase 4
- Upgrade `ops_build_shift_snapshot` to produce canonical shift snapshots with:
  - totals
  - sessions
  - products
  - staff
  - general complaints
  - item issue records
- Read historical reports from `ops.shift_snapshots` whenever available.
- Keep open shift reporting live.

### Phase 5
- Simplify owner login flow by carrying the cafe slug directly into owner login.
- Reuse saved slug when available.
