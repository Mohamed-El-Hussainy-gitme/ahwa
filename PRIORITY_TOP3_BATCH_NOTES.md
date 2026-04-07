Applied on top of ahwa_remaining_batch_fix.

Changes:
1) Orders session UX
- Reworked orders session list into full-width operational cards.
- Added visible current-session summary.
- Sessions are sorted by latest activity, with the selected session pinned first.
- Session cards now show: label, opened time, last activity time, product count, total quantity, ready count, and billable count.

2) New session flow
- Replaced inline typing with a focused modal sheet for naming a new session.
- Background session buttons are blocked while naming.
- Added an in-flight blocking overlay while sending an order to reduce accidental taps during submission.

3) Order request critical path
- Added short-lived server-side cache for menu product -> station lookup.
- Removed synchronous station-event staging/publishing from the blocking request path.
- Order routes now return immediately after the main RPC succeeds, and station-specific realtime fanout is dispatched in the background.
- Applied the same shortened path to public QR ordering.

Files changed:
- apps/web/src/app/(app)/orders/page.tsx
- apps/web/src/lib/ops/workspacePatches.ts
- apps/web/src/app/api/ops/orders/_station-events.ts (new)
- apps/web/src/app/api/ops/orders/create-with-items/route.ts
- apps/web/src/app/api/ops/orders/open-and-create/route.ts
- apps/web/src/app/api/public/cafes/[slug]/order/route.ts

Important:
- This batch is optimized for operational speed and safer mobile interaction.
- Background station fanout is now best-effort by design; canonical order correctness still comes from the transactional RPC + outbox flow.
