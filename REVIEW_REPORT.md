# AHWA v4 review report

## Executed fixes

### 1) Open sessions data regression fixed
Root cause in current code:
- `buildWaiterWorkspace()` returned `sessions` as raw `service_sessions` rows.
- Raw rows contain `session_label` and `opened_at`.
- UI expects `label`, `openedAt`, `billableCount`, `readyCount` as `OpsSessionSummary`.

Effect:
- open session cards lose their visible labels
- counts may be undefined
- session differentiation becomes poor during operations

Fixed in:
- `apps/web/src/app/api/ops/_server.ts`

Change:
- normalize raw session rows into `OpsSessionSummary`
- add fallback label `جلسة <id-slice>` when `session_label` is empty
- restore `billableCount` and `readyCount` aggregation per session

### 2) Open sessions UI made operationally distinguishable
Updated in:
- `apps/web/src/app/(app)/orders/page.tsx`

Change:
- display label with fallback
- display short session code
- display total item quantity
- display ready / billable / product counts
- display opened time and last activity time

### 3) Outbox cron wiring fixed
Root cause:
- `AHWA_OPS_OUTBOX_INLINE_DISPATCH_ENABLED=false` disables in-request dispatch.
- `apps/web/vercel.json` had no cron entry for outbox dispatch.
- background convergence therefore depended on manual/script execution only.

Fixed in:
- `apps/web/vercel.json`

Change:
- added `* * * * *` cron for `/api/internal/qstash/ops/outbox-dispatch`
- switched reporting cron targets from direct maintenance route to QStash wrapper routes already present in codebase

## QStash / server / outbox / ops review

### QStash
Used files:
- `apps/web/src/lib/platform/qstash.ts`
- `apps/web/src/app/api/internal/qstash/ops/outbox-dispatch/route.ts`
- `apps/web/src/app/api/internal/qstash/maintenance/reporting/route.ts`

Actual behavior:
- `QSTASH_TOKEN` is used to publish background internal requests.
- `CRON_SECRET` is forwarded as authorization to the internal target route.
- if QStash is not configured, both wrapper routes fall back to direct execution.

Important gap found:
- `QSTASH_CURRENT_SIGNING_KEY` and `QSTASH_NEXT_SIGNING_KEY` are read into config and exposed in health checks, but no receiver-side verification using these keys was found in runtime request handling.
- this means they are currently configured metadata, not an enforced verification path.

### Server observability
Used file:
- `apps/web/src/lib/observability/server.ts`

Actual behavior:
- `AHWA_SERVER_OBSERVABILITY_ENABLED=false` disables structured server timing logs.
- this reduces visibility into outbox dispatch, qstash enqueue, and route timing.

### Outbox
Used files:
- `apps/web/src/lib/ops/outbox/dispatcher.ts`
- `apps/web/src/app/api/internal/ops/outbox/dispatch/route.ts`
- `apps/web/src/app/api/ops/_helpers.ts`

Actual behavior:
- hot mutation routes call `kickOpsOutboxDispatch()`
- `scheduleOpsOutboxDispatch()` returns immediately when `AHWA_OPS_OUTBOX_INLINE_DISPATCH_ENABLED=false`
- therefore inline/background-in-request dispatch is disabled in your production env sample
- safe delivery then depends on cron/manual dispatch route or CLI dispatch script

### Ops event bus
Used files:
- `apps/web/src/lib/ops/event-bus/index.ts`
- `apps/web/src/lib/ops/event-bus/redis.ts`

Actual behavior:
- `AHWA_OPS_EVENT_BUS_DRIVER=redis` forces Redis driver
- if driver is `auto`, Redis is chosen only when `AHWA_OPS_EVENT_BUS_REDIS_URL` exists
- Redis stream uses `AHWA_OPS_EVENT_BUS_REDIS_MAXLEN`

## Provided envs audit

### Direct runtime envs actively used by the deployed web app
- `AHWA_OPS_EVENT_BUS_REDIS_URL`
- `AHWA_SERVER_OBSERVABILITY_ENABLED`
- `AHWA_OPS_OUTBOX_MAX_ATTEMPTS`
- `AHWA_OPS_OUTBOX_RETRY_AFTER_SECONDS`
- `AHWA_OPS_OUTBOX_DISPATCH_BATCH_LIMIT`
- `AHWA_OPS_EVENT_BUS_REDIS_MAXLEN`
- `AHWA_OPS_EVENT_BUS_DRIVER`
- `QSTASH_TOKEN`
- `AHWA_OPS_OUTBOX_INLINE_DISPATCH_ENABLED`
- `CONTROL_PLANE_SUPABASE_SECRET_KEY`
- `CONTROL_PLANE_SUPABASE_PUBLISHABLE_KEY`
- `CONTROL_PLANE_SUPABASE_URL`
- `CRON_SECRET`
- `ARCHIVE_APPROVAL_SECRET`
- `AHWA_INSTALL_TOKEN`
- `AHWA_DEVICE_PAIRING_CODE`
- `AHWA_SESSION_SECRET`

### Runtime envs present but not fully exploited in current runtime logic
- `QSTASH_CURRENT_SIGNING_KEY`
- `QSTASH_NEXT_SIGNING_KEY`

Reason:
- they are read and reported, but no request signature verification path was found.

### Dynamically consumed env groups
These exact variables are not referenced one-by-one in code, but are consumed through the multi-database prefix parser in `apps/web/src/lib/supabase/env.ts`:
- `AHWA_OPERATIONAL_DATABASE__OPS_DB_03__SECRET_KEY`
- `AHWA_OPERATIONAL_DATABASE__OPS_DB_03__PUBLISHABLE_KEY`
- `AHWA_OPERATIONAL_DATABASE__OPS_DB_03__URL`
- `AHWA_OPERATIONAL_DATABASE__OPS_DB_02__URL`
- `AHWA_OPERATIONAL_DATABASE__OPS_DB_02__SECRET_KEY`
- `AHWA_OPERATIONAL_DATABASE__OPS_DB_02__PUBLISHABLE_KEY`
- `AHWA_OPERATIONAL_DATABASE__OPS_DB_01__SECRET_KEY`
- `AHWA_OPERATIONAL_DATABASE__OPS_DB_01__URL`
- `AHWA_OPERATIONAL_DATABASE__OPS_DB_01__PUBLISHABLE_KEY`

### Script-only envs (not used by deployed request/runtime path)
Used only in `scripts/load/*` and related CLI tools:
- `AHWA_LOAD_BASE_URL`
- `AHWA_LOAD_PROFILE_PATH`
- `AHWA_LOAD_FIXTURE_PATH`
- `AHWA_LOAD_OUTPUT_PATH`
- `AHWA_SOAK_SNAPSHOT_OUTPUT_PATH`
- `AHWA_FAILURE_OUTPUT_PATH`
- `AHWA_CAPACITY_OUTPUT_PATH`
- `AHWA_CAPACITY_HEADROOM_FACTOR`
- `AHWA_LOAD_SLUG_PREFIX`
- `AHWA_LOAD_CAFE_PREFIX`
- `AHWA_LOAD_OWNER_PREFIX`

## Concrete notes
1. `AHWA_OPS_EVENT_BUS_DRIVER=redis` duplicated in the sample env is not harmful if values are identical, but should be cleaned.
2. With `AHWA_OPS_OUTBOX_INLINE_DISPATCH_ENABLED=false`, the outbox cron is not optional; it is required.
3. `AHWA_SERVER_OBSERVABILITY_ENABLED=false` reduces diagnostic quality during instability.
4. QStash signing keys are not wasted entirely, but they are not giving full value until request signature verification is implemented.
