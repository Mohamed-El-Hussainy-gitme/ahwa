# Phase 20 - shared/docs/scripts cleanup

## Goal

Remove legacy shared contracts, dead runtime bridges, and outdated docs/scripts that still described the table/bill-account model.

## Removed

- `apps/web/src/lib/canonical-runtime/*`
- `apps/web/src/app/api/runtime/proxy/route.ts`
- `packages/shared/src/contracts/tables.ts`
- `packages/shared/src/contracts/sessions.ts`
- legacy billing/deferred/reporting shared contracts that were not consumed anymore
- generated JS / d.ts artifacts inside `packages/shared/src`
- `apps/api/dist` and `packages/shared/dist`
- outdated docs for phases 7/8/9 and old execution batches
- legacy verification scripts tied to bill accounts

## Added

- `scripts/verify-phase5-6-cleanup.mjs`
- stronger legacy checks in `scripts/check-no-legacy-usage.mjs`
