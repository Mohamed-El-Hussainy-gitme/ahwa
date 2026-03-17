import { existsSync, readFileSync } from 'node:fs';

function fail(message) {
  console.error(`verify-login-routing-phase3: ${message}`);
  process.exit(1);
}

for (const file of [
  'apps/web/src/lib/operational-db/cookie.ts',
  'apps/web/src/lib/operational-db/runtime.ts',
  'apps/web/src/app/api/authz/operational-route/route.ts',
  'docs/architecture/login-routing-phase-3.md',
]) {
  if (!existsSync(file)) {
    fail(`missing required file: ${file}`);
  }
}

const ownerLogin = readFileSync('apps/web/src/app/api/auth/owner-login/route.ts', 'utf8');
if (!ownerLogin.includes('setOperationalDatabaseKeyCookie')) {
  fail('owner login must set operational DB cookie');
}

const staffLogin = readFileSync('apps/web/src/app/api/auth/staff-login/route.ts', 'utf8');
if (!staffLogin.includes('setOperationalDatabaseKeyCookie')) {
  fail('staff login must set operational DB cookie');
}

const deviceActivate = readFileSync('apps/web/src/app/api/device-gate/activate/route.ts', 'utf8');
if (!deviceActivate.includes('setOperationalDatabaseKeyCookie')) {
  fail('device-gate activation must set operational DB cookie');
}

const runtimeHelper = readFileSync('apps/web/src/lib/operational-db/runtime.ts', 'utf8');
for (const token of [
  'resolveOperationalRouteFromRuntimeSession',
  'readOperationalDatabaseKeyCookie',
  'readRuntimeSession',
]) {
  if (!runtimeHelper.includes(token)) {
    fail(`runtime routing helper missing token: ${token}`);
  }
}

console.log('verify-login-routing-phase3: ok');
