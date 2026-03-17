import { existsSync, readFileSync } from 'node:fs';

function fail(message) {
  console.error(`verify-control-plane-manual-db-selection: ${message}`);
  process.exit(1);
}

const requiredFiles = [
  'database/migrations/0034_control_plane_manual_database_selection.sql',
  'apps/web/src/lib/control-plane/admin.ts',
  'apps/web/src/app/api/platform/control-plane/operational-databases/route.ts',
  'docs/architecture/control-plane-manual-database-selection.md',
];

for (const file of requiredFiles) {
  if (!existsSync(file)) fail(`missing required file: ${file}`);
}

const rootEnv = readFileSync('.env.example', 'utf8');
const webEnv = readFileSync('apps/web/.env.example', 'utf8');
for (const key of [
  'CONTROL_PLANE_SUPABASE_URL',
  'CONTROL_PLANE_SUPABASE_PUBLISHABLE_KEY',
  'CONTROL_PLANE_SUPABASE_SECRET_KEY',
  'AHWA_DEFAULT_OPERATIONAL_DATABASE_KEY',
  'AHWA_OPERATIONAL_DATABASE__OPS_DB_01__URL',
  'AHWA_OPERATIONAL_DATABASE__OPS_DB_01__PUBLISHABLE_KEY',
  'AHWA_OPERATIONAL_DATABASE__OPS_DB_01__SECRET_KEY',
]) {
  if (!rootEnv.includes(`${key}=`)) fail(`root env example missing ${key}`);
  if (!webEnv.includes(`${key}=`)) fail(`apps/web env example missing ${key}`);
}

console.log('verify-control-plane-manual-db-selection: ok');
