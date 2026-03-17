#!/usr/bin/env node
import fs from 'node:fs';

const requiredFiles = [
  'database/migrations/0035_control_plane_support_access_sessions.sql',
  'apps/web/src/lib/platform-support/session.ts',
  'apps/web/src/lib/platform-support/server.ts',
  'apps/web/src/lib/control-plane/support-access.ts',
  'apps/web/src/app/api/platform/support/access/request/route.ts',
  'apps/web/src/app/api/platform/support/access/activate/route.ts',
  'apps/web/src/app/api/platform/support/access/close/route.ts',
  'apps/web/src/app/api/platform/support/access/current/route.ts',
  'docs/architecture/support-access-phase-6.md',
];

let failed = false;
for (const file of requiredFiles) {
  const ok = fs.existsSync(file);
  console.log(`${ok ? 'OK' : 'FAIL'} - ${file}`);
  if (!ok) failed = true;
}

const migration = fs.readFileSync('database/migrations/0035_control_plane_support_access_sessions.sql', 'utf8');
const expectations = [
  'create table if not exists control.support_access_requests',
  'create table if not exists control.support_access_audit_events',
  'create or replace function public.control_request_support_access',
  'create or replace function public.control_activate_support_access',
  'create or replace function public.control_close_support_access',
  'create or replace function public.control_get_active_support_access',
  'create or replace function public.control_list_support_access_requests',
];
for (const pattern of expectations) {
  const ok = migration.includes(pattern);
  console.log(`${ok ? 'OK' : 'FAIL'} - migration contains ${pattern}`);
  if (!ok) failed = true;
}

const packageJson = fs.readFileSync('package.json', 'utf8');
if (!packageJson.includes('verify:phase6-support-access')) {
  console.log('FAIL - package.json missing verify:phase6-support-access');
  failed = true;
} else {
  console.log('OK - package.json contains verify:phase6-support-access');
}

process.exit(failed ? 1 : 0);
