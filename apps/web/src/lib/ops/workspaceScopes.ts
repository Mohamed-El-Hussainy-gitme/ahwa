import type { OpsRealtimeEvent } from './types';

export const OPS_SCOPE_WAITER = 'waiter' as const;
export const OPS_SCOPE_STATION_BARISTA = 'station:barista' as const;
export const OPS_SCOPE_STATION_SHISHA = 'station:shisha' as const;
export const OPS_SCOPE_BILLING = 'billing' as const;
export const OPS_SCOPE_COMPLAINTS = 'complaints' as const;
export const OPS_SCOPE_MENU = 'menu' as const;
export const OPS_SCOPE_DASHBOARD = 'dashboard' as const;
export const OPS_SCOPE_NAV_SUMMARY = 'nav-summary' as const;
export const OPS_SCOPE_DEFERRED_CUSTOMERS = 'deferred-customers' as const;
export const OPS_SCOPE_DEFERRED_LEDGER = 'deferred-ledger' as const;
export const OPS_SCOPE_REPORTS = 'reports' as const;

export type OpsWorkspaceScope =
  | typeof OPS_SCOPE_WAITER
  | typeof OPS_SCOPE_STATION_BARISTA
  | typeof OPS_SCOPE_STATION_SHISHA
  | typeof OPS_SCOPE_BILLING
  | typeof OPS_SCOPE_COMPLAINTS
  | typeof OPS_SCOPE_MENU
  | typeof OPS_SCOPE_DASHBOARD
  | typeof OPS_SCOPE_NAV_SUMMARY
  | typeof OPS_SCOPE_DEFERRED_CUSTOMERS
  | typeof OPS_SCOPE_DEFERRED_LEDGER
  | typeof OPS_SCOPE_REPORTS;

export function matchesWorkspaceScopes(targetScopes: readonly OpsWorkspaceScope[], incomingScopes: readonly OpsWorkspaceScope[]) {
  if (!targetScopes.length || !incomingScopes.length) {
    return false;
  }

  return incomingScopes.some((scope) => targetScopes.includes(scope));
}

function stationScopes(): OpsWorkspaceScope[] {
  return [OPS_SCOPE_STATION_BARISTA, OPS_SCOPE_STATION_SHISHA];
}

function runtimeScopes(): OpsWorkspaceScope[] {
  return [
    OPS_SCOPE_WAITER,
    ...stationScopes(),
    OPS_SCOPE_BILLING,
    OPS_SCOPE_COMPLAINTS,
    OPS_SCOPE_DASHBOARD,
    OPS_SCOPE_NAV_SUMMARY,
  ];
}

export function scopesForRealtimeEvent(event: OpsRealtimeEvent): OpsWorkspaceScope[] {
  const stationCode = typeof event.data?.stationCode === 'string' ? event.data.stationCode : null;
  const stationScope: OpsWorkspaceScope[] = stationCode === 'shisha'
    ? [OPS_SCOPE_STATION_SHISHA]
    : stationCode === 'barista'
      ? [OPS_SCOPE_STATION_BARISTA]
      : stationScopes();

  switch (event.type) {
    case 'shift.opened':
    case 'shift.closed':
    case 'shift.snapshot_built':
      return [...runtimeScopes(), OPS_SCOPE_REPORTS];

    case 'order.submitted':
      return [OPS_SCOPE_WAITER, ...stationScopes(), OPS_SCOPE_COMPLAINTS, OPS_SCOPE_DASHBOARD, OPS_SCOPE_NAV_SUMMARY];

    case 'station.partial_ready':
    case 'station.ready':
      return [OPS_SCOPE_WAITER, ...stationScope, OPS_SCOPE_DASHBOARD, OPS_SCOPE_NAV_SUMMARY];

    case 'station.remake_requested':
    case 'station.cancelled':
      return [OPS_SCOPE_WAITER, ...stationScope, OPS_SCOPE_COMPLAINTS, OPS_SCOPE_DASHBOARD, OPS_SCOPE_NAV_SUMMARY];

    case 'delivery.delivered':
      return [OPS_SCOPE_WAITER, OPS_SCOPE_BILLING, OPS_SCOPE_COMPLAINTS, OPS_SCOPE_DASHBOARD, OPS_SCOPE_NAV_SUMMARY];

    case 'billing.settled':
      return [OPS_SCOPE_WAITER, OPS_SCOPE_BILLING, OPS_SCOPE_COMPLAINTS, OPS_SCOPE_DASHBOARD, OPS_SCOPE_NAV_SUMMARY];

    case 'billing.deferred':
      return [
        OPS_SCOPE_WAITER,
        OPS_SCOPE_BILLING,
        OPS_SCOPE_COMPLAINTS,
        OPS_SCOPE_DASHBOARD,
        OPS_SCOPE_NAV_SUMMARY,
        OPS_SCOPE_DEFERRED_CUSTOMERS,
        OPS_SCOPE_DEFERRED_LEDGER,
      ];

    case 'billing.waived':
      return [OPS_SCOPE_WAITER, OPS_SCOPE_BILLING, OPS_SCOPE_COMPLAINTS, OPS_SCOPE_DASHBOARD, OPS_SCOPE_NAV_SUMMARY];

    case 'complaint.created':
    case 'complaint.updated':
    case 'item_issue.created':
      return [OPS_SCOPE_COMPLAINTS, OPS_SCOPE_WAITER, OPS_SCOPE_BILLING, OPS_SCOPE_DASHBOARD, OPS_SCOPE_NAV_SUMMARY];

    case 'deferred.debt_added':
    case 'deferred.repaid':
      return [OPS_SCOPE_DEFERRED_CUSTOMERS, OPS_SCOPE_DEFERRED_LEDGER, OPS_SCOPE_DASHBOARD, OPS_SCOPE_NAV_SUMMARY];

    case 'session.closed':
    case 'recovery.session.closed':
      return [OPS_SCOPE_WAITER, OPS_SCOPE_BILLING, OPS_SCOPE_COMPLAINTS, OPS_SCOPE_DASHBOARD, OPS_SCOPE_NAV_SUMMARY];

    case 'menu.section_created':
    case 'menu.section_updated':
    case 'menu.section_toggled':
    case 'menu.section_deleted':
    case 'menu.section_archived':
    case 'menu.sections_reordered':
    case 'menu.product_created':
    case 'menu.product_updated':
    case 'menu.product_toggled':
    case 'menu.product_deleted':
    case 'menu.product_archived':
    case 'menu.products_reordered':
      return [OPS_SCOPE_MENU, OPS_SCOPE_WAITER];

    case 'runtime.staff.created':
    case 'runtime.staff.updated':
      return [OPS_SCOPE_DASHBOARD, OPS_SCOPE_NAV_SUMMARY];

    default:
      return runtimeScopes();
  }
}
