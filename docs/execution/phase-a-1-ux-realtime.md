# Phase A1 — UX + Realtime Polish

## Scope executed
- Added a lightweight ops chrome provider for shared live counters across the mobile runtime.
- Added a nav summary workspace endpoint so every runtime role can receive fast badges without depending on supervisor-only dashboard access.
- Improved SSE client state with explicit connection status, reconnect state, and sync timestamps.
- Added header sync state and compact live chips to `MobileShell`.
- Added badge counts to the bottom navigation for ready items, kitchen queue, billable qty, and deferred alerts.
- Added sticky action bars to the highest-frequency pages:
  - orders
  - billing
  - shisha
- Added a compact queue summary on the barista page.

## Files added
- `apps/web/src/lib/ops/chrome.tsx`
- `apps/web/src/ui/StickyActionBar.tsx`
- `apps/web/src/app/api/ops/workspaces/nav-summary/route.ts`
- `docs/execution/phase-a-1-ux-realtime.md`

## Files updated
- `apps/web/src/app/(app)/ClientProviders.tsx`
- `apps/web/src/lib/ops/realtime.ts`
- `apps/web/src/lib/ops/types.ts`
- `apps/web/src/lib/ops/client.ts`
- `apps/web/src/app/api/ops/_server.ts`
- `apps/web/src/ui/MobileShell.tsx`
- `apps/web/src/ui/BottomNav.tsx`
- `apps/web/src/app/(app)/orders/page.tsx`
- `apps/web/src/app/(app)/billing/page.tsx`
- `apps/web/src/app/(app)/kitchen/page.tsx`
- `apps/web/src/app/(app)/shisha/page.tsx`

## Notes
- No database migration was required for this phase.
- This phase stays inside the existing runtime model and does not change shift, billing, or complaint domain rules.
