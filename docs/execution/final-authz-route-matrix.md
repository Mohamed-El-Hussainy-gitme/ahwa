# Final authz route matrix

هذا الملف هو المرجع النهائي لمسارات API التشغيلية والإدارية داخل القهوة بعد phase 8.

## Ops routes

### Billing / deferred
- `ops/billing/billable` -> `requireBillingAccess`
- `ops/billing/defer` -> `requireBillingAccess`
- `ops/billing/settle` -> `requireBillingAccess`
- `ops/deferred/*` -> `requireDeferredAccess`

### Complaints / remake
- `ops/complaints/create` -> `requireComplaintsAccess`
- `ops/complaints/resolve` -> `requireComplaintsAccess`
- `ops/fulfillment/remake` -> `requireComplaintsAccess`

### Sessions / orders / delivery
- `ops/sessions/open-or-resume` -> `requireSessionOrderAccess`
- `ops/orders/create-with-items` -> `requireSessionOrderAccess`
- `ops/delivery/deliver` -> `requireDeliveryAccess`
- `ops/delivery/ready-list` -> `requireWaiterWorkspaceAccess`

### Station execution
- `ops/fulfillment/ready` -> `requireStationAccess`
- `ops/fulfillment/partial-ready` -> `requireStationAccess`
- `ops/workspaces/station` -> `requireStationAccess`

### Read workspaces
- `ops/workspaces/billing` -> `requireBillingAccess`
- `ops/workspaces/complaints` -> `requireComplaintsAccess`
- `ops/workspaces/dashboard` -> `requireOwnerOrSupervisor`
- `ops/workspaces/deferred-*` -> `requireDeferredAccess`
- `ops/workspaces/menu` -> `requireOwnerRole`
- `ops/workspaces/reports` -> `requireReportsAccess`
- `ops/workspaces/waiter` -> `requireWaiterWorkspaceAccess`

### Menu mutation
- `ops/menu/sections/*` -> `requireOwnerRole`
- `ops/menu/products/*` -> `requireOwnerRole`

## Owner routes
- `owner/shift/open` -> `requireOwnerRole`
- `owner/shift/close` -> `requireOwnerRole`
- `owner/shift/close-snapshot` -> `requireOwnerOrSupervisor`
- `owner/shift/history` -> `requireOwnerOrSupervisor`
- `owner/shift/state` -> `requireOwnerOrSupervisor`
- `owner/staff/create` -> `requireOwnerRole`
- `owner/staff/list` -> `requireOwnerOrSupervisor`
- `owner/staff/set-active` -> `requireOwnerRole`
- `owner/staff/set-pin` -> `requireOwnerRole`

## Platform route boundary
- `platform/support/grant` removed in phase 8.
- Cross-tenant support grants are no longer part of the canonical access model.
- Super admin stays inside platform administration routes and no longer opens tenant data through support grants.
