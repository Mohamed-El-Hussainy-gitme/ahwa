export const OPS_CACHE_TAGS = {
  sessions: 'ops:sessions',
  orders: 'ops:orders',
  waiterCatalog: 'ops:waiter-catalog',
  waiterLive: 'ops:waiter-live',
  ready: 'ops:ready',
  dashboard: 'ops:dashboard',
  nav: 'ops:nav',
  stations: 'ops:stations',
  billing: 'ops:billing',
  complaints: 'ops:complaints',
  menu: 'ops:menu',
  reports: 'ops:reports',
  customers: 'ops:customers',
  deferred: 'ops:deferred',
  ownerCustomerIntelligence: 'owner:customer-intelligence',
  ownerOnboarding: 'owner:onboarding',
} as const;

export function uniqueTags(tags: readonly string[]) {
  return Array.from(new Set(tags.filter((value) => typeof value === 'string' && value.trim())));
}

export function hasIntersectingTags(expected?: readonly string[], incoming?: readonly string[]) {
  if (!expected?.length || !incoming?.length) {
    return false;
  }
  const incomingSet = new Set(incoming);
  return expected.some((tag) => incomingSet.has(tag));
}

export function getDefaultTagsForOpsCacheKey(cacheKey?: string | null): readonly string[] {
  const key = String(cacheKey ?? '').trim();
  if (!key) {
    return [];
  }
  if (key.startsWith('ops:waiter-catalog')) return [OPS_CACHE_TAGS.waiterCatalog, OPS_CACHE_TAGS.menu];
  if (key.startsWith('ops:waiter-live')) return [OPS_CACHE_TAGS.waiterLive, OPS_CACHE_TAGS.orders, OPS_CACHE_TAGS.sessions];
  if (key.startsWith('ops:waiter')) return [OPS_CACHE_TAGS.waiterLive, OPS_CACHE_TAGS.orders, OPS_CACHE_TAGS.sessions];
  if (key.startsWith('ops:ready-items')) return [OPS_CACHE_TAGS.ready, OPS_CACHE_TAGS.orders, OPS_CACHE_TAGS.sessions];
  if (key.startsWith('ops:dashboard')) return [OPS_CACHE_TAGS.dashboard, OPS_CACHE_TAGS.nav, OPS_CACHE_TAGS.orders, OPS_CACHE_TAGS.sessions, OPS_CACHE_TAGS.billing];
  if (key.startsWith('ops:nav-summary')) return [OPS_CACHE_TAGS.nav, OPS_CACHE_TAGS.orders, OPS_CACHE_TAGS.sessions, OPS_CACHE_TAGS.billing];
  if (key.startsWith('ops:station:')) return [OPS_CACHE_TAGS.stations, OPS_CACHE_TAGS.orders, OPS_CACHE_TAGS.sessions, OPS_CACHE_TAGS.ready];
  if (key.startsWith('ops:billing')) return [OPS_CACHE_TAGS.billing, OPS_CACHE_TAGS.sessions, OPS_CACHE_TAGS.orders, OPS_CACHE_TAGS.customers, OPS_CACHE_TAGS.deferred];
  if (key.startsWith('ops:complaints')) return [OPS_CACHE_TAGS.complaints, OPS_CACHE_TAGS.orders, OPS_CACHE_TAGS.sessions];
  if (key.startsWith('ops:menu')) return [OPS_CACHE_TAGS.menu, OPS_CACHE_TAGS.waiterCatalog];
  if (key.startsWith('ops:reports:')) return [OPS_CACHE_TAGS.reports, OPS_CACHE_TAGS.orders, OPS_CACHE_TAGS.billing, OPS_CACHE_TAGS.complaints];
  if (key.startsWith('ops:deferred-customers')) return [OPS_CACHE_TAGS.deferred, OPS_CACHE_TAGS.customers, OPS_CACHE_TAGS.billing];
  if (key.startsWith('ops:deferred-ledger:')) return [OPS_CACHE_TAGS.deferred, OPS_CACHE_TAGS.customers, OPS_CACHE_TAGS.billing];
  if (key.startsWith('ops:customer-lookup')) return [OPS_CACHE_TAGS.customers];
  if (key.startsWith('owner:customer-intelligence:')) return [OPS_CACHE_TAGS.ownerCustomerIntelligence, OPS_CACHE_TAGS.customers, OPS_CACHE_TAGS.billing, OPS_CACHE_TAGS.deferred];
  if (key.startsWith('owner:onboarding-guide')) return [OPS_CACHE_TAGS.ownerOnboarding];
  return [];
}
