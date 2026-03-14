# Phase 18 — RLS Runtime Wiring

## Goal
Wire authenticated API requests into PostgreSQL session context so that phase 17 RLS policies become enforceable in runtime, not just present in schema.

## What changed
- Added async request-scoped DB actor context.
- Added runtime and platform actor context builders.
- Wrapped protected routes in `apps/api/src/app.ts` so authenticated requests run inside DB context.
- Wrapped pool queries so direct `pool.query(...)` calls participate in request context.
- Added SECURITY DEFINER resolver functions for:
  - cafe gate resolve
  - owner login
  - employee PIN login
  - runtime session lookup
  - super admin login/session lookup
  - logout session revocation
- Added SQL patch `006_apply_phase_18_runtime_rls_patch.sql`.

## Rollout order
1. Deploy code with phase 18 wiring.
2. Apply `database/sql-editor/005_apply_phase_17_rls_patch.sql` if not already applied.
3. Apply `database/sql-editor/006_apply_phase_18_runtime_rls_patch.sql`.
4. Smoke test auth, device gate, shifts, sessions, orders, payments, reports.

## Remaining work
- Expand DB session context usage deeper into every transaction path where stricter branch/role-aware RLS will be introduced later.
- Add end-to-end tests covering support grants and tenant isolation boundaries.
