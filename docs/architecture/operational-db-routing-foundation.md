# Operational DB Routing Foundation — Phase 2

Phase 2 introduces the **code-level routing foundation** for multi-operational-database deployment without changing the current single-operational-database runtime behavior.

## What is now present

- `TenantDatabaseResolver` equivalent lives in `apps/web/src/lib/control-plane/server.ts`
- `OperationalDbClientFactory` equivalent lives in `apps/web/src/lib/operational-db/server.ts`
- Cafe resolution by slug now returns both:
  - cafe identity
  - current `database_key`
- Owner/staff login now resolves the target operational database before executing operational RPCs.
- Device-gate resolve/activate flows now carry `databaseKey` in the returned gate payload.
- Runtime actor binding, owner admin flows, and recovery flows now have routed server helpers available through the operational DB factory.

## Current behavior

The system still runs as **single operational database** by default.
If no per-database env mapping exists, the factory falls back to the default Supabase env:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`

This means phase 2 is **non-breaking** for the active deployment.

## Optional per-database env mapping

For future databases, the app supports server-side env keys shaped like:

- `AHWA_OPERATIONAL_DATABASE__OPS_DB_01__URL`
- `AHWA_OPERATIONAL_DATABASE__OPS_DB_01__PUBLISHABLE_KEY`
- `AHWA_OPERATIONAL_DATABASE__OPS_DB_01__SECRET_KEY`

Where `OPS_DB_01` is the normalized token form of `database_key = ops-db-01`.

## Architectural contract

- Cafe-scoped operational flows must resolve a `database_key` before selecting a server admin client.
- Platform-wide reads stay on the control plane.
- No cross-db joins are introduced.
- Operational routing remains server-side.

## Not included yet

Phase 2 does **not** change the browser runtime to talk directly to multiple operational databases.
It only introduces the server-side routing foundation so later stages can migrate route handlers safely.
