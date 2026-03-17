# Control plane manual database selection

## Goal

Keep the current single-database deployment working while introducing a canonical control-plane registry for future operational databases.

## Canonical rules

- New cafes are created manually against a selected `database_key`.
- Available options come from `control.operational_databases`.
- The selected database is persisted in `control.cafe_database_bindings`.
- Canonical production envs are now split by scope:
  - `CONTROL_PLANE_SUPABASE_*`
  - `AHWA_DEFAULT_OPERATIONAL_DATABASE_KEY`
  - `AHWA_OPERATIONAL_DATABASE__<TOKEN>__*`
- Browser `NEXT_PUBLIC_*` keys are optional local-development fallbacks only, not the canonical multi-db contract.
- Future operational databases must use the normalized env shape:
  - `AHWA_OPERATIONAL_DATABASE__<TOKEN>__URL`
  - `AHWA_OPERATIONAL_DATABASE__<TOKEN>__PUBLISHABLE_KEY`
  - `AHWA_OPERATIONAL_DATABASE__<TOKEN>__SECRET_KEY`
- Legacy `anon/service_role` keys remain compatibility-only and must not be used for new database definitions.

## Current rollout model

- The current production Supabase project can temporarily act as:
  - base web runtime
  - control plane
  - `ops-db-01`
- Future operational databases should apply operational migrations only (`0001` through `0033`).
- The control-plane migration (`0034`) belongs to the control-plane database.
- The current active rollout may still point both control plane and `ops-db-01` to the same Supabase project, but the env contract must stay split.

## Manual cafe creation flow

1. Super admin opens `إنشاء قهوة جديدة`.
2. The page loads available databases from `control.operational_databases`.
3. The super admin selects the target database manually.
4. `platform_create_cafe_with_owner(...)` creates the cafe and owner.
5. The cafe is bound to the selected `database_key` in `control.cafe_database_bindings`.
