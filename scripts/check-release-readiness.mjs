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
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'AHWA_SESSION_SECRET',
  'AHWA_INSTALL_TOKEN',
];

for (const key of requiredKeys) {
  if (!rootEnvExample.includes(`${key}=`)) {
    fail(`root .env.example is missing ${key}`);
  }
  if (!webEnvExample.includes(`${key}=`)) {
    fail(`apps/web/.env.example is missing ${key}`);
  }
}

console.log('release-readiness: ok');

execSync('node ./scripts/check-ops-authz-coverage.mjs', { stdio: 'inherit' });
execSync('node ./scripts/check-final-1to1-lock.mjs', { stdio: 'inherit' });
