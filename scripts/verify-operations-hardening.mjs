#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const requiredFiles = [
  'docs/deployment/production-release-gate.md',
  'docs/deployment/environment-matrix.md',
  'docs/execution/platform-operations-runbook.md',
];

for (const file of requiredFiles) {
  if (!fs.existsSync(path.resolve(file))) {
    console.error(`operations-hardening: missing required file ${file}`);
    process.exit(1);
  }
}

const read = (file) => fs.readFileSync(path.resolve(file), 'utf8');
const workflow = read('.github/workflows/ci.yml');
const releaseDoc = read('docs/deployment/production-release-gate.md');
const envMatrix = read('docs/deployment/environment-matrix.md');
const runbook = read('docs/execution/platform-operations-runbook.md');
const readme = read('README.md');

const checks = [
  [workflow.includes('npm run verify:operations'), 'ci workflow must run npm run verify:operations'],
  [workflow.includes('npm run verify:phase30'), 'ci workflow must run npm run verify:phase30'],
  [workflow.includes('workflow_dispatch:'), 'ci workflow must support workflow_dispatch'],
  [workflow.includes('schedule:'), 'ci workflow must include a scheduled run'],
  [releaseDoc.includes('verify:release') && releaseDoc.includes('verify:phase30'), 'production release gate must mention verify:release and verify:phase30'],
  [envMatrix.includes('Required in production') && envMatrix.includes('Optional / future') && envMatrix.includes('Load / soak / failure lab only'), 'environment matrix must classify production, optional, and lab envs'],
  [runbook.includes('/api/internal/health/ops') && runbook.includes('ops/events') && runbook.includes('outbox'), 'platform operations runbook must cover ops health, ops/events, and outbox'],
  [readme.includes('docs/deployment/production-release-gate.md') && readme.includes('docs/execution/platform-operations-runbook.md'), 'README must reference the new operations docs'],
];

for (const [ok, message] of checks) {
  if (!ok) {
    console.error(`operations-hardening: ${message}`);
    process.exit(1);
  }
}

console.log('operations-hardening: ok');
