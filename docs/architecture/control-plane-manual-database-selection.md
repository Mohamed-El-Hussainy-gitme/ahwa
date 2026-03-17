# Control plane manual database selection

## Canonical env contract

- `CONTROL_PLANE_SUPABASE_*` drives platform and control-plane traffic.
- `AHWA_DEFAULT_OPERATIONAL_DATABASE_KEY` identifies the default operational database.
- `AHWA_OPERATIONAL_DATABASE__<TOKEN>__*` defines each operational database.
- Legacy `NEXT_PUBLIC_SUPABASE_*` and `SUPABASE_SECRET_KEY` names are fallback-only and are no longer the preferred production contract.

## Manual database selection for cafe creation

- The platform create-cafe flow reads the available operational databases from `control.operational_databases`.
- The super admin chooses `database_key` manually when creating a cafe.
- The selected binding is stored in `control.cafe_database_bindings`.
- If no database is chosen, the canonical default is `public.control_get_default_operational_database_key()`.

## Current rollout model

- The active database can act as both the control plane and `ops-db-01` during the first rollout.
- Future operational databases should receive migrations through `0033` only.
- Control-plane-only migrations start at `0034`.
