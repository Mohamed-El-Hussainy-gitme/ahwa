import { existsSync, readFileSync } from 'node:fs';

function fail(message) {
  console.error(`reporting-maintenance-release: ${message}`);
  process.exit(1);
}

function expectFile(path) {
  if (!existsSync(path)) {
    fail(`missing required artifact: ${path}`);
  }
}

function expectIncludes(path, snippets) {
  const content = readFileSync(path, 'utf8');
  for (const snippet of snippets) {
    if (!content.includes(snippet)) {
      fail(`${path} is missing expected snippet: ${snippet}`);
    }
  }
}

const requiredFiles = [
  'database/migrations/0029_runtime_reporting_contract_and_deferred_balances.sql',
  'database/migrations/0030_archive_scheduler_and_backfill_reconciliation.sql',
  'apps/web/src/app/api/internal/maintenance/reporting/route.ts',
  'apps/web/vercel.json',
  'docs/database/reporting-maintenance.md',
  'docs/codebase/phase-24-reporting-maintenance-release-gate.md',
  'docs/execution/reporting-maintenance-smoke-runbook.md',
  'docs/execution/reporting-maintenance-verification-matrix.md',
  'scripts/smoke-reporting-maintenance.mjs',
];

for (const file of requiredFiles) expectFile(file);

expectIncludes('database/migrations/0029_runtime_reporting_contract_and_deferred_balances.sql', [
  'ops.deferred_customer_balances',
  'ops_assert_runtime_contract',
  'ops_refresh_reporting_chain',
  'closed_shift_count',
  'is_finalized',
]);

expectIncludes('database/migrations/0030_archive_scheduler_and_backfill_reconciliation.sql', [
  'ops.reporting_maintenance_runs',
  'ops_archive_closed_data',
  'p_dry_run boolean default false',
  'ops_backfill_reporting_history',
  'ops_reconcile_reporting_window',
  'ops_run_weekly_archive',
]);

expectIncludes('apps/web/src/app/api/internal/maintenance/reporting/route.ts', [
  "type MaintenanceAction = 'backfill' | 'reconcile' | 'archive' | 'archive-plan' | 'archive-execute'",
  'assertCronAuth',
  'assertArchiveApprovalSecret',
  "ops_backfill_reporting_history",
  "ops_reconcile_reporting_window",
  "ops_request_archive_execution_approval",
  "ops_execute_archive_execution_approval",
]);

expectIncludes('apps/web/vercel.json', [
  '/api/internal/maintenance/reporting?action=backfill',
  '/api/internal/maintenance/reporting?action=reconcile',
  '/api/internal/maintenance/reporting?action=archive-plan',
]);

expectIncludes('docs/database/reporting-maintenance.md', [
  'Phase 7 - release gate and smoke verification',
  'archive-plan',
  'verification matrix',
]);

expectIncludes('docs/execution/reporting-maintenance-smoke-runbook.md', [
  'backfill',
  'reconcile',
  'archive',
  'archive-plan',
  'CRON_SECRET',
]);

expectIncludes('docs/execution/reporting-maintenance-verification-matrix.md', [
  'Runtime contract',
  'Backfill',
  'Reconcile',
  'Archive plan',
  'Archive execute',
]);

expectIncludes('scripts/smoke-reporting-maintenance.mjs', [
  'AHWA_REPORTING_MAINTENANCE_BASE_URL',
  'AHWA_REPORTING_MAINTENANCE_CRON_SECRET',
  "'backfill'",
  "'reconcile'",
  "'archive-plan'",
]);

const packageJson = readFileSync('package.json', 'utf8');
for (const scriptName of ['verify:reporting-maintenance', 'smoke:reporting-maintenance']) {
  if (!packageJson.includes(`\"${scriptName}\"`)) {
    fail(`package.json is missing script ${scriptName}`);
  }
}

console.log('reporting-maintenance-release: ok');
