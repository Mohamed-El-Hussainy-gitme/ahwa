import { existsSync, readFileSync } from 'node:fs';

function fail(message) {
  console.error(`verify-operational-db-routing-foundation: ${message}`);
  process.exit(1);
}

const requiredFiles = [
  'apps/web/src/lib/control-plane/server.ts',
  'apps/web/src/lib/operational-db/server.ts',
  'docs/architecture/operational-db-routing-foundation.md',
];

for (const file of requiredFiles) {
  if (!existsSync(file)) {
    fail(`missing required file: ${file}`);
  }
}

const controlPlane = readFileSync('apps/web/src/lib/control-plane/server.ts', 'utf8');
for (const token of [
  'resolveCafeOperationalRouteBySlug',
  'resolveCafeOperationalRouteByCafeId',
  'control_get_cafe_database_binding',
]) {
  if (!controlPlane.includes(token)) {
    fail(`control-plane resolver is missing token: ${token}`);
  }
}

const operationalDb = readFileSync('apps/web/src/lib/operational-db/server.ts', 'utf8');
for (const token of [
  'getOperationalAdminClient',
  'getOperationalAdminOpsClient',
  'AHWA_OPERATIONAL_DATABASE__',
  'getOperationalAdminClientForCafeSlug',
  'getOperationalAdminClientForCafeId',
]) {
  if (!operationalDb.includes(token)) {
    fail(`operational-db factory is missing token: ${token}`);
  }
}

const ownerLogin = readFileSync('apps/web/src/app/api/auth/owner-login/route.ts', 'utf8');
if (!ownerLogin.includes('getOperationalAdminClientForCafeSlug')) {
  fail('owner login route must use routed operational admin client');
}

const staffLogin = readFileSync('apps/web/src/app/api/auth/staff-login/route.ts', 'utf8');
if (!staffLogin.includes('getOperationalAdminClientForCafeSlug')) {
  fail('staff login route must use routed operational admin client');
}

console.log('verify-operational-db-routing-foundation: ok');
