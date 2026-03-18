import type {
  BillingWorkspace,
  ComplaintsWorkspace,
  DashboardWorkspace,
  DeferredCustomerLedgerWorkspace,
  DeferredCustomerSummary,
  MenuWorkspace,
  OpsNavSummary,
  OwnerOnboardingGuide,
  ReportsWorkspace,
  StationCode,
  StationWorkspace,
  WaiterWorkspace,
} from './types';

import { apiGet, apiPost } from '@/lib/http/client';
import { invalidateOpsWorkspaces } from './invalidation';
import {
  OPS_SCOPE_BILLING,
  OPS_SCOPE_COMPLAINTS,
  OPS_SCOPE_DASHBOARD,
  OPS_SCOPE_DEFERRED_CUSTOMERS,
  OPS_SCOPE_DEFERRED_LEDGER,
  OPS_SCOPE_MENU,
  OPS_SCOPE_NAV_SUMMARY,
  OPS_SCOPE_STATION_BARISTA,
  OPS_SCOPE_STATION_SHISHA,
  OPS_SCOPE_WAITER,
  type OpsWorkspaceScope,
} from './workspaceScopes';

const post = apiPost;
const get = apiGet;

type MutationOptions = {
  scopes?: OpsWorkspaceScope[];
  reason?: string;
};

type SubmitOrderInput = {
  serviceSessionId?: string;
  label?: string;
  items: Array<{ productId: string; quantity: number }>;
};

type SubmitOrderResult = {
  ok: true;
  orderId: string;
  sessionId: string;
  label: string;
  itemsCount: number;
};

type BillingMutationResult = {
  ok: true;
  paymentId: string;
  sessionId: string;
  totalAmount: number;
  totalQuantity: number;
  sessionClosed: boolean;
  sessionStatus: string;
  waitingQty: number;
  readyUndeliveredQty: number;
  billableQty: number;
};

type DeferredBillingMutationResult = BillingMutationResult & {
  debtorName: string;
};

async function mutate<T>(request: Promise<T>, options: MutationOptions = {}): Promise<T> {
  const result = await request;
  if (options.scopes?.length) {
    invalidateOpsWorkspaces(options.scopes, options.reason);
  }
  return result;
}

const WAITER_MENU_SCOPES: OpsWorkspaceScope[] = [OPS_SCOPE_WAITER, OPS_SCOPE_MENU];
const STATION_SCOPES: OpsWorkspaceScope[] = [OPS_SCOPE_STATION_BARISTA, OPS_SCOPE_STATION_SHISHA];
const LIVE_RUNTIME_SCOPES: OpsWorkspaceScope[] = [
  OPS_SCOPE_WAITER,
  OPS_SCOPE_BILLING,
  OPS_SCOPE_COMPLAINTS,
  OPS_SCOPE_DASHBOARD,
  OPS_SCOPE_NAV_SUMMARY,
];

export const opsClient = {
  waiterWorkspace: () => post<WaiterWorkspace>('/api/ops/workspaces/waiter'),
  dashboardWorkspace: () => post<DashboardWorkspace>('/api/ops/workspaces/dashboard'),
  navSummary: () => post<OpsNavSummary>('/api/ops/workspaces/nav-summary'),
  stationWorkspace: (stationCode: StationCode) =>
    post<StationWorkspace>('/api/ops/workspaces/station', { stationCode }),
  billingWorkspace: () => post<BillingWorkspace>('/api/ops/workspaces/billing'),
  complaintsWorkspace: () => post<ComplaintsWorkspace>('/api/ops/workspaces/complaints'),
  menuWorkspace: () => post<MenuWorkspace>('/api/ops/workspaces/menu'),
  reportsWorkspace: () => post<ReportsWorkspace>('/api/ops/workspaces/reports'),
  deferredCustomersWorkspace: () =>
    post<{ items: DeferredCustomerSummary[] }>('/api/ops/workspaces/deferred-customers'),
  deferredCustomerLedger: (debtorName: string) =>
    post<DeferredCustomerLedgerWorkspace>('/api/ops/workspaces/deferred-customer-ledger', { debtorName }),

  ownerOnboardingGuide: () => get<OwnerOnboardingGuide>('/api/owner/onboarding/guide'),

  openOrResumeSession: (label?: string) =>
    post<{ sessionId: string; label: string }>('/api/ops/sessions/open-or-resume', { label }),

  createOrderWithItems: (input: {
    serviceSessionId: string;
    items: Array<{ productId: string; quantity: number }>;
  }) => mutate(post<SubmitOrderResult>('/api/ops/orders/create-with-items', input, {
    idempotency: { scope: 'ops.orders.create-with-items' },
  }), {
    scopes: [...WAITER_MENU_SCOPES, ...STATION_SCOPES, OPS_SCOPE_COMPLAINTS, OPS_SCOPE_DASHBOARD, OPS_SCOPE_NAV_SUMMARY],
    reason: 'order.submitted',
  }),

  openSessionAndCreateOrder: (input: SubmitOrderInput) => mutate(post<SubmitOrderResult>('/api/ops/orders/open-and-create', input, {
    idempotency: { scope: 'ops.orders.open-and-create' },
  }), {
    scopes: [...WAITER_MENU_SCOPES, ...STATION_SCOPES, OPS_SCOPE_COMPLAINTS, OPS_SCOPE_DASHBOARD, OPS_SCOPE_NAV_SUMMARY],
    reason: 'order.submitted',
  }),

  markPartialReady: (orderItemId: string, quantity: number) =>
    mutate(post<{ ok: true }>('/api/ops/fulfillment/partial-ready', { orderItemId, quantity }, {
      idempotency: { scope: 'ops.fulfillment.partial-ready' },
    }), {
      scopes: [...STATION_SCOPES, OPS_SCOPE_WAITER, OPS_SCOPE_DASHBOARD, OPS_SCOPE_NAV_SUMMARY],
      reason: 'station.partial_ready',
    }),

  markReady: (orderItemId: string, quantity: number) =>
    mutate(post<{ ok: true }>('/api/ops/fulfillment/ready', { orderItemId, quantity }, {
      idempotency: { scope: 'ops.fulfillment.ready' },
    }), {
      scopes: [...STATION_SCOPES, OPS_SCOPE_WAITER, OPS_SCOPE_DASHBOARD, OPS_SCOPE_NAV_SUMMARY],
      reason: 'station.ready',
    }),

  requestRemake: (orderItemId: string, quantity: number) =>
    mutate(post<{ ok: true }>('/api/ops/fulfillment/remake', { orderItemId, quantity }, {
      idempotency: { scope: 'ops.fulfillment.remake' },
    }), {
      scopes: [...STATION_SCOPES, OPS_SCOPE_WAITER, OPS_SCOPE_COMPLAINTS, OPS_SCOPE_DASHBOARD, OPS_SCOPE_NAV_SUMMARY],
      reason: 'station.remake_requested',
    }),

  createComplaint: (input: {
    mode?: 'general' | 'item';
    serviceSessionId?: string;
    orderItemId?: string;
    complaintKind?: 'quality_issue' | 'wrong_item' | 'delay' | 'billing_issue' | 'other';
    quantity?: number;
    notes?: string;
    action?: 'none' | 'remake' | 'cancel_undelivered' | 'waive_delivered';
  }) => mutate(post<{ ok: true; complaintId?: string; itemIssueId?: string }>('/api/ops/complaints/create', input), {
    scopes: [OPS_SCOPE_COMPLAINTS, OPS_SCOPE_WAITER, OPS_SCOPE_BILLING, OPS_SCOPE_DASHBOARD, OPS_SCOPE_NAV_SUMMARY],
    reason: 'complaint.created',
  }),

  resolveComplaint: (input: {
    complaintId: string;
    resolutionKind: 'resolved' | 'dismissed';
    notes?: string;
  }) => mutate(post<{ ok: true }>('/api/ops/complaints/resolve', input), {
    scopes: [OPS_SCOPE_COMPLAINTS, OPS_SCOPE_WAITER, OPS_SCOPE_BILLING, OPS_SCOPE_DASHBOARD, OPS_SCOPE_NAV_SUMMARY],
    reason: 'complaint.updated',
  }),

  deliver: (orderItemId: string, quantity: number) =>
    mutate(post<{ ok: true }>('/api/ops/delivery/deliver', { orderItemId, quantity }, {
      idempotency: { scope: 'ops.delivery.deliver' },
    }), {
      scopes: [OPS_SCOPE_WAITER, OPS_SCOPE_BILLING, OPS_SCOPE_COMPLAINTS, OPS_SCOPE_DASHBOARD, OPS_SCOPE_NAV_SUMMARY],
      reason: 'delivery.delivered',
    }),

  settle: (allocations: Array<{ orderItemId: string; quantity: number }>) =>
    mutate(post<BillingMutationResult>('/api/ops/billing/settle-and-close', { allocations }, {
      idempotency: { scope: 'ops.billing.settle-and-close' },
    }), {
      scopes: LIVE_RUNTIME_SCOPES,
      reason: 'billing.settled',
    }),

  defer: (debtorName: string, allocations: Array<{ orderItemId: string; quantity: number }>) =>
    mutate(post<DeferredBillingMutationResult>('/api/ops/billing/defer-and-close', { debtorName, allocations }, {
      idempotency: { scope: 'ops.billing.defer-and-close' },
    }), {
      scopes: [...LIVE_RUNTIME_SCOPES, OPS_SCOPE_DEFERRED_CUSTOMERS, OPS_SCOPE_DEFERRED_LEDGER],
      reason: 'billing.deferred',
    }),

  repay: (debtorName: string, amount: number, notes?: string) =>
    mutate(post<{ ok: true }>('/api/ops/deferred/repay', { debtorName, amount, notes }, {
      idempotency: { scope: 'ops.deferred.repay' },
    }), {
      scopes: [OPS_SCOPE_DEFERRED_CUSTOMERS, OPS_SCOPE_DEFERRED_LEDGER, OPS_SCOPE_DASHBOARD, OPS_SCOPE_NAV_SUMMARY],
      reason: 'deferred.repaid',
    }),

  addDeferredDebt: (debtorName: string, amount: number, notes?: string) =>
    mutate(post<{ ok: true }>('/api/ops/deferred/add-debt', { debtorName, amount, notes }, {
      idempotency: { scope: 'ops.deferred.add-debt' },
    }), {
      scopes: [OPS_SCOPE_DEFERRED_CUSTOMERS, OPS_SCOPE_DEFERRED_LEDGER, OPS_SCOPE_DASHBOARD, OPS_SCOPE_NAV_SUMMARY],
      reason: 'deferred.debt_added',
    }),

  closeSession: (serviceSessionId: string) =>
    mutate(post<{ ok: true }>('/api/ops/sessions/close', { serviceSessionId }), {
      scopes: [OPS_SCOPE_WAITER, OPS_SCOPE_BILLING, OPS_SCOPE_COMPLAINTS, OPS_SCOPE_DASHBOARD, OPS_SCOPE_NAV_SUMMARY],
      reason: 'session.closed',
    }),

  createMenuSection: (input: {
    title: string;
    stationCode: StationCode;
  }) => mutate(post<{ sectionId: string }>('/api/ops/menu/sections/create', input), {
    scopes: WAITER_MENU_SCOPES,
    reason: 'menu.section_created',
  }),

  toggleMenuSection: (sectionId: string, isActive: boolean) =>
    mutate(post<{ ok: true }>('/api/ops/menu/sections/toggle', { sectionId, isActive }), {
      scopes: WAITER_MENU_SCOPES,
      reason: 'menu.section_toggled',
    }),

  updateMenuSection: (input: {
    sectionId: string;
    title: string;
    stationCode: StationCode;
  }) => mutate(post<{ ok: true }>('/api/ops/menu/sections/update', input), {
    scopes: WAITER_MENU_SCOPES,
    reason: 'menu.section_updated',
  }),

  reorderMenuSections: (sectionIds: string[]) =>
    mutate(post<{ ok: true }>('/api/ops/menu/sections/reorder', { sectionIds }), {
      scopes: WAITER_MENU_SCOPES,
      reason: 'menu.sections_reordered',
    }),

  deleteMenuSection: (sectionId: string) =>
    mutate(post<{ ok: true; mode: 'deleted' | 'archived' }>('/api/ops/menu/sections/delete', { sectionId }), {
      scopes: WAITER_MENU_SCOPES,
      reason: 'menu.section_deleted',
    }),

  createMenuProduct: (input: {
    sectionId: string;
    productName: string;
    stationCode: StationCode;
    unitPrice: number;
  }) => mutate(post<{ productId: string }>('/api/ops/menu/products/create', input), {
    scopes: WAITER_MENU_SCOPES,
    reason: 'menu.product_created',
  }),

  toggleMenuProduct: (productId: string, isActive: boolean) =>
    mutate(post<{ ok: true }>('/api/ops/menu/products/toggle', { productId, isActive }), {
      scopes: WAITER_MENU_SCOPES,
      reason: 'menu.product_toggled',
    }),

  updateMenuProduct: (input: {
    productId: string;
    sectionId: string;
    productName: string;
    stationCode: StationCode;
    unitPrice: number;
  }) => mutate(post<{ ok: true }>('/api/ops/menu/products/update', input), {
    scopes: WAITER_MENU_SCOPES,
    reason: 'menu.product_updated',
  }),

  reorderMenuProducts: (sectionId: string, productIds: string[]) =>
    mutate(post<{ ok: true }>('/api/ops/menu/products/reorder', { sectionId, productIds }), {
      scopes: WAITER_MENU_SCOPES,
      reason: 'menu.products_reordered',
    }),

  deleteMenuProduct: (productId: string) =>
    mutate(post<{ ok: true; mode: 'deleted' | 'archived' }>('/api/ops/menu/products/delete', { productId }), {
      scopes: WAITER_MENU_SCOPES,
      reason: 'menu.product_deleted',
    }),
};
