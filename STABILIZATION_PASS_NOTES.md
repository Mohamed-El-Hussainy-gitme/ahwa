# Phase 3 Stabilization Pass

## Applied fixes
- Fixed persistent draft reset behavior so `resetDraft()` and `clearDraft()` no longer re-save the cleared draft on the next render.
- Hardened admin offline queue:
  - retryable HTTP failures (5xx / 408 / 409 / 425 / 429) stay queued
  - exponential backoff scheduling for queued retries
  - preserved queue order during retries
  - explicit `nextRetryAt` state for UI
- Improved queue UX/state sync:
  - banner now shows next retry time when relevant
  - queue state rehydrates correctly across tabs via storage sync

## Files touched
- apps/web/src/lib/pwa/use-persistent-draft.ts
- apps/web/src/lib/pwa/admin-queue.ts
- apps/web/src/lib/pwa/provider.tsx
- apps/web/src/components/OfflineOpsBanner.tsx
