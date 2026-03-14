# Phase 17R + 18R — Tenant Isolation Rebuild

## Goal
Rebuild tenant isolation after the original phase 17/18 patches failed on real Supabase execution.

## What changed
- Added a safe RLS migration using the **real current schema**.
- Fixed the `app.tenants` policy to scope on `id`, not `tenant_id`.
- Added runtime/session helper functions based on `current_setting(...)`.
- Added `platform.support_access_grants` for audited support access.
- Added security-definer resolver functions for:
  - cafe gate resolution
  - device token resolution
  - owner login
  - employee pin login
  - super admin login
  - runtime session lookup
  - super admin session lookup
  - runtime logout
  - super admin logout
- Added API-side actor context wiring via async local storage.
- Updated `pool.query(...)` and `withTransaction(...)` so authenticated requests can run inside DB actor context.

## Fresh install
Use:
- `database/sql-editor/000_apply_schema.sql`
- `database/sql-editor/001_apply_demo_seed.sql`
- `database/sql-editor/002_smoke_test_queries.sql`

## Existing database rollout
Apply in order:
1. `database/sql-editor/005_apply_phase_17r_rls_patch.sql`
2. `database/sql-editor/006_apply_phase_18r_runtime_rls_patch.sql`

## Important note
This rebuild focuses on **DB-safe isolation rollout** and **runtime auth/session wiring**.
It does not claim that every single service flow has been fully smoke-tested under RLS yet.
The next step after applying these patches is runtime validation on the real Supabase database.
