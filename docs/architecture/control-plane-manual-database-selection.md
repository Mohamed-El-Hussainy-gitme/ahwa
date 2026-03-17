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

## Current rollout model

- The control plane owns cafe lookup and binding resolution for every rollout stage.
- Future operational databases should receive migrations through `0033` only.
- Control-plane-only migrations start at `0034`, and strict binding cleanup continues in `0035`.


## Phase 9 request binding rule

- `databaseKey` must propagate explicitly through ops helpers, workspace builders, RPC wrappers, and route handlers.
- `adminOps()` and `ensureRuntimeContract()` must receive `databaseKey` explicitly; ambient request-scoped fallback is no longer part of the canonical contract.
- Request-context bugs in Next.js route execution must be fixed in application code, not masked by reintroducing a default database.
