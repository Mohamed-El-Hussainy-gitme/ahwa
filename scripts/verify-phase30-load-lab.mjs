#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const requiredFiles = [
  'scripts/load/common.mjs',
  'scripts/load/provision-ops-fixtures.mjs',
  'scripts/load/load-core.mjs',
  'scripts/load/run-ops-load.mjs',
  'scripts/load/run-ops-soak.mjs',
  'scripts/load/run-ops-failure-lab.mjs',
  'scripts/load/build-capacity-report.mjs',
  'scripts/load/profiles/default-ops-mix.json',
  'docs/codebase/phase-30-load-testing-and-capacity.md',
];

for (const file of requiredFiles) {
  assert.ok(fs.existsSync(path.resolve(file)), `${file} is missing`);
}

console.log('Phase 30 load lab verification passed.');
