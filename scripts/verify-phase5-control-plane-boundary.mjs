import { existsSync, readFileSync } from 'fs';

function fail(message) {
  console.error(`verify-phase5-control-plane-boundary: ${message}`);
  process.exit(1);
}

const required = [
  'apps/web/src/lib/control-plane/admin.ts',
  'docs/architecture/platform-control-plane-boundary-phase-5.md',
  'apps/web/src/app/api/platform/overview/route.ts',
  'apps/web/src/app/api/platform/control-plane/overview/route.ts',
  'apps/web/src/lib/control-plane/server.ts',
];

for (const file of required) {
  if (!existsSync(file)) fail(`missing file: ${file}`);
}

const admin = readFileSync('apps/web/src/lib/control-plane/admin.ts', 'utf8');
for (const token of ['CONTROL_PLANE_SUPABASE_URL', 'controlPlaneAdmin', 'getControlPlaneConfig']) {
  if (!admin.includes(token)) fail(`control-plane admin helper missing token: ${token}`);
}

for (const file of [
  'apps/web/src/app/api/platform/overview/route.ts',
  'apps/web/src/app/api/platform/control-plane/overview/route.ts',
  'apps/web/src/lib/control-plane/server.ts',
]) {
  const content = readFileSync(file, 'utf8');
  if (!content.includes('controlPlaneAdmin')) fail(`${file} must use controlPlaneAdmin`);
}

console.log('verify-phase5-control-plane-boundary: ok');
