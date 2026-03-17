import { readFileSync, existsSync } from 'node:fs';

function fail(message) {
  console.error(`verify-control-plane-manual-db-selection: ${message}`);
  process.exit(1);
}

const requiredFiles = [
  'database/migrations/0034_control_plane_manual_database_selection.sql',
  'apps/web/src/app/api/platform/control-plane/operational-databases/route.ts',
  'apps/web/src/app/platform/cafes/new/PlatformCreateCafePageClient.tsx',
  'docs/architecture/control-plane-manual-database-selection.md',
];

for (const file of requiredFiles) {
  if (!existsSync(file)) fail(`missing file: ${file}`);
}

const migration = readFileSync('database/migrations/0034_control_plane_manual_database_selection.sql', 'utf8');
if (!migration.includes('create schema if not exists control;')) fail('control schema missing from migration');
if (!migration.includes('control.operational_databases')) fail('operational database registry missing from migration');
if (!migration.includes('control.cafe_database_bindings')) fail('cafe database bindings missing from migration');
if (!migration.includes('p_database_key text default null')) fail('manual database selection missing from platform_create_cafe_with_owner');

const createPage = readFileSync('apps/web/src/app/platform/cafes/new/PlatformCreateCafePageClient.tsx', 'utf8');
if (!createPage.includes("/api/platform/control-plane/operational-databases")) fail('create cafe page does not load operational databases');
if (!createPage.includes('databaseKey')) fail('create cafe page missing databaseKey state');

const envExample = readFileSync('.env.example', 'utf8');
for (const key of [
  'CONTROL_PLANE_SUPABASE_URL=',
  'CONTROL_PLANE_SUPABASE_PUBLISHABLE_KEY=',
  'CONTROL_PLANE_SUPABASE_SECRET_KEY=',
  'AHWA_OPERATIONAL_DATABASE__OPS_DB_01__URL=',
  'AHWA_OPERATIONAL_DATABASE__OPS_DB_01__PUBLISHABLE_KEY=',
  'AHWA_OPERATIONAL_DATABASE__OPS_DB_01__SECRET_KEY=',
]) {
  if (!envExample.includes(key)) fail(`root .env.example missing ${key}`);
}

console.log('verify-control-plane-manual-db-selection: ok');
