import type { OpsRealtimeEvent, StationCode } from './types';

function isStationCodeMatch(event: OpsRealtimeEvent, stationCode: StationCode) {
  return String(event.data?.stationCode ?? '') === stationCode;
}

function isAuthLifecycleEvent(event: OpsRealtimeEvent) {
  return event.type.startsWith('shift.') || event.type.startsWith('runtime.');
}

function isSessionLifecycleEvent(event: OpsRealtimeEvent) {
  return event.type.startsWith('session.');
}

function isBillingEvent(event: OpsRealtimeEvent) {
  return event.type.startsWith('billing.');
}

function isComplaintEvent(event: OpsRealtimeEvent) {
  return event.type.startsWith('complaint.') || event.type.startsWith('item_issue.');
}

function isMenuEvent(event: OpsRealtimeEvent) {
  return event.type.startsWith('menu.');
}

export function shouldReloadStationWorkspace(event: OpsRealtimeEvent, stationCode: StationCode) {
  if (isAuthLifecycleEvent(event) || isSessionLifecycleEvent(event)) {
    return true;
  }
  if (event.type === 'station.order_submitted' || event.type === 'station.ready') {
    return isStationCodeMatch(event, stationCode);
  }
  return false;
}

export function shouldReloadReadyWorkspace(event: OpsRealtimeEvent) {
  return isAuthLifecycleEvent(event)
    || isSessionLifecycleEvent(event)
    || event.type === 'station.ready'
    || event.type === 'delivery.delivered';
}

export function shouldReloadBillingWorkspace(event: OpsRealtimeEvent) {
  return isAuthLifecycleEvent(event)
    || isSessionLifecycleEvent(event)
    || isBillingEvent(event)
    || event.type === 'delivery.delivered';
}

export function shouldReloadWaiterLiveWorkspace(event: OpsRealtimeEvent) {
  return isAuthLifecycleEvent(event)
    || isSessionLifecycleEvent(event)
    || isBillingEvent(event)
    || isComplaintEvent(event)
    || event.type === 'station.order_submitted'
    || event.type === 'station.ready'
    || event.type === 'delivery.delivered';
}

export function shouldReloadWaiterCatalogWorkspace(event: OpsRealtimeEvent) {
  return isAuthLifecycleEvent(event) || isMenuEvent(event);
}
