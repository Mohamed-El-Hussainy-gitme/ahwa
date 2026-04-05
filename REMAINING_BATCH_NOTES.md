# Remaining batch fixes

Applied on top of `ahwa_priority_three_fix`.

## What changed
- Added short-lived in-memory request caching and in-flight deduplication in `apps/web/src/lib/http/client.ts`.
- Added targeted read-cache usage for workspace read paths in `apps/web/src/lib/ops/client.ts`.
- Cleared read caches automatically after mutations to preserve correctness.
- Added focused realtime reload predicates in `apps/web/src/lib/ops/reload-rules.ts`.
- Narrowed workspace reload triggers for:
  - kitchen
  - ready
  - billing
  - orders
  - shisha
- Switched shisha page from full waiter workspace to split live/catalog workspaces.
- Moved nav summary loading to shared cached request path in `apps/web/src/lib/ops/chrome.tsx`.
- Fixed receipt page imports for `useEffect` and `useState`.
- Restored `buildStationWorkspace` export and aligned ops types/server payloads for ready/session items.

## Expected impact
- Fewer duplicate read requests.
- Less unnecessary workspace reload churn from unrelated realtime events.
- Better perceived speed on orders, shisha, billing, ready, and top navigation.
- Lower server pressure while preserving correctness after mutations.
- Simpler reload behavior by separating catalog updates from live operational updates.

## Important verification note
- The code was updated in the artifact.
- A full clean build could not be re-verified in the current container because the local unzip/install environment did not resolve the expected type packages consistently.
- The patch is therefore delivered as a best-effort code batch and should be validated on your Vercel pipeline and local workspace.
