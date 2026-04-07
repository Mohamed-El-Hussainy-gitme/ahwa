# Ahwa Workspace

Ops-first cafe SaaS workspace.

## Canonical source of truth

The current project must be read from these layers in this order:

1. `database/migrations/`
2. `apps/web/src/`
3. `docs/architecture/source-of-truth.md`
4. `docs/domain/canonical-runtime-reference.md`
5. `docs/domain/glossary.md`, `docs/domain/invariants.md`, `docs/domain/state-machines.md`
6. `database/README.md`

Historical phase notes under `docs/codebase/` and older execution notes are archival context only. They are **not** the canonical runtime reference.

## Current architecture

- `database/` is the source of truth for `ops.*` and `platform.*`
- `apps/web/` owns:
  - platform admin flow
  - runtime login and device activation
  - ops workspaces and commands
  - owner shift and staff management
  - realtime updates via SSE
- `packages/shared/` keeps the remaining shared contracts and validation used by the active workspace

## Canonical runtime model

The live runtime model is:

`cafe -> shift -> service_session -> order -> order_item -> fulfillment/payment/deferred -> shift_snapshot`

The canonical runtime does **not** use these as active daily entities:

- `table`
- `table_session`
- `bill_account`
- `deferred_account` as a separate runtime container

## Current platform/admin model

The super admin surface is administrative only. The canonical platform surface is:

- overview
- cafes
- owners
- money follow
- subscriptions

The platform surface should not expose detailed per-cafe operating sales, complaint payloads, or other sensitive runtime internals.

## Local environment

- Do not create or depend on a root runtime `.env`
- Copy `apps/web/.env.example` to `apps/web/.env.local` for local development only
- Keep real secrets out of git and let Vercel manage them per environment
- Prefer the explicit multi-DB contract: `CONTROL_PLANE_SUPABASE_*` plus one or more `AHWA_OPERATIONAL_DATABASE__<TOKEN>__*` groups.

## Verification helpers

- `node scripts/check-no-legacy-usage.mjs apps/web/src packages/shared/src`
- `node scripts/verify-phase5-6-cleanup.mjs`
- `node scripts/verify-phase7-8-realtime.mjs`
- `node scripts/verify-phase9-local-runtime.mjs`
- `npm run verify:phase9`
- `npm run verify:phase10`
- `npm run smoke:phase10`

## Deployment hardening

- GitHub CI: `.github/workflows/ci.yml`
- Release readiness check: `npm run verify:release`
- Operations governance check: `npm run verify:operations`
- Load/capacity tooling verification: `npm run verify:phase30`
- Release gate: `docs/deployment/production-release-gate.md`
- Environment matrix: `docs/deployment/environment-matrix.md`
- Platform operations runbook: `docs/execution/platform-operations-runbook.md`
- GitHub/Vercel checklist: `docs/deployment/github-vercel-checklist.md`
- First production runbook: `docs/deployment/first-production-release-runbook.md`
- Secret handling and key rotation notes: `docs/security/secrets-and-key-rotation.md`


## Operational event backbone

- `AHWA_OPS_EVENT_BUS_DRIVER=redis` (or `auto` with a valid redis url) enables Redis-backed realtime fanout.
- `AHWA_OPS_OUTBOX_DISPATCH_POLICY` controls outbox dispatch mode: `background`, `inline`, or `hybrid`.
- Vercel cron dispatches `/api/internal/ops/outbox/dispatch` every 2 minutes for background convergence.
- `/api/internal/health/ops` is the internal health endpoint for event bus and outbox readiness (authorized with `CRON_SECRET`).

- QStash can be enabled for background dispatch and maintenance fan-out without changing the critical request path.
