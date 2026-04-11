# Workspace performance pass notes

Applied on top of the latest uploaded working version.

## What changed

### 1) Single-flight read-through cache for ops server reads
- `apps/web/src/app/api/ops/_cache.ts`
- The in-memory ops cache now deduplicates concurrent reads for the same key.
- Result: repeated simultaneous requests from dashboard / waiter / station pages no longer stampede the same database query.

### 2) Real server-side caching for menu workspace data
- `apps/web/src/app/api/ops/_server.ts`
- `loadMenuWorkspaceCatalog()` is now cached.
- `loadActiveMenuCatalog()` is now cached.
- Added scoped active-menu cache by station scope:
  - `all`
  - `barista`
  - `shisha`
  - combined scopes when needed
- Result: waiter/station/menu workspaces stop rebuilding the same filtered catalog on every request.

### 3) Short-lived caching for open shift and open sessions
- `apps/web/src/app/api/ops/_server.ts`
- `loadOpenShift()` cached for 2s
- `loadOpenSessions()` cached per shift for 2s
- Result: dashboard/nav-summary/station/waiter reads reuse the same hot operational metadata instead of requerying it several times inside the same refresh window.

### 4) Parallelized waiter workspace assembly
- `apps/web/src/app/api/ops/_server.ts`
- Waiter workspace now resolves these in parallel where safe:
  - open sessions
  - note presets
  - scoped catalog
- Result: lower end-to-end latency for waiter workspace construction.

### 5) Parallelized post-order persistence
- `apps/web/src/app/api/ops/orders/create-with-items/route.ts`
- `apps/web/src/app/api/ops/orders/open-and-create/route.ts`
- Addon persistence and note-preset persistence now run with `Promise.all()` after the order RPC succeeds.
- Result: lower write-path latency on order submission.

## Why this is safe
- Menu caches are already invalidated through existing menu mutation utilities.
- Shift/session caches are intentionally very short-lived to reduce duplicated reads without introducing long stale windows.
- The order write path still waits for required persistence; it is only parallelized, not deferred.

## Expected effect
- Faster waiter/station/dashboard workspace refreshes.
- Lower duplicated DB load during rapid UI refreshes and concurrent tab/device requests.
- Slightly faster order creation response time.
