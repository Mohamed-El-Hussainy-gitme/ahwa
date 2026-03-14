# Ahwa Workspace

Ops-first cafe SaaS workspace.

## Current architecture

- `database/` is the source of truth for `ops.*` and `platform.*`
- `apps/web/` is the active application shell and now owns:
  - platform admin flow
  - runtime login/device activation
  - ops workspaces and commands
  - owner shift/staff management
  - realtime updates via SSE
- `packages/shared/` keeps the remaining shared contracts and validation used by the current workspace

## Removed through phase 9

The active tree no longer depends on:

- `tables`
- `table_sessions`
- `bill_accounts`
- `deferred-accounts`
- `canonical-runtime`
- `runtime/proxy`
- root-level duplicate Next files
- the old `apps/api` runtime backend slice
- web-to-api bridge helpers under `apps/web/src/lib/api/*`

## Local environment

- Do not create or depend on a root runtime `.env`
- Copy `apps/web/.env.example` to `apps/web/.env.local` for local development only
- Keep real secrets out of git and Vercel-manage them per environment
- Prefer modern Supabase keys: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` + `SUPABASE_SECRET_KEY`

## Verification helpers

- `node scripts/check-no-legacy-usage.mjs apps/web/src packages/shared/src`
- `node scripts/verify-phase5-6-cleanup.mjs`
- `node scripts/verify-phase7-8-realtime.mjs`
- `node scripts/verify-phase9-local-runtime.mjs`


## Validation

- `npm run verify:phase9` checks post-phase-9 runtime localization.
- `npm run verify:phase10` checks that the regression/smoke assets for the unified runtime remain in place.
- `npm run smoke:phase10` runs the full HTTP + cookie end-to-end smoke flow against a running local web app.


## Deployment hardening

- GitHub CI: `.github/workflows/ci.yml`
- Release readiness check: `npm run verify:release`
- GitHub/Vercel checklist: `docs/deployment/github-vercel-checklist.md`
- First production runbook: `docs/deployment/first-production-release-runbook.md`
- Secret handling and key rotation notes: `docs/security/secrets-and-key-rotation.md`
