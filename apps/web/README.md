# Web Package

Next.js application for Ahwa.

## Canonical responsibility

`apps/web` now owns:

- platform admin flow
- runtime login and device activation
- owner shift/staff administration
- ops workspaces and direct ops commands
- menu / deferred-customer / reports pages
- runtime actor enrichment and ops actor resolution
- realtime SSE fan-out

The old `canonical-runtime` client, `runtime/proxy` bridge, and the separate legacy runtime API package were removed from the active path.

## Run locally

1. Copy `apps/web/.env.example` to `apps/web/.env.local`
2. Set `CONTROL_PLANE_SUPABASE_*`, `AHWA_DEFAULT_OPERATIONAL_DATABASE_KEY`, `AHWA_OPERATIONAL_DATABASE__OPS_DB_01__*`, `AHWA_SESSION_SECRET`, and optional bootstrap/device pairing tokens.
3. Optional browser fallback keys (`NEXT_PUBLIC_DEFAULT_OPERATIONAL_SUPABASE_*`) are local-development only and are not the canonical production contract.
4. Legacy fallback names (`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) still work internally if you have not migrated yet.
5. Run:

```bash
npm run dev:web
```


## Validation

- `npm run verify:phase9` checks post-phase-9 runtime localization.
- `npm run verify:phase10` checks that the regression/smoke assets for the unified runtime remain in place.
- `npm run smoke:phase10` runs the full HTTP + cookie end-to-end smoke flow against a running local web app.
