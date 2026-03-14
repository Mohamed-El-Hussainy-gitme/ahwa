import type { ReadyItem, SessionOrderItem } from '@/lib/ops/types';

export function clampPositive(next: number, max: number) {
  return Math.max(1, Math.min(next, Math.max(1, max)));
}

export function sessionItemsForSession(items: SessionOrderItem[], sessionId: string, stationCode?: SessionOrderItem['stationCode']) {
  return items.filter((item) => item.serviceSessionId === sessionId && (!stationCode || item.stationCode === stationCode));
}

export function readyItemsForStation(items: ReadyItem[], stationCode?: ReadyItem['stationCode']) {
  return items.filter((item) => (!stationCode || item.stationCode === stationCode));
}
