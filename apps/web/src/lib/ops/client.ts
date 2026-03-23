import type {
  BillingReceipt,
  BillingWorkspace,
  ComplaintsWorkspace,
  DashboardWorkspace,
  OpsNavSummary,
  DeferredCustomerLedgerWorkspace,
  DeferredCustomerSummary,
  MenuWorkspace,
  BillingExtrasSettings,
  BillingTotals,
  OwnerOnboardingGuide,
  ReportsWorkspace,
  StationCode,
  StationWorkspace,
  WaiterWorkspace,
} from './types';

import { apiGet, apiPost } from '@/lib/http/client';
import { invalidateOpsWorkspaces } from './invalidation';

const post = apiPost;
const get = apiGet;

async function mutate<T>(request: Promise<T>, options: { invalidate?: boolean } = {}): Promise<T> {
  const result = await request;
  if (options.invalidate) {
    invalidateOpsWorkspaces();
  }
  return result;
}

export const opsClient = {
  waiterWorkspace: () => post<WaiterWorkspace>('/api/ops/workspaces/waiter'),
  dashboardWorkspace: () => post<DashboardWorkspace>('/api/ops/workspaces/dashboard'),
  navSummary: () => post<OpsNavSummary>('/api/ops/workspaces/nav-summary'),
  stationWorkspace: (stationCode: StationCode) =>
    post<StationWorkspace>('/api/ops/workspaces/station', { stationCode }),
  billingWorkspace: () => post<BillingWorkspace>('/api/ops/workspaces/billing'),
  complaintsWorkspace: () => post<ComplaintsWorkspace>('/api/ops/workspaces/complaints'),
  menuWorkspace: () => post<MenuWorkspace>('/api/ops/workspaces/menu'),
  billingReceipt: (paymentId: string) => get<BillingReceipt>(`/api/ops/billing/receipt?paymentId=${encodeURIComponent(paymentId)}`),
  reportsWorkspace: () => post<ReportsWorkspace>('/api/ops/workspaces/reports'),
  deferredCustomersWorkspace: () =>
    post<{ items: DeferredCustomerSummary[] }>('/api/ops/workspaces/deferred-customers'),
  deferredCustomerLedger: (debtorName: string) =>
    post<DeferredCustomerLedgerWorkspace>('/api/ops/workspaces/deferred-customer-ledger', { debtorName }),

  ownerOnboardingGuide: () => get<OwnerOnboardingGuide>('/api/owner/onboarding/guide'),
  saveBillingSettings: (input: BillingExtrasSettings) => mutate(post<{ ok: true; settings: BillingExtrasSettings }>('/api/owner/billing-settings', input), { invalidate: true }),

  openOrResumeSession: (label?: string) =>
    mutate(post<{ sessionId: string; label: string }>('/api/ops/sessions/open-or-resume', { label })),

  openAndCreateOrder: (input: {
    label?: string;
    items: Array<{ productId: string; quantity: number }>;
  }) => mutate(post<{ ok: true; orderId: string; sessionId: string; label: string }>('/api/ops/orders/open-and-create', input)),

  createOrderWithItems: (input: {
    serviceSessionId: string;
    items: Array<{ productId: string; quantity: number }>;
  }) => mutate(post<{ ok: true; orderId: string }>('/api/ops/orders/create-with-items', input)),

  markPartialReady: (orderItemId: string, quantity: number) =>
    mutate(post<{ ok: true }>('/api/ops/fulfillment/partial-ready', { orderItemId, quantity }, {
      idempotency: { scope: 'ops.fulfillment.partial-ready' },
    })),

  markReady: (orderItemId: string, quantity: number) =>
    mutate(post<{ ok: true }>('/api/ops/fulfillment/ready', { orderItemId, quantity }, {
      idempotency: { scope: 'ops.fulfillment.ready' },
    })),

  requestRemake: (orderItemId: string, quantity: number) =>
    mutate(post<{ ok: true }>('/api/ops/fulfillment/remake', { orderItemId, quantity }, {
      idempotency: { scope: 'ops.fulfillment.remake' },
    })),

  createComplaint: (input: {
    mode?: 'general' | 'item';
    serviceSessionId?: string;
    orderItemId?: string;
    complaintKind?: 'quality_issue' | 'wrong_item' | 'delay' | 'billing_issue' | 'other';
    quantity?: number;
    notes?: string;
    action?: 'none' | 'remake' | 'cancel_undelivered' | 'waive_delivered';
  }) => mutate(post<{ ok: true; complaintId?: string; itemIssueId?: string }>('/api/ops/complaints/create', input), { invalidate: true }),

  resolveComplaint: (input: {
    complaintId: string;
    resolutionKind: 'resolved' | 'dismissed';
    notes?: string;
  }) => mutate(post<{ ok: true }>('/api/ops/complaints/resolve', input), { invalidate: true }),

  deliver: (orderItemId: string, quantity: number) =>
    mutate(post<{ ok: true }>('/api/ops/delivery/deliver', { orderItemId, quantity }, {
      idempotency: { scope: 'ops.delivery.deliver' },
    })),

  settle: (allocations: Array<{ orderItemId: string; quantity: number }>) =>
    mutate(post<{ ok: true; paymentId: string; receiptUrl: string; totals: BillingTotals }>('/api/ops/billing/settle', { allocations }, {
      idempotency: { scope: 'ops.billing.settle' },
    })),

  settleAndClose: (allocations: Array<{ orderItemId: string; quantity: number }>) =>
    mutate(post<{ ok: true; sessionClosed: boolean; paymentId: string; receiptUrl: string; totals: BillingTotals }>('/api/ops/billing/settle-and-close', { allocations }, {
      idempotency: { scope: 'ops.billing.settle-and-close' },
    })),

  defer: (debtorName: string, allocations: Array<{ orderItemId: string; quantity: number }>) =>
    mutate(post<{ ok: true; paymentId: string; receiptUrl: string; totals: BillingTotals }>('/api/ops/billing/defer', { debtorName, allocations }, {
      idempotency: { scope: 'ops.billing.defer' },
    })),

  deferAndClose: (debtorName: string, allocations: Array<{ orderItemId: string; quantity: number }>) =>
    mutate(post<{ ok: true; sessionClosed: boolean; paymentId: string; receiptUrl: string; totals: BillingTotals }>('/api/ops/billing/defer-and-close', { debtorName, allocations }, {
      idempotency: { scope: 'ops.billing.defer-and-close' },
    })),

  repay: (debtorName: string, amount: number, notes?: string) =>
    mutate(post<{ ok: true }>('/api/ops/deferred/repay', { debtorName, amount, notes }, {
      idempotency: { scope: 'ops.deferred.repay' },
    }), { invalidate: true }),

  addDeferredDebt: (debtorName: string, amount: number, notes?: string) =>
    mutate(post<{ ok: true }>('/api/ops/deferred/add-debt', { debtorName, amount, notes }, {
      idempotency: { scope: 'ops.deferred.add-debt' },
    }), { invalidate: true }),

  closeSession: (serviceSessionId: string) =>
    mutate(post<{ ok: true }>('/api/ops/sessions/close', { serviceSessionId })),

  createMenuSection: (input: {
    title: string;
    stationCode: StationCode;
  }) => mutate(post<{ sectionId: string }>('/api/ops/menu/sections/create', input), { invalidate: true }),

  toggleMenuSection: (sectionId: string, isActive: boolean) =>
    mutate(post<{ ok: true }>('/api/ops/menu/sections/toggle', { sectionId, isActive }), { invalidate: true }),

  updateMenuSection: (input: {
    sectionId: string;
    title: string;
    stationCode: StationCode;
  }) => mutate(post<{ ok: true }>('/api/ops/menu/sections/update', input), { invalidate: true }),

  reorderMenuSections: (sectionIds: string[]) =>
    mutate(post<{ ok: true }>('/api/ops/menu/sections/reorder', { sectionIds }), { invalidate: true }),

  deleteMenuSection: (sectionId: string) =>
    mutate(post<{ ok: true; mode: 'deleted' | 'archived' }>('/api/ops/menu/sections/delete', { sectionId }), { invalidate: true }),

  createMenuProduct: (input: {
    sectionId: string;
    productName: string;
    stationCode: StationCode;
    unitPrice: number;
  }) => mutate(post<{ productId: string }>('/api/ops/menu/products/create', input), { invalidate: true }),

  toggleMenuProduct: (productId: string, isActive: boolean) =>
    mutate(post<{ ok: true }>('/api/ops/menu/products/toggle', { productId, isActive }), { invalidate: true }),

  updateMenuProduct: (input: {
    productId: string;
    sectionId: string;
    productName: string;
    stationCode: StationCode;
    unitPrice: number;
  }) => mutate(post<{ ok: true }>('/api/ops/menu/products/update', input), { invalidate: true }),

  reorderMenuProducts: (sectionId: string, productIds: string[]) =>
    mutate(post<{ ok: true }>('/api/ops/menu/products/reorder', { sectionId, productIds }), { invalidate: true }),

  deleteMenuProduct: (productId: string) =>
    mutate(post<{ ok: true; mode: 'deleted' | 'archived' }>('/api/ops/menu/products/delete', { productId }), { invalidate: true }),
};
