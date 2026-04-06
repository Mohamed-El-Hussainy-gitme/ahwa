import type { OpsRealtimeEvent, StationCode } from '@/lib/ops/types';

export const ORDERS_POLL_INTERVAL_MS = 4000;
export const SHISHA_POLL_INTERVAL_MS = 4000;
export const BILLING_POLL_INTERVAL_MS = 4500;
export const KITCHEN_POLL_INTERVAL_MS = 4000;
export const READY_POLL_INTERVAL_MS = 4000;
export const SUMMARY_POLL_INTERVAL_MS = 6000;

const WAITER_HARD_RELOAD_EVENT_TYPES = new Set([
  'shift.opened',
  'shift.closed',
  'session.opened',
  'session.resumed',
  'session.closed',
  'billing.settled',
  'billing.deferred',
  'complaint.updated',
  'item_issue.created',
  'menu.section_created',
  'menu.section_updated',
  'menu.section_toggled',
  'menu.section_deleted',
  'menu.section_archived',
  'menu.sections_reordered',
  'menu.product_created',
  'menu.product_updated',
  'menu.product_toggled',
  'menu.product_deleted',
  'menu.product_archived',
  'menu.products_reordered',
]);

const READY_HARD_RELOAD_EVENT_TYPES = new Set([
  'shift.opened',
  'shift.closed',
  'session.opened',
  'session.resumed',
  'session.closed',
  'billing.settled',
  'billing.deferred',
]);

const BILLING_RELOAD_EVENT_TYPES = new Set([
  'shift.opened',
  'shift.closed',
  'session.closed',
  'delivery.delivered',
  'billing.settled',
  'billing.deferred',
  'complaint.updated',
]);

const SUMMARY_PATCHABLE_EVENTS = new Set([
  'station.order_submitted',
  'station.ready',
  'delivery.delivered',
  'billing.settled',
  'billing.deferred',
  'session.opened',
  'session.resumed',
  'session.closed',
]);

function normalizeStationCode(value: unknown): StationCode | null {
  return value === 'barista' || value === 'shisha' ? value : null;
}

function hasScope(event: OpsRealtimeEvent, scope: string) {
  return Array.isArray(event.scopes) && event.scopes.includes(scope);
}

export function shouldReloadWaiterWorkspace(event: OpsRealtimeEvent) {
  if (event.type === 'station.ready' || event.type === 'delivery.delivered') {
    return false;
  }

  if (WAITER_HARD_RELOAD_EVENT_TYPES.has(event.type)) {
    return hasScope(event, 'waiter') || hasScope(event, 'dashboard') || hasScope(event, 'nav-summary');
  }

  return false;
}

export function shouldReloadReadyWorkspace(event: OpsRealtimeEvent) {
  if (event.type === 'station.ready' || event.type === 'delivery.delivered') {
    return false;
  }

  if (READY_HARD_RELOAD_EVENT_TYPES.has(event.type)) {
    return hasScope(event, 'waiter') || hasScope(event, 'dashboard') || hasScope(event, 'nav-summary');
  }

  return false;
}

export function shouldReloadBillingWorkspace(event: OpsRealtimeEvent) {
  return BILLING_RELOAD_EVENT_TYPES.has(event.type) && (hasScope(event, 'billing') || hasScope(event, 'dashboard') || hasScope(event, 'nav-summary'));
}

export function shouldReloadStationWorkspace(stationCode: StationCode, event: OpsRealtimeEvent) {
  if (event.type === 'shift.opened' || event.type === 'shift.closed') {
    return true;
  }

  if (event.type === 'station.ready') {
    return false;
  }

  if (event.type === 'station.order_submitted') {
    const eventStationCode = normalizeStationCode(event.data?.stationCode);
    return eventStationCode === stationCode && hasScope(event, stationCode);
  }

  return false;
}

export function shouldScheduleSummaryReload(event: OpsRealtimeEvent, isStale: boolean) {
  return !SUMMARY_PATCHABLE_EVENTS.has(event.type) || isStale;
}
