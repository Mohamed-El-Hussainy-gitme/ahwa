# Phase 24 - reporting maintenance release gate

This phase closes the maintenance loop introduced by phases 1 through 6.
The target is not adding new runtime behavior. The target is proving that:

- runtime contract and reporting contract are both present,
- backfill/reconcile/archive are wired end-to-end,
- archive is verified in dry-run before any destructive execution,
- release readiness blocks merges when any of the above artifacts disappear.

## Scope

Artifacts added in this phase:

- `scripts/verify-reporting-maintenance-release.mjs`
- `scripts/smoke-reporting-maintenance.mjs`
- `docs/execution/reporting-maintenance-verification-matrix.md`
- `docs/execution/reporting-maintenance-smoke-runbook.md`

## Gate philosophy

The gate is intentionally split into two levels:

1. Static verification
   - required files exist
   - required migration functions exist
   - maintenance route still exposes `backfill`, `reconcile`, `archive`
   - cron wiring still points to the maintenance route
   - docs and runbooks stay in sync with the codebase

2. Runtime smoke
   - `backfill` succeeds against a real deployed environment
   - `reconcile` succeeds against the same window
   - `archive` is exercised as `dryRun=true` before any real archive run

The smoke step is designed for pre-production and post-deploy validation, not for CI.
