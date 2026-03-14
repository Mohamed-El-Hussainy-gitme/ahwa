# Domain glossary

## Tenant and platform

- **cafe**: the tenant boundary for all operational isolation
- **super admin**: the platform-level administrator for cafes, owners, subscriptions, activation, and high-level monitoring
- **owner / partner / المعلم**: one permissions class inside one cafe; labels may differ but the authority is the same
- **employee**: runtime staff member created by the owner and authenticated by name/code plus PIN

## Shift and staffing

- **shift**: the active operating window for one cafe, currently `morning` or `evening`
- **business date**: the operating date attached to the shift record
- **shift role assignment**: the mapping of a runtime actor to a role for one open shift
- **supervisor**: the single oversight role for billing, deferred ledger access, complaint supervision, and runtime coordination in one shift
- **waiter**: staff who open/resume sessions, place orders, and deliver ready items
- **barista**: the station role for drink preparation
- **shisha**: the station/service role for shisha work; multiple shisha actors are allowed in the same shift

## Runtime entities

- **service session**: the label-based runtime container opened by the first order or resumed by label; this replaces the old table/table-session model
- **session label**: the visible marker used to identify an active service session
- **order**: the command envelope for one submission batch inside a service session
- **order item**: the quantity-tracked operational unit linked to one menu product and one station lane
- **station**: execution lane for an order item, currently `barista`, `shisha`, or `service`
- **fulfillment event**: the immutable event log for submitted/ready/delivered and related item transitions

## Menu and billing

- **menu section**: owner-managed grouping for products
- **menu product**: owner-managed sellable item with station and pricing metadata
- **billing**: quantity-based settlement of delivered order items
- **split billing**: allocating delivered quantities across one or more payment actions without naming individual people
- **deferred ledger**: customer-name based debt and repayment ledger; this is not a separate runtime container
- **debtor name**: the only person-level name required for deferred billing

## Complaints and corrective actions

- **general complaint**: a complaint record in `ops.complaints` that is not itself the action record for one item
- **item issue**: an `ops.order_item_issues` record linked to a specific `order_item`
- **remake**: a corrective action that requests item rework by quantity and keeps the original history intact
- **waive**: delivered quantity written off without charging the customer
- **cancel undelivered**: undelivered quantity removed before final delivery/billing

## Reporting

- **shift snapshot**: canonical persisted end-of-shift summary used for closed-shift and historical reporting
- **live report**: metrics built from current open-shift runtime state
- **time report**: day/week/month/year aggregate built from closed shift snapshots plus the current open shift when explicitly needed

## Explicitly retired terms

These terms are no longer part of the canonical runtime vocabulary:

- table
- table session
- bill account
- deferred account as a separate master entity in daily runtime
