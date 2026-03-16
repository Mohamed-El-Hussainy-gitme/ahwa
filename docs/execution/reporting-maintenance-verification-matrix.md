# Reporting maintenance verification matrix

| Area | Check | Expected result | Blocking severity |
|---|---|---|---|
| Runtime contract | `0029` applied and `ops_assert_runtime_contract` exists | Contract check returns success for `core` and `reporting` | Block release |
| Deferred balances | `ops.deferred_customer_balances` populated after backfill | Billing/dashboard deferred reads come from read model | Block release |
| Daily rollup | Morning + evening closed shifts rebuild one `daily_snapshot` | `closed_shift_count = 2` and `is_finalized = true` when both shifts exist | Block release |
| Backfill | `ops_backfill_reporting_history` over target window | Rebuild completes without SQL error and returns `backfilled: true` | Block release |
| Reconcile | `ops_reconcile_reporting_window` over same window | `daily_mismatch_count = 0` and no missing week/month/year summaries | Block release |
| Archive plan | `ops_request_archive_execution_approval` via route | Returns approval metadata without deleting runtime rows | Block release |
| Archive execute | `ops_execute_archive_execution_approval` with approval secret | Executes only for pending, non-expired approvals | Block release |
| Post-archive runtime check | `ops_post_archive_runtime_check` | No lingering runtime rows and no missing day/week/month/year coverage | Block release |
| Runtime after archive | Billing/orders/dashboard on current window | Core runtime still loads and acts only on live rows | Block release |
| Maintenance audit | `ops.reporting_maintenance_runs` and `ops.archive_execution_approvals` | Run rows and approvals recorded with final status | Block release |
| Cron wiring | `apps/web/vercel.json` | Daily backfill, daily reconcile, weekly archive plan remain configured | Block release |

## Manual acceptance sequence

1. Create or choose a cafe with at least two closed business days.
2. Run backfill on the desired window.
3. Run reconcile on the same window.
4. Confirm mismatch count is zero.
5. Run archive plan.
6. Review projected counts and generated approval id.
7. Run archive execute only after plan review passes.
8. Inspect the post-check output.
9. Re-open runtime surfaces and confirm current live operations still work.
