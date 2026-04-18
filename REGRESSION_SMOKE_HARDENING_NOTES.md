# Regression / smoke hardening pass

This pass is intentionally narrow and production-safe.

## Applied runtime fixes

- Shift checklist queued draft replay now clears the matching local draft key after a successful flush.
- Shift page now reloads itself when the admin queue finishes syncing, so queued checklist drafts become visible without manual refresh.

## Added release gates

- `npm run verify:ops-admin-resilience`
- wired into `scripts/check-release-readiness.mjs`

## Added runbook

- `docs/execution/ops-admin-resilience-smoke-runbook.md`

Scope is limited to admin-safe offline behavior only:

- inventory
- complaints / quality
- shift checklist drafts

Hot path remains excluded:

- live sessions
- order creation
- direct sell/billing
