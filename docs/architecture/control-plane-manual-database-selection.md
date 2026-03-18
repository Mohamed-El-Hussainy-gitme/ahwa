# Control plane manual database selection

## Canonical env contract

- `CONTROL_PLANE_SUPABASE_*` drives platform and control-plane traffic.
- One or more `AHWA_OPERATIONAL_DATABASE__<TOKEN>__*` groups define the operational databases that are actually reachable from the runtime.
- Legacy `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SECRET_KEY`, and `AHWA_DEFAULT_OPERATIONAL_DATABASE_KEY` names are removed from the supported production contract.

## Manual database selection for cafe creation

- The platform create-cafe flow reads the available operational databases from `control.operational_databases`.
- The super admin must choose `database_key` explicitly when creating a cafe.
- The selected binding is stored in `control.cafe_database_bindings`.
- Unbound cafes remain unbound until a super admin assigns a database explicitly. Login and runtime flows must fail closed for unbound cafes.

## Operational database registry

- `control.operational_databases` is now an explicit registry, not a seeded default.
- New deployments must register at least one active operational database row before platform create-cafe is usable.
- Legacy `default` and `backfill` binding rows are cleaned up by the strict phase-8 migration.

## PostgREST boundary for control-plane data

- `control.*` must stay unexposed from the HTTP schema list.
- Web routes must not call `.schema('control')` directly.
- Read access to control-plane bindings must go through public `SECURITY DEFINER` RPCs such as `control_get_cafe_database_binding()` and `control_list_cafe_database_bindings()`.
- This keeps the control plane private while preserving platform/admin read paths and multi-database runtime resolution.

## Current rollout model

- The control plane owns cafe lookup and binding resolution for every rollout stage.
- `0034` through `0039` are control-plane-only migrations. Apply them on the current control-plane database (`db0001`).
- Fresh operational databases must use the generated baseline under `database/baselines/operational/0001_fresh_operational_baseline.sql` instead of replaying control-plane-only migrations.
- Register every new operational database in the control plane with `public.control_register_operational_database(...)` before assigning cafes to it.


## Phase 9 request binding rule

- `databaseKey` must propagate explicitly through ops helpers, workspace builders, RPC wrappers, and route handlers.
- `adminOps()` and `ensureRuntimeContract()` must receive `databaseKey` explicitly; ambient request-scoped fallback is no longer part of the canonical contract.
- Request-context bugs in Next.js route execution must be fixed in application code, not masked by reintroducing a default database.
