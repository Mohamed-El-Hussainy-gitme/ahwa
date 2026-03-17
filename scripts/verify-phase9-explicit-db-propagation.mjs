import { readFileSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';

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

function fail(message) {
  console.error(`verify-phase9-explicit-db-propagation: ${message}`);
  process.exit(1);
}

const roots = [
  'apps/web/src/app/api/ops',
  'apps/web/src/app/api/owner',
];

const files = roots.flatMap((root) => walk(root)).filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'));
const bareAdminOps = [];
const bareRuntimeContract = [];
const asyncLocalStorageRefs = [];

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  if (/\badminOps\(\s*\)/.test(text)) bareAdminOps.push(file);
  if (/\bensureRuntimeContract\(\s*['"](?:core|reporting)['"]\s*\)/.test(text)) bareRuntimeContract.push(file);
}

const opsServer = readFileSync('apps/web/src/app/api/ops/_server.ts', 'utf8');
if (/AsyncLocalStorage/.test(opsServer)) {
  asyncLocalStorageRefs.push('apps/web/src/app/api/ops/_server.ts');
}

if (bareAdminOps.length) fail(`bare adminOps() is forbidden after phase 9: ${bareAdminOps.join(', ')}`);
if (bareRuntimeContract.length) fail(`ensureRuntimeContract(scope) must pass databaseKey explicitly: ${bareRuntimeContract.join(', ')}`);
if (asyncLocalStorageRefs.length) fail(`AsyncLocalStorage ambient database binding must not remain in ops core: ${asyncLocalStorageRefs.join(', ')}`);

console.log('verify-phase9-explicit-db-propagation: ok');
