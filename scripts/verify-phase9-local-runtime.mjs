import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...walk(full));
    } else if (stat.isFile()) {
      out.push(full.replace(/\\/g, '/'));
    }
  }
  return out;
}

const allowedApiHelpers = new Set([
  'apps/web/src/lib/api/errors.ts',
]);

const apiHelperFiles = existsSync('apps/web/src/lib/api')
  ? walk('apps/web/src/lib/api')
  : [];
const unexpectedApiHelpers = apiHelperFiles.filter((file) => !allowedApiHelpers.has(file));

const checks = [
  ['apps/api removed', !existsSync('apps/api')],
  ['legacy web api bridge removed', unexpectedApiHelpers.length === 0],
  ['legacy auth session removed', !existsSync('apps/web/src/lib/auth/session.ts')],
  ['phase 9 migration exists', existsSync('database/migrations/0008_runtime_local_auth_and_staff_codes.sql')],
  ['root build script no longer references api', !readFileSync('package.json', 'utf8').includes('build:api')],
  ['web env example no longer references AHWA_API_BASE_URL', !readFileSync('apps/web/.env.example', 'utf8').includes('AHWA_API_BASE_URL')],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [label, ok] of checks) {
  console.log(`${ok ? 'OK' : 'FAIL'} ${label}`);
}

if (unexpectedApiHelpers.length > 0) {
  console.error(`Unexpected legacy api helper files: ${unexpectedApiHelpers.join(', ')}`);
}

if (failed.length > 0) {
  process.exitCode = 1;
}
