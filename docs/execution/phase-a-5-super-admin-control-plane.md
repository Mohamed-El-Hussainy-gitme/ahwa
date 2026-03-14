# Phase A-5 — Super Admin SaaS Control Plane

## Baseline confirmation
This phase was applied on top of `ahwa_phase4_deferred_lightweight.zip`, and that bundle already contains the lock files from `ahwa_phase8_final_lock_fixed_0019.zip`, including:

- `database/migrations/0022_remove_support_grants_and_lock_final_access.sql`
- `scripts/check-final-1to1-lock.mjs`
- `docs/execution/project-status-1-to-1.md`

## What changed

### 1. Create cafe flow now includes the first subscription
The create-cafe flow accepts:
- start date
- end date
- grace days
- status
- paid amount
- complimentary/free flag
- subscription notes

### 2. Cafe subscriptions now store payment metadata
Added columns on `platform.cafe_subscriptions`:
- `amount_paid numeric(12,2)`
- `is_complimentary boolean`

### 3. Cafes view became a management table
The super admin cafes page now shows:
- cafe name and slug
- activation state
- current subscription state
- expiry date and countdown
- collected amount or free marker
- link to cafe detail page

### 4. Owners remain managed from the cafe page
Top-level owner management was removed from the main dashboard tabs. Owner management stays inside the cafe detail page.

### 5. Money Follow became a dedicated view
A dedicated money-follow API and view now expose:
- total collected subscription value
- overdue cafes
- due soon cafes
- complimentary subscription count
- recent subscription entries

## Files changed
- `database/migrations/0023_platform_subscription_money_follow_and_create_flow.sql`
- `apps/web/src/app/api/platform/cafes/create/route.ts`
- `apps/web/src/app/api/platform/subscriptions/create/route.ts`
- `apps/web/src/app/api/platform/money-follow/route.ts`
- `apps/web/src/app/platform/PlatformDashboardClient.tsx`
- `apps/web/src/app/platform/cafes/[cafeId]/PlatformCafeDetailClient.tsx`

## Notes
- This phase does not re-open runtime privacy exposure.
- Owner and subscription actions still flow through the per-cafe detail page.
- Money follow is accounting for your SaaS subscriptions only, not cafe operating sales.
