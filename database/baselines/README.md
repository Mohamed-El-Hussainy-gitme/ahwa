# Fresh database baselines

- `operational/0001_fresh_operational_baseline.sql`: fresh operational database install bundle (all operational migrations; control-plane-only migrations excluded).

These files are generated from `database/migrations/*` and are meant for **new empty operational databases only**.
The existing control plane remains the source of truth; a newly provisioned operational database only needs registration in the control plane plus the new runtime env values.
Live databases must continue to move forward through the historical migration chain.

Regenerate after any migration change with:

```bash
npm run build:db-baselines
```

Operational bundle includes: 0001_replace_old_with_runtime_v3.sql, 0002_phase2_bootstrap_and_ops.sql, 0003_phase2_station_delivery_ops.sql, 0004_complete_remaining_database.sql, 0005_platform_auth_and_owner_listing.sql, 0006_ops_hardening_and_rls.sql, 0007_runtime_actor_identity_bindings.sql, 0008_runtime_local_auth_and_staff_codes.sql, 0009_pgcrypto_schema_qualification.sql, 0010_phase3_complaints_cancel_and_waive.sql, 0011_phase1_platform_partners_and_subscriptions.sql, 0012_phase2_menu_management.sql, 0013_phase3_remake_delivery_fix.sql, 0014_shift_resume_latest_and_single_row.sql, 0015_session_label.sql, 0016_phaseA_platform_portfolio_overview.sql, 0017_phaseB_platform_cafe_detail.sql, 0018_reconcile_multi_shisha_shift_roles.sql, 0019_split_general_complaints_from_item_issues.sql, 0020_canonical_shift_snapshots_and_time_reports.sql, 0021_platform_privacy_refactor_and_admin_views.sql, 0022_remove_support_grants_and_lock_final_access.sql, 0023_platform_subscription_money_follow_and_create_flow.sql, 0024_staff_employment_status_lifecycle.sql, 0025_ops_idempotency_for_sensitive_mutations.sql, 0026_platform_support_inbox_and_dashboard_refactor.sql, 0027_weekly_archiving_rollups.sql, 0028_operational_scope_monthly_yearly_rollups.sql, 0029_runtime_reporting_contract_and_deferred_balances.sql, 0030_archive_scheduler_and_backfill_reconciliation.sql, 0031_archive_approval_and_post_archive_checks.sql, 0032_deferred_finance_non_archival_policy.sql, 0033_search_path_security_hardening.sql, 0040_ops_atomic_shift_open_with_assignments.sql, 0042_owner_password_setup_runtime_readiness.sql
