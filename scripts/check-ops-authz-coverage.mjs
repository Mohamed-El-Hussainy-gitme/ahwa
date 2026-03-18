import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

function fail(message) {
  console.error(`ops-authz-coverage: ${message}`);
  process.exit(1);
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...walk(full));
    } else if (stat.isFile()) {
      out.push(full);
    }
  }
  return out;
}

const expected = new Map([
  ['apps/web/src/app/api/ops/billing/billable/route.ts', ['requireOpsActorContext', 'requireBillingAccess']],
  ['apps/web/src/app/api/ops/billing/defer/route.ts', ['requireOpsActorContext', 'requireBillingAccess']],
  ['apps/web/src/app/api/ops/billing/settle/route.ts', ['requireOpsActorContext', 'requireBillingAccess']],
  ['apps/web/src/app/api/ops/complaints/create/route.ts', ['requireOpsActorContext', 'requireComplaintLogAccess', 'requireComplaintItemAccess', 'requireComplaintActionAccess']],
  ['apps/web/src/app/api/ops/complaints/resolve/route.ts', ['requireOpsActorContext', 'requireComplaintManagementAccess']],
  ['apps/web/src/app/api/ops/deferred/add-debt/route.ts', ['requireOpsActorContext', 'requireDeferredAccess']],
  ['apps/web/src/app/api/ops/deferred/balance/route.ts', ['requireOpsActorContext', 'requireDeferredAccess']],
  ['apps/web/src/app/api/ops/deferred/ledger/route.ts', ['requireOpsActorContext', 'requireDeferredAccess']],
  ['apps/web/src/app/api/ops/deferred/repay/route.ts', ['requireOpsActorContext', 'requireDeferredAccess']],
  ['apps/web/src/app/api/ops/delivery/deliver/route.ts', ['requireOpsActorContext', 'requireDeliveryAccess']],
  ['apps/web/src/app/api/ops/delivery/ready-list/route.ts', ['requireOpsActorContext', 'requireWaiterWorkspaceAccess']],
  ['apps/web/src/app/api/ops/events/route.ts', ['getEnrichedRuntimeMeFromCookie']],
  ['apps/web/src/app/api/ops/fulfillment/partial-ready/route.ts', ['requireOpsActorContext', 'requireStationAccess']],
  ['apps/web/src/app/api/ops/fulfillment/ready/route.ts', ['requireOpsActorContext', 'requireStationAccess']],
  ['apps/web/src/app/api/ops/fulfillment/remake/route.ts', ['requireOpsActorContext', 'requireComplaintManagementAccess', 'requireComplaintActionAccess']],
  ['apps/web/src/app/api/ops/menu/products/create/route.ts', ['requireOpsActorContext', 'requireOwnerRole']],
  ['apps/web/src/app/api/ops/menu/products/delete/route.ts', ['requireOpsActorContext', 'requireOwnerRole']],
  ['apps/web/src/app/api/ops/menu/products/reorder/route.ts', ['requireOpsActorContext', 'requireOwnerRole']],
  ['apps/web/src/app/api/ops/menu/products/toggle/route.ts', ['requireOpsActorContext', 'requireOwnerRole']],
  ['apps/web/src/app/api/ops/menu/products/update/route.ts', ['requireOpsActorContext', 'requireOwnerRole']],
  ['apps/web/src/app/api/ops/menu/sections/create/route.ts', ['requireOpsActorContext', 'requireOwnerRole']],
  ['apps/web/src/app/api/ops/menu/sections/delete/route.ts', ['requireOpsActorContext', 'requireOwnerRole']],
  ['apps/web/src/app/api/ops/menu/sections/reorder/route.ts', ['requireOpsActorContext', 'requireOwnerRole']],
  ['apps/web/src/app/api/ops/menu/sections/toggle/route.ts', ['requireOpsActorContext', 'requireOwnerRole']],
  ['apps/web/src/app/api/ops/menu/sections/update/route.ts', ['requireOpsActorContext', 'requireOwnerRole']],
  ['apps/web/src/app/api/ops/orders/create-with-items/route.ts', ['requireOpsActorContext', 'requireSessionOrderAccess', 'requireOpenOpsShift']],
  ['apps/web/src/app/api/ops/sessions/close/route.ts', ['requireOpsActorContext', 'requireBillingAccess']],
  ['apps/web/src/app/api/ops/sessions/open-or-resume/route.ts', ['requireOpsActorContext', 'requireSessionOrderAccess', 'requireOpenOpsShift']],
  ['apps/web/src/app/api/ops/workspaces/billing/route.ts', ['requireOpsActorContext', 'requireBillingAccess']],
  ['apps/web/src/app/api/ops/workspaces/complaints/route.ts', ['requireOpsActorContext', 'requireComplaintLogAccess']],
  ['apps/web/src/app/api/ops/workspaces/dashboard/route.ts', ['requireOpsActorContext', 'requireOwnerOrSupervisor']],
  ['apps/web/src/app/api/ops/workspaces/deferred-customer-ledger/route.ts', ['requireOpsActorContext', 'requireDeferredAccess']],
  ['apps/web/src/app/api/ops/workspaces/deferred-customers/route.ts', ['requireOpsActorContext', 'requireDeferredAccess']],
  ['apps/web/src/app/api/ops/workspaces/menu/route.ts', ['requireOpsActorContext', 'requireOwnerRole']],
  ['apps/web/src/app/api/ops/workspaces/nav-summary/route.ts', ['requireOpsActorContext']],
  ['apps/web/src/app/api/ops/workspaces/reports/route.ts', ['requireOpsActorContext', 'requireReportsAccess']],
  ['apps/web/src/app/api/ops/workspaces/station/route.ts', ['requireOpsActorContext', 'requireStationAccess']],
  ['apps/web/src/app/api/ops/workspaces/waiter/route.ts', ['requireOpsActorContext', 'requireWaiterWorkspaceAccess']],
  ['apps/web/src/app/api/owner/shift/close/route.ts', ['requireOpsActorContext', 'requireOwnerRole']],
  ['apps/web/src/app/api/owner/shift/close-snapshot/route.ts', ['requireOpsActorContext', 'requireOwnerOrSupervisor']],
  ['apps/web/src/app/api/owner/shift/history/route.ts', ['requireOpsActorContext', 'requireOwnerOrSupervisor']],
  ['apps/web/src/app/api/owner/shift/open/route.ts', ['requireOpsActorContext', 'requireOwnerRole']],
  ['apps/web/src/app/api/owner/onboarding/guide/route.ts', ['requireOpsActorContext', 'requireOwnerRole']],
  ['apps/web/src/app/api/owner/recovery/close-session/route.ts', ['requireOpsActorContext', 'requireOwnerRole']],
  ['apps/web/src/app/api/owner/recovery/release-stale-locks/route.ts', ['requireOpsActorContext', 'requireOwnerRole']],
  ['apps/web/src/app/api/owner/recovery/state/route.ts', ['requireOpsActorContext', 'requireOwnerOrSupervisor']],
  ['apps/web/src/app/api/owner/shift/state/route.ts', ['requireOpsActorContext', 'requireOwnerOrSupervisor']],
  ['apps/web/src/app/api/owner/staff/create/route.ts', ['requireOpsActorContext', 'requireOwnerRole']],
  ['apps/web/src/app/api/owner/staff/list/route.ts', ['requireOpsActorContext', 'requireOwnerOrSupervisor']],
  ['apps/web/src/app/api/owner/staff/set-active/route.ts', ['requireOpsActorContext', 'requireOwnerRole']],
  ['apps/web/src/app/api/owner/staff/set-pin/route.ts', ['requireOpsActorContext', 'requireOwnerRole']],
  ['apps/web/src/app/api/owner/staff/set-status/route.ts', ['requireOpsActorContext', 'requireOwnerRole']],
]);

const actualRoutes = new Set([
  ...walk('apps/web/src/app/api/ops').filter((file) => file.endsWith('/route.ts')),
  ...walk('apps/web/src/app/api/owner').filter((file) => file.endsWith('/route.ts')),
].map((file) => file.replace(/\\/g, '/')));

for (const route of actualRoutes) {
  if (!expected.has(route)) {
    fail(`unexpected route missing from audit matrix: ${route}`);
  }
}

for (const [route, requiredMarkers] of expected.entries()) {
  if (!actualRoutes.has(route)) {
    fail(`expected audited route is missing: ${route}`);
  }
  const text = readFileSync(route, 'utf8');
  for (const marker of requiredMarkers) {
    if (!text.includes(marker)) {
      fail(`${route} is missing required marker ${marker}`);
    }
  }
}

if (existsSync('apps/web/src/app/api/platform/support/grant/route.ts')) {
  fail('legacy platform support grant route still exists');
}

console.log('ops-authz-coverage: ok');
