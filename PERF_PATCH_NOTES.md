# Performance patch notes

Applied changes in this patch:

- Suppressed workspace and nav-summary polling while ops realtime is healthy.
- Added a bounded realtime health check to avoid redundant background reloads when SSE is already connected.
- Reduced mutation latency for order creation routes by enqueueing station events in parallel and publishing realtime events without blocking the HTTP response path.
- Kept outbox dispatch enabled so eventual consistency and downstream delivery remain intact.

Touched files:
- apps/web/src/lib/ops/realtime.ts
- apps/web/src/lib/ops/hooks.ts
- apps/web/src/lib/ops/chrome.tsx
- apps/web/src/app/api/ops/orders/open-and-create/route.ts
- apps/web/src/app/api/ops/orders/create-with-items/route.ts
- apps/web/src/app/api/public/cafes/[slug]/order/route.ts
