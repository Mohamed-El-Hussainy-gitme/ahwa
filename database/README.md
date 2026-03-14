# Database migrations

Apply migrations in this order:

1. `0001_replace_old_with_runtime_v3.sql`
2. `0002_phase2_bootstrap_and_ops.sql`
3. `0003_phase2_station_delivery_ops.sql`
4. `0004_complete_remaining_database.sql`
5. `0005_platform_auth_and_owner_listing.sql`
6. `0006_ops_hardening_and_rls.sql`

These migrations define the clean `ops` + `platform` database path used by the current application.

`0006_ops_hardening_and_rls.sql` adds role-assignment hardening, open-session label uniqueness, repayment overpayment guards, corrected shift snapshots, close-shift ordering, and baseline RLS policies.

- `0007_runtime_actor_identity_bindings.sql`: binds legacy runtime users to ops owner/staff actors through stable `legacy_app_user_id` columns for web runtime identity resolution.
