# Phase 27 — Realtime reliability + outbox dispatch

This phase adds two runtime guarantees on top of the existing operational model:

1. Event distribution is no longer coupled to a single process memory map.
2. Hot operational mutations can stage their realtime events inside the same database transaction using an outbox table.

## What changed

### Event bus abstraction
- `apps/web/src/lib/ops/event-bus/*`
- Drivers:
  - `memory` for local/dev fallback
  - `redis` for cross-instance fanout via Redis Streams

### SSE transport
- `/api/ops/events`
- Now subscribes through the event bus abstraction.
- Supports resume cursor through `Last-Event-ID`.

### Outbox table
- `ops.outbox_events`
- Short-lived operational relay table.
- Must be reaped periodically with `public.ops_reap_outbox_events(...)`.
- This table is intentionally not a historical archive.

### Transactional wrappers for hot mutations
These wrappers call the existing business function and stage the realtime event in the same transaction:
- `ops_open_or_resume_service_session_with_outbox`
- `ops_create_order_with_items_with_outbox`
- `ops_mark_partial_ready_with_outbox`
- `ops_mark_ready_with_outbox`
- `ops_request_remake_with_outbox`
- `ops_deliver_available_quantities_with_outbox`
- `ops_settle_selected_quantities_with_outbox`
- `ops_defer_selected_quantities_with_outbox`
- `ops_record_repayment_with_outbox`
- `ops_close_service_session_with_outbox`
- `ops_add_deferred_debt_with_outbox`

### Dispatcher
- `apps/web/src/lib/ops/outbox/dispatcher.ts`
- Internal dispatch endpoint:
  - `POST /api/internal/ops/outbox/dispatch`
- CLI script:
  - `npm run dispatch:ops-outbox`

## Operational notes

### Required env
- `AHWA_OPS_EVENT_BUS_DRIVER=auto|memory|redis`
- `AHWA_OPS_EVENT_BUS_REDIS_URL=redis://...`
- `AHWA_OPS_EVENT_BUS_REDIS_PREFIX=ahwa`
- `AHWA_OPS_EVENT_BUS_REDIS_MAXLEN=20000`
- `AHWA_OPS_OUTBOX_DISPATCH_BATCH_LIMIT=100`
- `AHWA_OPS_OUTBOX_RETRY_AFTER_SECONDS=15`
- `AHWA_OPS_OUTBOX_MAX_ATTEMPTS=20`
- `AHWA_OPS_OUTBOX_INLINE_DISPATCH_ENABLED=true`
- `CRON_SECRET=...`

### Production expectation
For multi-instance production, enable the Redis driver and run a dispatcher continuously or on a tight cron cadence.

### Runtime weight
The outbox table is intentionally short-lived:
- published rows are reapable
- dead-lettered rows are reapable
- archival/reporting flow remains unchanged
