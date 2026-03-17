import { existsSync, readFileSync } from 'fs';

function fail(message) {
  console.error(`verify-phase4-runtime-route-migration: ${message}`);
  process.exit(1);
}

const required = [
  'docs/architecture/runtime-operational-route-migration-phase-4.md',
  'apps/web/src/lib/operational-db/runtime.ts',
  'apps/web/src/app/api/ops/_helpers.ts',
  'apps/web/src/app/api/ops/_server.ts',
  'apps/web/src/app/api/ops/_reports.ts',
  'apps/web/src/app/api/ops/menu/_utils.ts',
];

for (const file of required) {
  if (!existsSync(file)) fail(`missing file: ${file}`);
}

const helpers = readFileSync('apps/web/src/app/api/ops/_helpers.ts', 'utf8');
for (const token of ['databaseKey: string', 'resolveOperationalRouteFromRuntimeSession', 'INVALID_OPERATIONAL_ROUTE']) {
  if (!helpers.includes(token)) fail(`ops helper missing token: ${token}`);
}

const server = readFileSync('apps/web/src/app/api/ops/_server.ts', 'utf8');
for (const token of ['await adminOpsForCafeId(cafeId)', 'export async function adminOpsForCafeId']) {
  if (!server.includes(token)) fail(`ops server missing token: ${token}`);
}

const reports = readFileSync('apps/web/src/app/api/ops/_reports.ts', 'utf8');
if (!reports.includes('await adminOpsForCafeId(cafeId)')) fail('reports workspace must use cafe-routed admin ops client');

console.log('verify-phase4-runtime-route-migration: ok');
