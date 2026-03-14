# Step 2 — Batch 4: authorization pass + cleanup

## Scope
Close step 2 on the active web path by tightening route/page authorization, isolating legacy runtime code from the active source tree, and documenting the remaining compatibility bridges.

## Changes made

### 1) Centralized runtime permission policy
- `apps/web/src/lib/authz/policy.ts`
- `apps/web/src/lib/authz.tsx`
- `apps/web/src/lib/session.ts`

What changed:
- role and permission resolution moved into a dedicated policy module
- `useAuthz()` now derives `effectiveRole` and capability flags from one policy source
- the session store now depends on the canonical authz role types instead of the old domain model types

### 2) Shared access state UI for runtime pages
- `apps/web/src/ui/AccessState.tsx`

Added reusable runtime access UI for:
- access denied
- missing open shift

This removed ad hoc permission text from multiple pages and made the runtime flow more consistent.

### 3) Missing page guards fixed
The following pages now have explicit owner/runtime guards:
- `apps/web/src/app/(app)/staff/page.tsx`
- `apps/web/src/app/(app)/shift/page.tsx`
- `apps/web/src/app/(app)/owner/page.tsx`
- `apps/web/src/app/(app)/reports/page.tsx`
- `apps/web/src/app/(app)/orders/page.tsx`
- `apps/web/src/app/(app)/billing/page.tsx`
- `apps/web/src/app/(app)/kitchen/page.tsx`
- `apps/web/src/app/(app)/shisha/page.tsx`

Also tightened loading effects so unauthorized pages stop issuing runtime fetches from the client.

### 4) Middleware now separates runtime and platform protection
- `apps/web/src/middleware.ts`

Rules:
- `/platform*` and `/api/platform/*` require platform session
- runtime pages and runtime/owner/authz APIs require runtime session
- unauthenticated access is redirected to the correct login surface

### 5) Legacy runtime isolated under `legacy/old-runtime`
Moved inactive in-browser runtime implementation out of the active path:
- `apps/web/src/legacy/old-runtime/data/*`
- `apps/web/src/legacy/old-runtime/usecases/*`

Compatibility bridges kept intentionally:
- `apps/web/src/legacy/runtime-store.ts`
- `apps/web/src/legacy/runtime-memory-store.ts`
- `apps/web/src/legacy/runtime-usecases.ts`

These are no longer part of the active execution path.

### 6) Legacy guard strengthened
- `scripts/check-no-legacy-usage.mjs`

The guard now fails if active code imports:
- `@/legacy/runtime-store`
- `@/legacy/runtime-usecases`
- `@/legacy/old-runtime/*`
- `@/data/memory/*`
- `@/usecases/*`

## Verification
- `node scripts/check-no-legacy-usage.mjs ./apps/web/src`
- Result: `No forbidden legacy usage found.`

## Result after batch 4
Step 2 is closed on the active web runtime path:
- active runtime pages use canonical API
- support pages use canonical API
- page access is explicit and centralized
- runtime/platform boundaries are explicit
- legacy runtime code is isolated from the active source tree

## Next recommended step
**Step 3: shift lifecycle hardening**
- close-shift invariants
- immutable close snapshot
- end-of-shift reporting freeze
- reopen / correction policy if needed
