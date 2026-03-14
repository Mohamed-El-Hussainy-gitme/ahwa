import { existsSync, readFileSync } from 'node:fs';

function fail(message) {
  console.error(`final-1to1-lock: ${message}`);
  process.exit(1);
}

const requiredFiles = [
  'database/migrations/0022_remove_support_grants_and_lock_final_access.sql',
  'docs/execution/phase-8-security-and-acceptance-lock.md',
  'docs/execution/final-authz-route-matrix.md',
  'docs/execution/final-acceptance-matrix.md',
  'docs/execution/project-status-1-to-1.md',
  'scripts/check-ops-authz-coverage.mjs',
];

for (const file of requiredFiles) {
  if (!existsSync(file)) {
    fail(`missing required final-lock artifact: ${file}`);
  }
}

if (existsSync('apps/web/src/app/api/platform/support/grant/route.ts')) {
  fail('legacy support-grant route still exists');
}

const migration = readFileSync('database/migrations/0022_remove_support_grants_and_lock_final_access.sql', 'utf8');
if (!migration.includes('create or replace function app.has_platform_support_access')) {
  fail('0022 migration does not redefine app.has_platform_support_access');
}
if (!migration.includes('select false')) {
  fail('0022 migration does not hard-disable platform support access');
}
if (!migration.includes('drop function if exists public.platform_grant_support_access')) {
  fail('0022 migration does not remove public.platform_grant_support_access');
}

const report = readFileSync('docs/execution/project-status-1-to-1.md', 'utf8');
for (const phrase of [
  'support grant',
  'route-by-route authz audit',
  'manual UAT',
  '0022_remove_support_grants_and_lock_final_access.sql',
]) {
  if (!report.includes(phrase)) {
    fail(`project status report is missing phrase: ${phrase}`);
  }
}

console.log('final-1to1-lock: ok');
