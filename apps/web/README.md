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
2. Set `CONTROL_PLANE_SUPABASE_URL`, `CONTROL_PLANE_SUPABASE_PUBLISHABLE_KEY`, `CONTROL_PLANE_SUPABASE_SECRET_KEY`, at least one `AHWA_OPERATIONAL_DATABASE__<TOKEN>__*` group, `AHWA_SESSION_SECRET`, and optional bootstrap/device pairing tokens
3. Run:

```bash
npm run dev:web
```


## Validation

- `npm run verify:phase9` checks post-phase-9 runtime localization.
- `npm run verify:phase10` checks that the regression/smoke assets for the unified runtime remain in place.
- `npm run smoke:phase10` runs the full HTTP + cookie end-to-end smoke flow against a running local web app.


## Phase 9 operational database propagation

Ops routes, workspace loaders, and mutation helpers must receive `databaseKey` explicitly from the bound runtime session. Do not reintroduce implicit database discovery or per-request default fallbacks inside the web app.
