#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const roots = process.argv.slice(2);
if (roots.length === 0) {
  console.error('Usage: node scripts/check-no-legacy-usage.mjs <dir> [dir...]');
  process.exit(2);
}

const fileExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const ignoreSegments = new Set(['node_modules', '.next', 'build', 'dist', 'legacy']);
const rules = [
  { pattern: /@\/legacy\/runtime-store/g, message: 'Forbidden legacy bridge import: @/legacy/runtime-store' },
  { pattern: /@\/legacy\/runtime-usecases/g, message: 'Forbidden legacy bridge import: @/legacy/runtime-usecases' },
  { pattern: /@\/legacy\/old-runtime\//g, message: 'Forbidden legacy island import: @/legacy/old-runtime/*' },
  { pattern: /@\/data\/memory\//g, message: 'Forbidden legacy import: @/data/memory/*' },
  { pattern: /@\/usecases\//g, message: 'Forbidden legacy import: @/usecases/*' },
  { pattern: /canonical-runtime/g, message: 'Forbidden legacy runtime reference: canonical-runtime' },
  { pattern: /runtime\/proxy/g, message: 'Forbidden legacy runtime proxy reference: runtime/proxy' },
  { pattern: /contracts\/tables/g, message: 'Forbidden shared legacy contract reference: contracts/tables' },
  { pattern: /contracts\/sessions/g, message: 'Forbidden shared legacy contract reference: contracts/sessions' },
  { pattern: /contracts\/billing/g, message: 'Forbidden shared legacy contract reference: contracts/billing' },
  { pattern: /contracts\/deferred/g, message: 'Forbidden shared legacy contract reference: contracts/deferred' },
  { pattern: /contracts\/reporting/g, message: 'Forbidden shared legacy contract reference: contracts/reporting' },
  { pattern: /lifecycle\/order-flow/g, message: 'Forbidden shared legacy helper reference: lifecycle/order-flow' },
  { pattern: /lib\/api\/server/g, message: 'Forbidden removed bridge reference: lib/api/server' },
  { pattern: /lib\/api\/runtime-server/g, message: 'Forbidden removed bridge reference: lib/api/runtime-server' },
];

function walk(dir, output = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (ignoreSegments.has(entry.name)) continue;
      walk(fullPath, output);
      continue;
    }
    if (fileExtensions.has(path.extname(entry.name))) output.push(fullPath);
  }
  return output;
}

const violations = [];
for (const root of roots) {
  for (const file of walk(path.resolve(root))) {
    const content = fs.readFileSync(file, 'utf8');
    const relative = path.relative(process.cwd(), file);
    for (const rule of rules) {
      const matches = [...content.matchAll(rule.pattern)];
      if (matches.length === 0) continue;
      violations.push({ file: relative, message: rule.message, count: matches.length });
    }
  }
}

if (violations.length === 0) {
  console.log('No forbidden legacy usage found.');
  process.exit(0);
}

console.error('Forbidden legacy usage detected:\n');
for (const violation of violations) {
  console.error(`- ${violation.file}: ${violation.message} (${violation.count})`);
}
process.exit(1);
