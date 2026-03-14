import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const requiredFiles = [
  'apps/web/src/lib/http/client.ts',
  'apps/web/src/lib/ops/hooks.ts',
  'apps/web/src/lib/ops/realtime.ts',
  'apps/web/src/lib/ops/events.ts',
  'apps/web/src/app/api/ops/events/route.ts',
  'docs/codebase/phase-21-thin-client-and-realtime.md',
];

for (const relative of requiredFiles) {
  const full = path.join(root, relative);
  if (!fs.existsSync(full)) {
    console.error(`Missing required file: ${relative}`);
    process.exit(1);
  }
}

const hooks = fs.readFileSync(path.join(root, 'apps/web/src/lib/ops/hooks.ts'), 'utf8');
if (!hooks.includes('useOpsWorkspace') || !hooks.includes('useOpsCommand')) {
  console.error('Ops hooks are incomplete.');
  process.exit(1);
}

const eventsRoute = fs.readFileSync(path.join(root, 'apps/web/src/app/api/ops/events/route.ts'), 'utf8');
if (!eventsRoute.includes('text/event-stream') || !eventsRoute.includes('subscribeOpsEvents')) {
  console.error('Realtime SSE route is incomplete.');
  process.exit(1);
}

const ordersPage = fs.readFileSync(path.join(root, 'apps/web/src/app/(app)/orders/page.tsx'), 'utf8');
if (!ordersPage.includes('useOpsWorkspace') || !ordersPage.includes('useOpsCommand')) {
  console.error('Orders page is not using the thin-client hooks.');
  process.exit(1);
}

console.log('verify-phase7-8-realtime: ok');
