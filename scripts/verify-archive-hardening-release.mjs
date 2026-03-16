import { existsSync, readFileSync } from 'node:fs';

function fail(message) {
  console.error(`archive-hardening-release: ${message}`);
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
  'database/migrations/0031_archive_approval_and_post_archive_checks.sql',
  'apps/web/src/app/api/internal/maintenance/reporting/route.ts',
  'apps/web/vercel.json',
  'docs/database/reporting-maintenance.md',
  'docs/codebase/phase-25-archive-approval-hardening.md',
  'docs/execution/archive-approval-runbook.md',
  'docs/execution/post-archive-runtime-check-matrix.md',
  'scripts/manage-reporting-archive-approval.mjs',
  'scripts/smoke-archive-hardening.mjs',
];

for (const file of requiredFiles) expectFile(file);

expectIncludes('database/migrations/0031_archive_approval_and_post_archive_checks.sql', [
  'ops.archive_execution_approvals',
  'ops_request_archive_execution_approval',
  'ops_post_archive_runtime_check',
  'ops_execute_archive_execution_approval',
  'failed_post_check',
]);

expectIncludes('apps/web/src/app/api/internal/maintenance/reporting/route.ts', [
  "type MaintenanceAction = 'backfill' | 'reconcile' | 'archive' | 'archive-plan' | 'archive-execute'",
  'assertArchiveApprovalSecret',
  'ops_request_archive_execution_approval',
  'ops_execute_archive_execution_approval',
  'archive-plan',
  'archive-execute',
]);

expectIncludes('apps/web/vercel.json', [
  '/api/internal/maintenance/reporting?action=archive-plan',
]);

expectIncludes('docs/database/reporting-maintenance.md', [
  'Phase 8 - archive approval flow and post-archive checks',
  'archive-plan',
  'archive-execute',
  'post-archive runtime check',
]);

expectIncludes('scripts/manage-reporting-archive-approval.mjs', [
  'AHWA_REPORTING_ARCHIVE_APPROVAL_ID',
  'AHWA_REPORTING_ARCHIVE_APPROVAL_SECRET',
  "MODE === 'plan'",
  "MODE === 'execute'",
]);

expectIncludes('scripts/smoke-archive-hardening.mjs', [
  'archive-plan',
  'approval_required',
  'approval_id',
]);

const packageJson = readFileSync('package.json', 'utf8');
for (const scriptName of ['verify:archive-hardening', 'smoke:archive-hardening', 'archive:plan', 'archive:execute']) {
  if (!packageJson.includes(`\"${scriptName}\"`)) {
    fail(`package.json is missing script ${scriptName}`);
  }
}

console.log('archive-hardening-release: ok');
