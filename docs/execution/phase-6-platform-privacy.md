# Phase 6 — Platform Privacy Refactor

## Canonical scope
This phase converts the super-admin surface into an **administrative-only** workspace.
It deliberately removes exposure of cafe runtime internals such as sales, fulfillment counts,
complaint feeds, audit feeds, deferred balances, and shift snapshots from the platform dashboard.

## What changed
- Added `database/migrations/0021_platform_privacy_refactor_and_admin_views.sql`
- Replaced `platform_dashboard_overview(...)` with a privacy-safe overview payload
- Replaced `platform_get_cafe_detail(...)` with an administrative detail payload
- Simplified platform UI into 5 logical sections:
  - Overview
  - Cafes
  - Owners
  - Money Follow
  - Subscriptions
- Removed support-grant placeholder from the UI surface
- Removed detailed operational views from cafe detail page

## Privacy boundary after this phase
### Super admin can see
- cafe identity and activation state
- owners / partners
- subscription state and history
- last activity timestamp
- open-shift presence only
- database-wide usage capacity
- administrative attention reasons

### Super admin cannot see from platform UI
- cafe sales totals
- order / fulfillment counts
- complaint item feeds
- audit event feeds
- deferred balances
- shift snapshot revenue summaries

## Migration policy
No old migration was edited. The privacy refactor is applied by a new reconciliation migration only.
