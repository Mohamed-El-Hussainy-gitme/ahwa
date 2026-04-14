# Stage 4 audit workflow

Use the runtime audit endpoint after deploying this build.

Endpoint:

- `GET /api/ops/billing/audit?paymentId=<payment-id>`

What it returns:

- receipt subtotal / tax / service / total
- split of base item subtotal vs addons subtotal
- billed order items with explicit addon lines
- current report snapshot
- day report snapshot for the payment business date
- boolean checks:
  - `receiptMatchesItems`
  - `addonSplitMatchesSubtotal`

Recommended manual audit set:

1. cash-only payment
2. deferred payment
3. payment with addons + tax + service

For each payment, compare:

- sales receipt
- `billedItems`
- `addons`
- `reportCurrent`
- `reportDay`
