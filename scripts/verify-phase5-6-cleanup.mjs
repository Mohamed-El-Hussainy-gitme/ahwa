#!/usr/bin/env node
import fs from 'node:fs';

const checks = [
  ['apps/api/src/common/platform-auth.ts removed', !fs.existsSync('apps/api/src/common/platform-auth.ts')],
  ['apps/api legacy session-management removed', !fs.existsSync('apps/api/src/modules/session-management')],
  ['apps/api legacy ordering removed', !fs.existsSync('apps/api/src/modules/ordering')],
  ['apps/api legacy billing removed', !fs.existsSync('apps/api/src/modules/billing')],
  ['apps/api legacy deferred-ledger removed', !fs.existsSync('apps/api/src/modules/deferred-ledger')],
  ['apps/api legacy reporting removed', !fs.existsSync('apps/api/src/modules/reporting')],
  ['apps/web runtime proxy removed', !fs.existsSync('apps/web/src/app/api/runtime/proxy/route.ts')],
  ['apps/web canonical-runtime removed', !fs.existsSync('apps/web/src/lib/canonical-runtime')],
  ['packages/shared legacy tables contract removed', !fs.existsSync('packages/shared/src/contracts/tables.ts')],
  ['packages/shared legacy sessions contract removed', !fs.existsSync('packages/shared/src/contracts/sessions.ts')],
];

let failed = false;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'OK' : 'FAIL'} - ${label}`);
  if (!ok) failed = true;
}
process.exit(failed ? 1 : 0);
