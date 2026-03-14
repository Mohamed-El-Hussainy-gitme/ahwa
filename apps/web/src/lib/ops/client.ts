import type {
  BillingWorkspace,
  ComplaintsWorkspace,
  DashboardWorkspace,
  DeferredCustomerLedgerWorkspace,
  DeferredCustomerSummary,
  MenuWorkspace,
  ReportsWorkspace,
  StationCode,
  StationWorkspace,
  WaiterWorkspace,
} from './types';

import { apiPost } from '@/lib/http/client';

const post = apiPost;

export const opsClient = {
  waiterWorkspace: () => post<WaiterWorkspace>('/api/ops/workspaces/waiter'),
  dashboardWorkspace: () => post<DashboardWorkspace>('/api/ops/workspaces/dashboard'),
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

  openOrResumeSession: (label?: string) =>
    post<{ sessionId: string; label: string }>('/api/ops/sessions/open-or-resume', { label }),

  createOrderWithItems: (input: {
    serviceSessionId: string;
    items: Array<{ productId: string; quantity: number }>;
  }) => post<{ ok: true }>('/api/ops/orders/create-with-items', input),

  markPartialReady: (orderItemId: string, quantity: number) =>
    post<{ ok: true }>('/api/ops/fulfillment/partial-ready', { orderItemId, quantity }),

  markReady: (orderItemId: string, quantity: number) =>
    post<{ ok: true }>('/api/ops/fulfillment/ready', { orderItemId, quantity }),

  requestRemake: (orderItemId: string, quantity: number) =>
    post<{ ok: true }>('/api/ops/fulfillment/remake', { orderItemId, quantity }),

  createComplaint: (input: {
    serviceSessionId?: string;
    orderItemId?: string;
    complaintKind?: 'quality_issue' | 'wrong_item' | 'delay' | 'billing_issue' | 'other';
    quantity?: number;
    notes?: string;
    action?: 'none' | 'remake' | 'cancel_undelivered' | 'waive_delivered';
  }) => post<{ ok: true; complaintId: string }>('/api/ops/complaints/create', input),

  resolveComplaint: (input: {
    complaintId: string;
    resolutionKind: 'remake' | 'cancel_undelivered' | 'waive_delivered' | 'dismissed';
    quantity?: number;
    notes?: string;
  }) => post<{ ok: true }>('/api/ops/complaints/resolve', input),

  deliver: (orderItemId: string, quantity: number) =>
    post<{ ok: true }>('/api/ops/delivery/deliver', { orderItemId, quantity }),

  settle: (allocations: Array<{ orderItemId: string; quantity: number }>) =>
    post<{ ok: true }>('/api/ops/billing/settle', { allocations }),

  defer: (debtorName: string, allocations: Array<{ orderItemId: string; quantity: number }>) =>
    post<{ ok: true }>('/api/ops/billing/defer', { debtorName, allocations }),

  repay: (debtorName: string, amount: number) =>
    post<{ ok: true }>('/api/ops/deferred/repay', { debtorName, amount }),

  addDeferredDebt: (debtorName: string, amount: number, notes?: string) =>
    post<{ ok: true }>('/api/ops/deferred/add-debt', { debtorName, amount, notes }),

  closeSession: (serviceSessionId: string) =>
    post<{ ok: true }>('/api/ops/sessions/close', { serviceSessionId }),

  createMenuSection: (input: {
    title: string;
    stationCode: StationCode;
  }) => post<{ sectionId: string }>('/api/ops/menu/sections/create', input),

  toggleMenuSection: (sectionId: string, isActive: boolean) =>
    post<{ ok: true }>('/api/ops/menu/sections/toggle', { sectionId, isActive }),

  updateMenuSection: (input: {
    sectionId: string;
    title: string;
    stationCode: StationCode;
  }) => post<{ ok: true }>('/api/ops/menu/sections/update', input),

  reorderMenuSections: (sectionIds: string[]) =>
    post<{ ok: true }>('/api/ops/menu/sections/reorder', { sectionIds }),

  deleteMenuSection: (sectionId: string) =>
    post<{ ok: true; mode: 'deleted' | 'archived' }>('/api/ops/menu/sections/delete', { sectionId }),

  createMenuProduct: (input: {
    sectionId: string;
    productName: string;
    stationCode: StationCode;
    unitPrice: number;
  }) => post<{ productId: string }>('/api/ops/menu/products/create', input),

  toggleMenuProduct: (productId: string, isActive: boolean) =>
    post<{ ok: true }>('/api/ops/menu/products/toggle', { productId, isActive }),

  updateMenuProduct: (input: {
    productId: string;
    sectionId: string;
    productName: string;
    stationCode: StationCode;
    unitPrice: number;
  }) => post<{ ok: true }>('/api/ops/menu/products/update', input),

  reorderMenuProducts: (sectionId: string, productIds: string[]) =>
    post<{ ok: true }>('/api/ops/menu/products/reorder', { sectionId, productIds }),

  deleteMenuProduct: (productId: string) =>
    post<{ ok: true; mode: 'deleted' | 'archived' }>('/api/ops/menu/products/delete', { productId }),
};
