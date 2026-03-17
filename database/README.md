# Database migrations

## Canonical rule

Do not edit old applied migrations to change live behavior.
Any behavioral or schema change must land in a **new migration**.
If old definitions conflict with the desired final state, the new migration must act as a **reconciliation migration** that drops/normalizes the conflicting objects and recreates the canonical final state.

## Canonical applied path

Apply migrations in this order:

1. `0001_replace_old_with_runtime_v3.sql`
2. `0002_phase2_bootstrap_and_ops.sql`
3. `0003_phase2_station_delivery_ops.sql`
4. `0004_complete_remaining_database.sql`
5. `0005_platform_auth_and_owner_listing.sql`
6. `0006_ops_hardening_and_rls.sql`
7. `0007_runtime_actor_identity_bindings.sql`
8. `0008_runtime_local_auth_and_staff_codes.sql`
9. `0009_pgcrypto_schema_qualification.sql`
10. `0010_phase3_complaints_cancel_and_waive.sql`
11. `0011_phase1_platform_partners_and_subscriptions.sql`
12. `0012_phase2_menu_management.sql`
13. `0013_phase3_remake_delivery_fix.sql`
14. `0014_shift_resume_latest_and_single_row.sql`
15. `0015_session_label`
16. `0016_phaseA_platform_portfolio_overview.sql`
17. `0017_phaseB_platform_cafe_detail.sql`
18. `0018_reconcile_multi_shisha_shift_roles.sql`
19. `0019_split_general_complaints_from_item_issues.sql`
20. `0020_canonical_shift_snapshots_and_time_reports.sql`
21. `0021_platform_privacy_refactor_and_admin_views.sql`
22. `0022_remove_support_grants_and_lock_final_access.sql`
23. `0023_platform_subscription_money_follow_and_create_flow.sql`
24. `0024_staff_employment_status_lifecycle.sql`
25. `0025_ops_idempotency_for_sensitive_mutations.sql`
26. `0026_platform_support_inbox_and_dashboard_refactor.sql`
27. `0027_weekly_archiving_rollups.sql`
28. `0028_operational_scope_monthly_yearly_rollups.sql`
29. `0029_runtime_reporting_contract_and_deferred_balances.sql`
30. `0030_archive_scheduler_and_backfill_reconciliation.sql`
31. `0031_archive_approval_and_post_archive_checks.sql`
32. `0032_deferred_finance_non_archival_policy.sql`
33. `0033_search_path_security_hardening.sql`

## Migration summary

### 0001 - 0006
Base runtime rebuild for `ops.*` and `platform.*`, plus hardening and baseline RLS.

### 0007 - 0009
Runtime actor identity bindings, local auth normalization, and pgcrypto/schema qualification cleanup.

### 0010 - 0015
Complaints/cancel/waive, partners/subscriptions, menu management, remake fixes, shift resume/single-row semantics, and service-session label open/resume behavior.

### 0016 - 0017
Initial platform overview/detail surfaces.

### 0018
Reconciliation migration that makes `shisha` multi-actor per shift while keeping `supervisor` and `barista` as active singletons.

### 0019
Canonical split between:
- `ops.complaints` for general complaints
- `ops.order_item_issues` for item-linked notes and reasons (`remake`, `cancel_undelivered`, `waive_delivered`, `note`)

### 0020
Canonical shift snapshots and historical time reports.
Closed-shift history must read from `ops.shift_snapshots`.

### 0021
Platform privacy refactor.
Super admin overview/detail become administrative-only and no longer expose detailed per-cafe runtime internals.

### 0022
Final security/access lock.
Disables platform support grants in the canonical access path and keeps tenant data access scoped to `app.current_cafe_id()` only.

### 0023 - 0026
Platform subscription money flow, staff lifecycle, idempotency hardening, and platform support/dashboard refactor.

### 0027 - 0028
Daily/weekly/monthly/yearly reporting rollups plus archive tables for old operational detail.

### 0029
Runtime/reporting reconciliation. Introduces `ops.deferred_customer_balances` as the operational deferred read model, restores a hard runtime contract check, and wires shift close to refresh the day/week/month/year rollup chain.

### 0030
Archive hardening, scheduler integration, and reporting backfill/reconciliation maintenance functions.

### 0031
Archive approval flow and post-archive runtime verification. Real archive execution now requires a pending approval and a second approval secret before deleting runtime detail.

### 0032
Deferred finance non-archival policy. Codifies that `ops.deferred_ledger_entries` and `ops.deferred_customer_balances` stay live, and extends post-archive verification to assert that deferred finance remains outside `archive.*`.

### 0033
Search-path security hardening for the remaining linter-reported functions. This migration pins `search_path` for `app.current_cafe_id()`, `app.current_super_admin_user_id()`, `ops.generate_session_label()`, and `public.platform_touch_support_message()` without changing their functional behavior.

## Current canonical boundaries

- Daily runtime truth lives in `ops.*`
- Platform admin truth lives in `platform.*`
- Closed historical reporting must be snapshot-driven
- Canonical report chain is `shift_snapshot -> daily -> weekly/monthly -> yearly`
- App/report read paths must treat `ops.shift_snapshots` plus the open shift as the fallback source of truth whenever a summary row is stale or incomplete
- No new migration should reintroduce `tables`, `table_sessions`, or `bill_accounts` as canonical runtime entities


