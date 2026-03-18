import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

function fail(message) {
  console.error(`verify-control-plane-manual-db-selection: ${message}`);
  process.exit(1);
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...walk(full));
    else if (stat.isFile()) out.push(full.replace(/\\/g, '/'));
  }
  return out;
}

function extractOperationalTokens(contents) {
  const matches = [...contents.matchAll(/^AHWA_OPERATIONAL_DATABASE__([A-Z0-9_]+)__URL=/gm)];
  return [...new Set(matches.map((match) => match[1]))];
}

function assertOperationalDatabaseGroups(contents, label) {
  const tokens = extractOperationalTokens(contents);
  if (tokens.length === 0) fail(`${label} must define at least one operational database env group`);
  for (const token of tokens) {
    for (const suffix of ['URL', 'PUBLISHABLE_KEY', 'SECRET_KEY']) {
      const key = `AHWA_OPERATIONAL_DATABASE__${token}__${suffix}`;
      if (!contents.includes(`${key}=`)) fail(`${label} is missing ${key}`);
    }
  }
}

const requiredFiles = [
  'database/migrations/0034_control_plane_manual_database_selection.sql',
  'database/migrations/0035_phase8_strict_control_plane_bindings.sql',
  'apps/web/src/lib/control-plane/admin.ts',
  'apps/web/src/app/api/platform/control-plane/operational-databases/route.ts',
  'docs/architecture/control-plane-manual-database-selection.md',
  'database/migrations/0037_control_plane_public_binding_readers.sql',
  'database/migrations/0039_control_plane_operational_database_registration.sql',
  'database/control-plane/register-operational-database.sql',
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
]) {
  if (!rootEnv.includes(`${key}=`)) fail(`root env example missing ${key}`);
  if (!webEnv.includes(`${key}=`)) fail(`apps/web env example missing ${key}`);
}

for (const forbidden of ['AHWA_DEFAULT_OPERATIONAL_DATABASE_KEY=', 'AHWA_OPERATIONAL_DATABASE__OPS_DB_01__']) {
  if (rootEnv.includes(forbidden)) fail(`root env example still contains legacy default contract: ${forbidden}`);
  if (webEnv.includes(forbidden)) fail(`apps/web env example still contains legacy default contract: ${forbidden}`);
}

assertOperationalDatabaseGroups(rootEnv, 'root env example');
assertOperationalDatabaseGroups(webEnv, 'apps/web env example');


const webFiles = walk('apps/web/src').filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'));
const directControlSchemaUsage = webFiles.filter((file) => /\.schema\((['"])control\1\)/.test(readFileSync(file, 'utf8')));
if (directControlSchemaUsage.length) {
  fail(`apps/web must not query control schema directly: ${directControlSchemaUsage.join(', ')}`);
}

console.log('verify-control-plane-manual-db-selection: ok');
