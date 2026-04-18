import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

function fail(message) {
  console.error(`release-readiness: ${message}`);
  process.exit(1);
}

function gitLsFiles(path) {
  try {
    const out = execSync(`git ls-files --error-unmatch -- ${JSON.stringify(path)}`, {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    });
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

function extractOperationalTokens(contents) {
  const matches = [...contents.matchAll(/^AHWA_OPERATIONAL_DATABASE__([A-Z0-9_]+)__URL=/gm)];
  return [...new Set(matches.map((match) => match[1]))];
}

function assertOperationalDatabaseGroups(contents, label) {
  const tokens = extractOperationalTokens(contents);
  if (tokens.length === 0) {
    fail(`${label} must define at least one AHWA_OPERATIONAL_DATABASE__<TOKEN>__* group`);
  }

  for (const token of tokens) {
    for (const suffix of ['URL', 'PUBLISHABLE_KEY', 'SECRET_KEY']) {
      const key = `AHWA_OPERATIONAL_DATABASE__${token}__${suffix}`;
      if (!contents.includes(`${key}=`)) {
        fail(`${label} is missing ${key}`);
      }
    }
  }
}

const blockedTrackedFiles = [
  'apps/web/.env.local',
  'apps/web/tsconfig.tsbuildinfo',
  '.env',
  '.env.local',
];

for (const file of blockedTrackedFiles) {
  if (gitLsFiles(file)) {
    fail(`tracked file is not allowed in git: ${file}`);
  }
}

const exampleFiles = ['.env.example', 'apps/web/.env.example'];
for (const file of exampleFiles) {
  if (!existsSync(file)) {
    fail(`missing example env file: ${file}`);
  }
}

const rootEnvExample = readFileSync('.env.example', 'utf8');
const webEnvExample = readFileSync('apps/web/.env.example', 'utf8');
const requiredKeys = [
  'CONTROL_PLANE_SUPABASE_URL',
  'CONTROL_PLANE_SUPABASE_PUBLISHABLE_KEY',
  'CONTROL_PLANE_SUPABASE_SECRET_KEY',
  'AHWA_SESSION_SECRET',
  'AHWA_INSTALL_TOKEN',
  'CRON_SECRET',
  'ARCHIVE_APPROVAL_SECRET',
];

for (const key of requiredKeys) {
  if (!rootEnvExample.includes(`${key}=`)) {
    fail(`root .env.example is missing ${key}`);
  }
  if (!webEnvExample.includes(`${key}=`)) {
    fail(`apps/web/.env.example is missing ${key}`);
  }
}

for (const forbidden of ['AHWA_DEFAULT_OPERATIONAL_DATABASE_KEY=', 'AHWA_OPERATIONAL_DATABASE__OPS_DB_01__']) {
  if (rootEnvExample.includes(forbidden)) {
    fail(`root .env.example still contains legacy default contract: ${forbidden}`);
  }
  if (webEnvExample.includes(forbidden)) {
    fail(`apps/web/.env.example still contains legacy default contract: ${forbidden}`);
  }
}

assertOperationalDatabaseGroups(rootEnvExample, 'root .env.example');
assertOperationalDatabaseGroups(webEnvExample, 'apps/web/.env.example');

console.log('release-readiness: ok');

execSync('node ./scripts/check-ops-authz-coverage.mjs', { stdio: 'inherit' });
execSync('node ./scripts/check-final-1to1-lock.mjs', { stdio: 'inherit' });
execSync('node ./scripts/check-batch4-admin-hygiene.mjs', { stdio: 'inherit' });
execSync('node ./scripts/verify-reporting-maintenance-release.mjs', { stdio: 'inherit' });
execSync('node ./scripts/verify-reporting-read-path.mjs', { stdio: 'inherit' });
execSync('node ./scripts/verify-archive-hardening-release.mjs', { stdio: 'inherit' });
execSync('node ./scripts/verify-control-plane-manual-db-selection.mjs', { stdio: 'inherit' });
execSync('node ./scripts/verify-phase9-explicit-db-propagation.mjs', { stdio: 'inherit' });
execSync('node ./scripts/verify-platform-response-hardening.mjs', { stdio: 'inherit' });

execSync('node ./scripts/verify-runtime-public-freshness.mjs', { stdio: 'inherit' });
execSync('node ./scripts/verify-ops-admin-resilience.mjs', { stdio: 'inherit' });
