# Phase B.2 — minimal disaster recovery + message catalog

## Implemented

### 1) Message catalog
- Added a central catalog at `apps/web/src/lib/messages/catalog.ts`.
- Unified common runtime/admin/API messages through:
  - `apps/web/src/app/api/_shared.ts`
  - `apps/web/src/app/api/ops/_helpers.ts`
  - `apps/web/src/lib/api/errors.ts`
  - `apps/web/src/lib/http/client.ts`
- Updated direct fetch consumers in:
  - `apps/web/src/app/(app)/shift/page.tsx`
  - `apps/web/src/app/(app)/staff/page.tsx`

### 2) Minimal disaster recovery
- Added owner/supervisor recovery state endpoint:
  - `GET /api/owner/recovery/state`
- Added owner-only recovery actions:
  - `POST /api/owner/recovery/close-session`
  - `POST /api/owner/recovery/release-stale-locks`
- Added shared recovery logic:
  - `apps/web/src/lib/ops/recovery.ts`
- Added hidden recovery UI inside shift screen:
  - `apps/web/src/ui/ops/RecoveryPanel.tsx`

## Recovery scope
This phase intentionally stays minimal and low-risk.

### Included
- Manual state resync
- Visibility into stale idempotency locks
- Visibility into open sessions that are safe to close
- Owner-only action to close a recoverable idle session
- Owner-only action to release stale pending idempotency locks

### Excluded
- Broad force-close tools
- Direct raw database manipulation
- Recovery controls on everyday runtime screens
- Any change to the core operational domain model

## Safety rules
- Recovery UI stays collapsed by default.
- Recovery session close is allowed only when the session has:
  - no pending preparation
  - no ready-undelivered quantities
  - no billable quantities
- Stale idempotency locks are limited to pending locks older than 120 seconds.

## Schema impact
- No new migration in this phase.
- Reuses existing `ops.idempotency_keys` from phase B.1.

## Notes
- This phase is intentionally operationally conservative.
- It adds support and recovery guardrails without increasing normal UI clutter.
