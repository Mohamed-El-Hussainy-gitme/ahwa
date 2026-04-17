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
  CustomerIntelligenceWorkspace,
  CustomerProfile,
  OwnerOnboardingGuide,
  ReportsWorkspace,
  StationCode,
  StationWorkspace,
  WaiterWorkspace,
  WaiterCatalogWorkspace,
  WaiterLiveWorkspace,
  ReadyItem,
} from './types';

import { apiGet, apiPost, clearApiRequestCache, invalidateApiRequestCacheByTags } from '@/lib/http/client';
import { buildBillingReceiptApiUrl, type BillingAllocationInput } from './billing';
import { invalidateOpsWorkspaces } from './invalidation';
import { OPS_CACHE_TAGS, uniqueTags } from './cache-tags';
import { READ_CACHE_TTL_MS, buildReadCache, withReadCache, type ReadCacheOverride } from './client-cache';
import { invalidateWorkspaceCacheByTags } from './workspace-cache';

const post = apiPost;
const get = apiGet;

const TAGS = {
  liveOps: [OPS_CACHE_TAGS.sessions, OPS_CACHE_TAGS.orders, OPS_CACHE_TAGS.waiterLive, OPS_CACHE_TAGS.ready, OPS_CACHE_TAGS.nav, OPS_CACHE_TAGS.dashboard, OPS_CACHE_TAGS.stations],
  billing: [OPS_CACHE_TAGS.billing, OPS_CACHE_TAGS.sessions, OPS_CACHE_TAGS.orders, OPS_CACHE_TAGS.nav, OPS_CACHE_TAGS.dashboard],
  customers: [OPS_CACHE_TAGS.customers, OPS_CACHE_TAGS.deferred, OPS_CACHE_TAGS.billing, OPS_CACHE_TAGS.ownerCustomerIntelligence],
  complaints: [OPS_CACHE_TAGS.complaints, OPS_CACHE_TAGS.orders, OPS_CACHE_TAGS.sessions, OPS_CACHE_TAGS.dashboard],
  menu: [OPS_CACHE_TAGS.menu, OPS_CACHE_TAGS.waiterCatalog],
  reports: [OPS_CACHE_TAGS.reports, OPS_CACHE_TAGS.billing, OPS_CACHE_TAGS.orders, OPS_CACHE_TAGS.complaints],
  ownerOnboarding: [OPS_CACHE_TAGS.ownerOnboarding],
} as const;

function clearReadCaches() {
  clearApiRequestCache();
  invalidateWorkspaceCacheByTags();
}

async function mutate<T>(request: Promise<T>, options: { invalidateTags?: readonly string[] } = {}): Promise<T> {
  const result = await request;
  const tags = uniqueTags(options.invalidateTags ?? []);
  if (!tags.length) {
    clearReadCaches();
    invalidateOpsWorkspaces();
    return result;
  }

  invalidateApiRequestCacheByTags(tags);
  invalidateWorkspaceCacheByTags(tags);
  invalidateOpsWorkspaces(tags);
  return result;
}

export const opsClient = {
  waiterWorkspace: (options?: ReadCacheOverride) => post<WaiterWorkspace>('/api/ops/workspaces/waiter', {}, { readCache: withReadCache(buildReadCache(READ_CACHE_TTL_MS.waiter, 'ops:waiter'), options) }),
  waiterCatalogWorkspace: (options?: ReadCacheOverride) => post<WaiterCatalogWorkspace>('/api/ops/workspaces/waiter-catalog', {}, { readCache: withReadCache(buildReadCache(READ_CACHE_TTL_MS.waiterCatalog, 'ops:waiter-catalog'), options) }),
  waiterLiveWorkspace: (options?: ReadCacheOverride) => post<WaiterLiveWorkspace>('/api/ops/workspaces/waiter-live', {}, { readCache: withReadCache(buildReadCache(READ_CACHE_TTL_MS.waiterLive, 'ops:waiter-live'), options) }),
  readyItems: (options?: ReadCacheOverride) => post<ReadyItem[]>('/api/ops/delivery/ready-list', {}, { readCache: withReadCache(buildReadCache(READ_CACHE_TTL_MS.readyItems, 'ops:ready-items'), options) }),
  dashboardWorkspace: (options?: ReadCacheOverride) => post<DashboardWorkspace>('/api/ops/workspaces/dashboard', {}, { readCache: withReadCache(buildReadCache(READ_CACHE_TTL_MS.dashboard, 'ops:dashboard'), options) }),
  navSummary: (options?: ReadCacheOverride) => post<OpsNavSummary>('/api/ops/workspaces/nav-summary', {}, { readCache: withReadCache(buildReadCache(READ_CACHE_TTL_MS.navSummary, 'ops:nav-summary'), options) }),
  stationWorkspace: (stationCode: StationCode, options?: ReadCacheOverride) =>
    post<StationWorkspace>('/api/ops/workspaces/station', { stationCode }, { readCache: withReadCache(buildReadCache(READ_CACHE_TTL_MS.station, `ops:station:${stationCode}`), options) }),
  billingWorkspace: (options?: ReadCacheOverride) => post<BillingWorkspace>('/api/ops/workspaces/billing', {}, { readCache: withReadCache(buildReadCache(READ_CACHE_TTL_MS.billing, 'ops:billing'), options) }),
  complaintsWorkspace: (options?: ReadCacheOverride) => post<ComplaintsWorkspace>('/api/ops/workspaces/complaints', {}, { readCache: withReadCache(buildReadCache(READ_CACHE_TTL_MS.complaints, 'ops:complaints'), options) }),
  menuWorkspace: (options?: ReadCacheOverride) => post<MenuWorkspace>('/api/ops/workspaces/menu', {}, { readCache: withReadCache(buildReadCache(READ_CACHE_TTL_MS.menu, 'ops:menu'), options) }),
  billingReceipt: (input: { paymentId?: string | null; sessionId?: string | null; allocations?: BillingAllocationInput[]; debtorName?: string | null }) => get<BillingReceipt>(buildBillingReceiptApiUrl(input), { readCache: buildReadCache(READ_CACHE_TTL_MS.receipt) }),
  reportsWorkspace: (input?: { startDate?: string; endDate?: string }, options?: ReadCacheOverride) =>
    post<ReportsWorkspace>('/api/ops/workspaces/reports', input ?? {}, { readCache: withReadCache(buildReadCache(READ_CACHE_TTL_MS.reports, `ops:reports:${input?.startDate ?? ''}:${input?.endDate ?? ''}`), options) }),
  deferredCustomersWorkspace: (options?: ReadCacheOverride) => post<{ items: DeferredCustomerSummary[] }>('/api/ops/workspaces/deferred-customers', {}, { readCache: withReadCache(buildReadCache(READ_CACHE_TTL_MS.deferredCustomers, 'ops:deferred-customers'), options) }),
  deferredCustomerLedger: (debtorName: string, options?: ReadCacheOverride) => post<DeferredCustomerLedgerWorkspace>('/api/ops/workspaces/deferred-customer-ledger', { debtorName }, { readCache: withReadCache(buildReadCache(READ_CACHE_TTL_MS.deferredLedger, `ops:deferred-ledger:${debtorName.trim()}`), options) }),
  customerLookupProfiles: (options?: ReadCacheOverride) => get<{ items: CustomerProfile[] }>('/api/ops/customer-profiles/lookup', { readCache: withReadCache(buildReadCache(READ_CACHE_TTL_MS.deferredCustomers, 'ops:customer-lookup'), options) }),
  ownerCustomerIntelligence: (customerId: string, options?: ReadCacheOverride) => get<{ workspace: CustomerIntelligenceWorkspace }>(`/api/owner/customers/${encodeURIComponent(customerId)}/intelligence`, { readCache: withReadCache(buildReadCache(READ_CACHE_TTL_MS.deferredLedger, `owner:customer-intelligence:${customerId}`), options) }),
  linkSessionCustomer: (input: { serviceSessionId: string; customerId: string }) => mutate(post<{ ok: true }>('/api/ops/sessions/customer-link', input), { invalidateTags: [...TAGS.customers, ...TAGS.liveOps, ...TAGS.billing] }),
  unlinkSessionCustomer: (serviceSessionId: string) => mutate(post<{ ok: true }>('/api/ops/sessions/customer-unlink', { serviceSessionId }), { invalidateTags: [...TAGS.customers, ...TAGS.liveOps, ...TAGS.billing] }),

  ownerOnboardingGuide: (options?: ReadCacheOverride) => get<OwnerOnboardingGuide>('/api/owner/onboarding/guide', { readCache: withReadCache(buildReadCache(READ_CACHE_TTL_MS.onboardingGuide, 'owner:onboarding-guide'), options) }),
  saveBillingSettings: (input: BillingExtrasSettings) => mutate(post<{ ok: true; settings: BillingExtrasSettings }>('/api/owner/billing-settings', input), { invalidateTags: [...TAGS.billing, ...TAGS.reports] }),
  openOrResumeSession: (label?: string) => mutate(post<{ sessionId: string; label: string }>('/api/ops/sessions/open-or-resume', { label }), { invalidateTags: TAGS.liveOps }),
  openAndCreateOrder: (input: { label?: string; notes?: string; items: Array<{ productId: string; quantity: number; notes?: string; addonIds?: string[] }>; }) => mutate(post<{ ok: true; orderId: string; sessionId: string; label: string }>('/api/ops/orders/open-and-create', input), { invalidateTags: [...TAGS.liveOps, ...TAGS.billing, ...TAGS.reports] }),
  createOrderWithItems: (input: { serviceSessionId: string; notes?: string; items: Array<{ productId: string; quantity: number; notes?: string; addonIds?: string[] }>; }) => mutate(post<{ ok: true; orderId: string }>('/api/ops/orders/create-with-items', input), { invalidateTags: [...TAGS.liveOps, ...TAGS.billing, ...TAGS.reports] }),
  markPartialReady: (orderItemId: string, quantity: number) => mutate(post<{ ok: true }>('/api/ops/fulfillment/partial-ready', { orderItemId, quantity }, { idempotency: { scope: 'ops.fulfillment.partial-ready' } }), { invalidateTags: TAGS.liveOps }),
  markReady: (orderItemId: string, quantity: number) => mutate(post<{ ok: true }>('/api/ops/fulfillment/ready', { orderItemId, quantity }, { idempotency: { scope: 'ops.fulfillment.ready' } }), { invalidateTags: TAGS.liveOps }),
  requestRemake: (orderItemId: string, quantity: number) => mutate(post<{ ok: true }>('/api/ops/fulfillment/remake', { orderItemId, quantity }, { idempotency: { scope: 'ops.fulfillment.remake' } }), { invalidateTags: TAGS.liveOps }),
  createComplaint: (input: { mode?: 'general' | 'item'; serviceSessionId?: string; orderItemId?: string; complaintKind?: 'quality_issue' | 'wrong_item' | 'delay' | 'billing_issue' | 'other'; quantity?: number; notes?: string; action?: 'none' | 'remake' | 'cancel_undelivered' | 'waive_delivered'; }) => mutate(post<{ ok: true; complaintId?: string; itemIssueId?: string }>('/api/ops/complaints/create', input), { invalidateTags: [...TAGS.complaints, ...TAGS.liveOps, ...TAGS.billing, ...TAGS.reports] }),
  resolveComplaint: (input: { complaintId: string; resolutionKind: 'resolved' | 'dismissed'; notes?: string; }) => mutate(post<{ ok: true }>('/api/ops/complaints/resolve', input), { invalidateTags: [...TAGS.complaints, ...TAGS.liveOps, ...TAGS.billing, ...TAGS.reports] }),
  updateItemIssueStatus: (input: { itemIssueId: string; status: 'applied' | 'verified' | 'dismissed'; notes?: string; }) => mutate(post<{ ok: true }>('/api/ops/complaints/item-issues/update', input), { invalidateTags: [...TAGS.complaints, ...TAGS.liveOps, ...TAGS.billing, ...TAGS.reports] }),
  deliver: (orderItemId: string, quantity: number) => mutate(post<{ ok: true }>('/api/ops/delivery/deliver', { orderItemId, quantity }, { idempotency: { scope: 'ops.delivery.deliver' } }), { invalidateTags: TAGS.liveOps }),
  settle: (allocations: Array<{ orderItemId: string; quantity: number }>) => mutate(post<{ ok: true; paymentId: string; receiptUrl: string; totals: BillingTotals }>('/api/ops/billing/settle', { allocations }, { idempotency: { scope: 'ops.billing.settle' } }), { invalidateTags: [...TAGS.billing, ...TAGS.liveOps, ...TAGS.reports] }),
  settleAndClose: (allocations: Array<{ orderItemId: string; quantity: number }>) => mutate(post<{ ok: true; sessionClosed: boolean; paymentId: string; receiptUrl: string; totals: BillingTotals }>('/api/ops/billing/settle-and-close', { allocations }, { idempotency: { scope: 'ops.billing.settle-and-close' } }), { invalidateTags: [...TAGS.billing, ...TAGS.liveOps, ...TAGS.reports] }),
  defer: (debtorName: string, allocations: Array<{ orderItemId: string; quantity: number }>, customerId?: string | null) => mutate(post<{ ok: true; paymentId: string; receiptUrl: string; totals: BillingTotals }>('/api/ops/billing/defer', { debtorName, allocations, customerId }, { idempotency: { scope: 'ops.billing.defer' } }), { invalidateTags: [...TAGS.billing, ...TAGS.liveOps, ...TAGS.customers, ...TAGS.reports] }),
  deferAndClose: (debtorName: string, allocations: Array<{ orderItemId: string; quantity: number }>, customerId?: string | null) => mutate(post<{ ok: true; sessionClosed: boolean; paymentId: string; receiptUrl: string; totals: BillingTotals }>('/api/ops/billing/defer-and-close', { debtorName, allocations, customerId }, { idempotency: { scope: 'ops.billing.defer-and-close' } }), { invalidateTags: [...TAGS.billing, ...TAGS.liveOps, ...TAGS.customers, ...TAGS.reports] }),
  repay: (debtorName: string, amount: number, notes?: string, customerId?: string | null) => mutate(post<{ ok: true }>('/api/ops/deferred/repay', { debtorName, amount, notes, customerId }, { idempotency: { scope: 'ops.deferred.repay' } }), { invalidateTags: [...TAGS.customers, ...TAGS.billing, ...TAGS.reports] }),
  addDeferredDebt: (debtorName: string, amount: number, notes?: string, customerId?: string | null) => mutate(post<{ ok: true }>('/api/ops/deferred/add-debt', { debtorName, amount, notes, customerId }, { idempotency: { scope: 'ops.deferred.add-debt' } }), { invalidateTags: [...TAGS.customers, ...TAGS.billing, ...TAGS.reports] }),
  closeSession: (serviceSessionId: string) => mutate(post<{ ok: true }>('/api/ops/sessions/close', { serviceSessionId }), { invalidateTags: [...TAGS.liveOps, ...TAGS.billing, ...TAGS.reports] }),
  createMenuSection: (input: { title: string; stationCode: StationCode; }) => mutate(post<{ sectionId: string }>('/api/ops/menu/sections/create', input), { invalidateTags: TAGS.menu }),
  toggleMenuSection: (sectionId: string, isActive: boolean) => mutate(post<{ ok: true }>('/api/ops/menu/sections/toggle', { sectionId, isActive }), { invalidateTags: TAGS.menu }),
  updateMenuSection: (input: { sectionId: string; title: string; stationCode: StationCode; }) => mutate(post<{ ok: true }>('/api/ops/menu/sections/update', input), { invalidateTags: TAGS.menu }),
  reorderMenuSections: (sectionIds: string[]) => mutate(post<{ ok: true }>('/api/ops/menu/sections/reorder', { sectionIds }), { invalidateTags: TAGS.menu }),
  deleteMenuSection: (sectionId: string) => mutate(post<{ ok: true; mode: 'deleted' | 'archived' }>('/api/ops/menu/sections/delete', { sectionId }), { invalidateTags: TAGS.menu }),
  createMenuProduct: (input: { sectionId: string; productName: string; stationCode: StationCode; unitPrice: number; }) => mutate(post<{ productId: string }>('/api/ops/menu/products/create', input), { invalidateTags: TAGS.menu }),
  toggleMenuProduct: (productId: string, isActive: boolean) => mutate(post<{ ok: true }>('/api/ops/menu/products/toggle', { productId, isActive }), { invalidateTags: TAGS.menu }),
  updateMenuProduct: (input: { productId: string; sectionId: string; productName: string; stationCode: StationCode; unitPrice: number; }) => mutate(post<{ ok: true }>('/api/ops/menu/products/update', input), { invalidateTags: TAGS.menu }),
  reorderMenuProducts: (sectionId: string, productIds: string[]) => mutate(post<{ ok: true }>('/api/ops/menu/products/reorder', { sectionId, productIds }), { invalidateTags: TAGS.menu }),
  deleteMenuProduct: (productId: string) => mutate(post<{ ok: true; mode: 'deleted' | 'archived' }>('/api/ops/menu/products/delete', { productId }), { invalidateTags: TAGS.menu }),
  createMenuAddon: (input: { addonName: string; stationCode: StationCode; unitPrice: number; productIds: string[]; }) => mutate(post<{ addonId: string }>('/api/ops/menu/addons/create', input), { invalidateTags: TAGS.menu }),
  updateMenuAddon: (input: { addonId: string; addonName: string; stationCode: StationCode; unitPrice: number; productIds: string[]; }) => mutate(post<{ ok: true }>('/api/ops/menu/addons/update', input), { invalidateTags: TAGS.menu }),
  toggleMenuAddon: (addonId: string, isActive: boolean) => mutate(post<{ ok: true }>('/api/ops/menu/addons/toggle', { addonId, isActive }), { invalidateTags: TAGS.menu }),
  deleteMenuAddon: (addonId: string) => mutate(post<{ ok: true; mode: 'deleted' | 'archived' }>('/api/ops/menu/addons/delete', { addonId }), { invalidateTags: TAGS.menu }),
};
