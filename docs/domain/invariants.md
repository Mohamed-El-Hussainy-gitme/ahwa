# Domain invariants

## Tenant isolation

- every operational record is scoped by `cafe_id`
- runtime actor execution must resolve to a concrete owner or staff actor id
- platform administration must not bypass tenant isolation for daily runtime reads except through the explicitly defined platform surface

## Shift and staffing invariants

- a service session belongs to exactly one cafe and one shift
- an open session label must be unique inside `cafe_id + shift_id`
- a shift cannot close while unresolved runtime obligations still exist
- only one active `supervisor` assignment exists per shift
- only one active `barista` assignment exists per shift
- multiple active `waiter` assignments are allowed per shift
- multiple active `shisha` assignments are allowed per shift

## Quantity invariants

- `qty_submitted <= qty_total`
- `qty_ready <= qty_submitted + qty_remade`
- `qty_delivered <= qty_ready`
- `qty_paid + qty_deferred <= qty_delivered`
- `qty_cancelled <= qty_total`
- billing only applies to delivered quantities
- remake / partial ready / delivery all operate by quantity, not by person names

## Deferred ledger invariants

- repayments cannot exceed outstanding balance
- deferred balance is derived from immutable ledger entries
- deferred entry access is restricted to owner or supervisor paths

## Complaint invariants

- general complaints live in `ops.complaints`
- item-linked corrective reasons live in `ops.order_item_issues`
- remake / waive / cancel reasons must stay linked to the affected `order_item`
- a general complaint must not be used as the sole canonical action record for item-specific remediation

## Reporting invariants

- closing a shift must persist a canonical snapshot
- closed-shift history must read from `ops.shift_snapshots`
- open-shift reporting may read live operational state
- day/week/month/year reports must compose closed snapshots first, then optionally merge the current open shift for live views

## Identity invariants

- runtime actor resolution cannot depend on `full_name`
- owner and staff runtime sessions must bind to `ops` actors through `legacy_app_user_id`
