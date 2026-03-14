import { existsSync, readFileSync } from 'node:fs';

const checks = [
  ['apps/api remains removed', !existsSync('apps/api')],
  ['phase 10 doc exists', existsSync('docs/codebase/phase-23-regression-smoke-e2e.md')],
  ['phase 10 runbook exists', existsSync('docs/execution/runtime-e2e-smoke-runbook.md')],
  ['phase 10 smoke script exists', existsSync('scripts/smoke-phase10-runtime-e2e.mjs')],
  ['legacy step4 smoke removed', !existsSync('scripts/step4-flow-smoke.ts')],
  ['package.json exposes verify:phase10', readFileSync('package.json', 'utf8').includes('"verify:phase10"')],
  ['package.json exposes smoke:phase10', readFileSync('package.json', 'utf8').includes('"smoke:phase10"')],
  ['web README references phase 10 smoke', readFileSync('apps/web/README.md', 'utf8').includes('smoke:phase10')],
  ['root README references phase 10 smoke', readFileSync('README.md', 'utf8').includes('smoke:phase10')],
  ['ops events route still exists', existsSync('apps/web/src/app/api/ops/events/route.ts')],
  ['runtime me route still exists', existsSync('apps/web/src/app/api/runtime/me/route.ts')],
  ['platform bootstrap route still exists', existsSync('apps/web/src/app/api/platform/bootstrap/route.ts')],
  ['phase 9 migration still exists', existsSync('database/migrations/0008_runtime_local_auth_and_staff_codes.sql')],
  ['web env example documents pairing code', readFileSync('apps/web/.env.example', 'utf8').includes('AHWA_DEVICE_PAIRING_CODE')],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [label, ok] of checks) {
  console.log(`${ok ? 'OK' : 'FAIL'} ${label}`);
}

if (failed.length > 0) {
  process.exitCode = 1;
}
