# Control plane minimal foundation

## Goal

This phase does **not** move runtime traffic to multiple databases yet.
It creates the minimum control-plane layer needed so the codebase stops assuming that every cafe will always live on one operational database forever.

## Canonical decisions

- `ops`, `report`, and `archive` remain the per-operational-database schemas.
- `control` is platform-only metadata.
- Every cafe must have exactly one current `database_key` binding.
- The current active reference still runs on one operational database, represented by the default key `ops-db-01`.
- No runtime route may depend on cross-database joins in the future.

## What was added

### 1. `control.operational_databases`
Registry of operational databases that can host cafes.

### 2. `control.cafe_database_bindings`
Current mapping from `cafe_id` to `database_key`.

### 3. `control.database_migration_runs`
Control-plane tracking table for applying migrations across operational databases later.

### 4. `control.operational_database_health`
Control-plane health snapshot table for each operational database.

## Runtime effect today

- Existing cafes are automatically backfilled to `ops-db-01`.
- New cafes are automatically bound to the current default operational database through a trigger on `ops.cafes`.
- The current runtime behavior remains single-database.
- Platform settings now expose a read-only control-plane overview so the registry can be audited before multi-db routing is enabled.

## Out of scope for this phase

- No tenant runtime routing yet.
- No multi-db connection factory yet.
- No cross-database migration runner yet.
- No cafe move / rebalance workflow yet.

## Why this is safe

This phase is additive:
- no runtime table was removed
- no reporting chain was changed
- no billing/deferred logic was changed
- no archive policy was changed

The control plane only records metadata needed for later routing.
