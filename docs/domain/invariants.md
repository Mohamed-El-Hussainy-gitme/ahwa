# Domain invariants

## Tenant isolation

- every operational record is scoped by `cafe_id`
- actor execution must resolve to a concrete owner or staff actor id

## Session / shift invariants

- a service session belongs to exactly one cafe and one shift
- an open session label must be unique inside `cafe_id + shift_id`
- a shift cannot close while unresolved runtime obligations still exist

## Quantity invariants

- `qty_paid + qty_deferred <= qty_delivered`
- billing only applies to delivered quantities
- remake / partial ready / delivery all operate by quantity

## Deferred ledger invariants

- repayments cannot exceed outstanding balance
- deferred balance is derived from immutable ledger entries

## Identity invariants

- runtime actor resolution cannot depend on `full_name`
- owner and staff runtime sessions must bind to `ops` actors through `legacy_app_user_id`
