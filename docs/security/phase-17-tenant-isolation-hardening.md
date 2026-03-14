# Phase 17 — Tenant Isolation Hardening

This phase adds the database-side security primitives required for true multi-tenant isolation.

## What this patch adds

- `platform.support_access_grants`
- Session helper functions based on `current_setting(...)`
- Runtime roles:
  - `app_runtime`
  - `app_platform_runtime`
- `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` on `platform.*`, `app.*`, `report.*`, and `audit.*`
- Default deny posture with explicit tenant-scoped policies

## Important rollout note

The current API still uses the owner connection string and does **not** yet push database session settings (`app.current_tenant_id`, `app.current_user_id`, etc.) on every request.

That means:

1. This patch is now part of the repository and is the canonical Phase 17 migration.
2. Applying it to production should be paired with a runtime connection/DB-context rollout.
3. The intended steady-state is:
   - runtime API uses `app_runtime`
   - platform API uses `app_platform_runtime`
   - each request sets local session variables before queries

## Session variables expected by the policies

Runtime app:
- `app.current_tenant_id`
- `app.current_branch_id`
- `app.current_user_id`
- `app.current_account_kind`
- `app.current_shift_role`

Platform:
- `platform.current_super_admin_user_id`

## Support access

Super-admin cross-tenant support access is no longer implicit. It must be granted through `platform.support_access_grants`, which is then honored by `app.has_platform_support_access(...)`.

## SQL Editor

For an existing database, run:

- `database/sql-editor/005_apply_phase_17_rls_patch.sql`

For a fresh database bootstrap, append this migration after the Phase 16/previous schema rollout.
