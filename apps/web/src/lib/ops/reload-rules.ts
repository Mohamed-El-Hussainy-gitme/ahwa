import type { OpsRealtimeEvent, StationCode } from '@/lib/ops/types';

export const ORDERS_POLL_INTERVAL_MS = 3200;
export const SHISHA_POLL_INTERVAL_MS = 3200;
export const BILLING_POLL_INTERVAL_MS = 3800;
export const KITCHEN_POLL_INTERVAL_MS = 3200;
export const READY_POLL_INTERVAL_MS = 3200;
export const SUMMARY_POLL_INTERVAL_MS = 5000;

export type RealtimeReloadDirective =
  | boolean
  | {
      reload?: 'none' | 'background' | 'immediate';
      debounceMs?: number;
      burstMs?: number;
      fastPollIntervalMs?: number;
      onlyIfStale?: boolean;
    };

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

const IMMEDIATE_TRANSITION: RealtimeReloadDirective = {
  reload: 'immediate',
  debounceMs: 0,
  burstMs: 5_000,
  fastPollIntervalMs: 900,
};

const FAST_BACKGROUND_TRANSITION: RealtimeReloadDirective = {
  reload: 'background',
  debounceMs: 80,
  burstMs: 4_500,
  fastPollIntervalMs: 1_100,
};

const STALE_BACKGROUND_RELOAD: RealtimeReloadDirective = {
  reload: 'background',
  debounceMs: 140,
  onlyIfStale: true,
};

function normalizeStationCode(value: unknown): StationCode | null {
  return value === 'barista' || value === 'shisha' ? value : null;
}

function hasScope(event: OpsRealtimeEvent, scope: string) {
  return Array.isArray(event.scopes) && event.scopes.includes(scope);
}

export function shouldReloadWaiterWorkspace(event: OpsRealtimeEvent): RealtimeReloadDirective {
  if (event.type === 'station.ready' || event.type === 'delivery.delivered') {
    return IMMEDIATE_TRANSITION;
  }

  if (WAITER_HARD_RELOAD_EVENT_TYPES.has(event.type)) {
    return hasScope(event, 'waiter') || hasScope(event, 'dashboard') || hasScope(event, 'nav-summary')
      ? STALE_BACKGROUND_RELOAD
      : false;
  }

  return false;
}

export function shouldReloadReadyWorkspace(event: OpsRealtimeEvent): RealtimeReloadDirective {
  if (event.type === 'station.ready' || event.type === 'delivery.delivered') {
    return IMMEDIATE_TRANSITION;
  }

  if (READY_HARD_RELOAD_EVENT_TYPES.has(event.type)) {
    return hasScope(event, 'waiter') || hasScope(event, 'dashboard') || hasScope(event, 'nav-summary')
      ? STALE_BACKGROUND_RELOAD
      : false;
  }

  return false;
}

export function shouldReloadBillingWorkspace(event: OpsRealtimeEvent): RealtimeReloadDirective {
  if (!BILLING_RELOAD_EVENT_TYPES.has(event.type)) {
    return false;
  }

  if (!(hasScope(event, 'billing') || hasScope(event, 'dashboard') || hasScope(event, 'nav-summary'))) {
    return false;
  }

  if (event.type === 'delivery.delivered') {
    return {
      reload: 'immediate',
      debounceMs: 0,
      burstMs: 5_500,
      fastPollIntervalMs: 1_000,
    };
  }

  if (event.type === 'billing.settled' || event.type === 'billing.deferred') {
    return FAST_BACKGROUND_TRANSITION;
  }

  return STALE_BACKGROUND_RELOAD;
}

export function shouldReloadStationWorkspace(stationCode: StationCode, event: OpsRealtimeEvent): RealtimeReloadDirective {
  if (event.type === 'shift.opened' || event.type === 'shift.closed') {
    return STALE_BACKGROUND_RELOAD;
  }

  if (event.type === 'station.ready') {
    return false;
  }

  if (event.type === 'station.order_submitted') {
    const eventStationCode = normalizeStationCode(event.data?.stationCode);
    return eventStationCode === stationCode && hasScope(event, stationCode)
      ? {
          reload: 'immediate',
          debounceMs: 0,
          burstMs: 6_000,
          fastPollIntervalMs: 800,
        }
      : false;
  }

  return false;
}

export function shouldScheduleSummaryReload(event: OpsRealtimeEvent, isStale: boolean) {
  return !SUMMARY_PATCHABLE_EVENTS.has(event.type) || isStale;
}
