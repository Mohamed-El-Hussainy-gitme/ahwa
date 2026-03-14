import { existsSync, readFileSync } from 'node:fs';

const checks = [
  ['apps/api removed', !existsSync('apps/api')],
  ['web api bridge removed', !existsSync('apps/web/src/lib/api')],
  ['legacy auth session removed', !existsSync('apps/web/src/lib/auth/session.ts')],
  ['phase 9 migration exists', existsSync('database/migrations/0008_runtime_local_auth_and_staff_codes.sql')],
  ['root build script no longer references api', !readFileSync('package.json', 'utf8').includes('build:api')],
  ['web env example no longer references AHWA_API_BASE_URL', !readFileSync('apps/web/.env.example', 'utf8').includes('AHWA_API_BASE_URL')],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [label, ok] of checks) {
  console.log(`${ok ? 'OK' : 'FAIL'} ${label}`);
}

if (failed.length > 0) {
  process.exitCode = 1;
}
