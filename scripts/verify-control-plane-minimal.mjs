import { existsSync, readFileSync } from 'node:fs';

function fail(message) {
  console.error(`verify-control-plane-minimal: ${message}`);
  process.exit(1);
}

const requiredFiles = [
  'database/migrations/0034_control_plane_minimal_foundation.sql',
  'docs/architecture/control-plane-minimal-foundation.md',
  'apps/web/src/app/api/platform/control-plane/overview/route.ts',
];

for (const file of requiredFiles) {
  if (!existsSync(file)) {
    fail(`missing required file: ${file}`);
  }
}

const migration = readFileSync('database/migrations/0034_control_plane_minimal_foundation.sql', 'utf8');
const migrationChecks = [
  'create schema if not exists control;',
  'create table if not exists control.operational_databases',
  'create table if not exists control.cafe_database_bindings',
  'create table if not exists control.database_migration_runs',
  'create table if not exists control.operational_database_health',
  "insert into control.operational_databases",
  "'ops-db-01'",
  'control_backfill_default_cafe_bindings',
  'control_platform_overview',
];

for (const snippet of migrationChecks) {
  if (!migration.includes(snippet)) {
    fail(`migration 0034 is missing snippet: ${snippet}`);
  }
}

const route = readFileSync('apps/web/src/app/api/platform/control-plane/overview/route.ts', 'utf8');
if (!route.includes("admin.rpc('control_platform_overview'")) {
  fail('control-plane overview route must call control_platform_overview RPC');
}

const settingsPage = readFileSync('apps/web/src/app/platform/settings/PlatformSettingsPageClient.tsx', 'utf8');
if (!settingsPage.includes('/api/platform/control-plane/overview')) {
  fail('platform settings page must load the control-plane overview route');
}

console.log('verify-control-plane-minimal: ok');
