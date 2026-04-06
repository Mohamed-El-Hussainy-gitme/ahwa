import type { BillingWorkspace, OpsRealtimeEvent, ReadyItem, SessionOrderItem, StationQueueItem, StationWorkspace, WaiterWorkspace } from './types';

function clamp(value: number) {
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

function buildReadyItemFromSessionItem(item: SessionOrderItem): ReadyItem {
  return {
    orderItemId: item.orderItemId,
    serviceSessionId: item.serviceSessionId,
    sessionLabel: item.sessionLabel,
    productName: item.productName,
    stationCode: item.stationCode,
    qtyReadyForNormalDelivery: 0,
    qtyReadyForReplacementDelivery: 0,
    qtyReadyForDelivery: 0,
  };
}

export function appendOrTouchSession(workspace: WaiterWorkspace | null, sessionId: string, label: string): WaiterWorkspace | null {
  if (!workspace) return workspace;
  const exists = workspace.sessions.some((session) => session.id === sessionId);
  if (exists) {
    return workspace;
  }
  return {
    ...workspace,
    sessions: [{ id: sessionId, label, status: 'open', openedAt: new Date().toISOString(), billableCount: 0, readyCount: 0 }, ...workspace.sessions],
  };
}

export function applyReadyToStationWorkspace(workspace: StationWorkspace | null, item: StationQueueItem, quantity: number): StationWorkspace | null {
  if (!workspace) return workspace;
  const qty = clamp(quantity);
  if (!qty) return workspace;
  return {
    ...workspace,
    queue: workspace.queue
      .map((entry) => {
        if (entry.orderItemId !== item.orderItemId) return entry;
        const replacementTaken = Math.min(entry.qtyWaitingReplacement, qty);
        const originalTaken = Math.min(entry.qtyWaitingOriginal, qty - replacementTaken);
        const qtyWaitingReplacement = Math.max(entry.qtyWaitingReplacement - replacementTaken, 0);
        const qtyWaitingOriginal = Math.max(entry.qtyWaitingOriginal - originalTaken, 0);
        const qtyWaiting = Math.max(entry.qtyWaiting - qty, 0);
        return {
          ...entry,
          qtyWaitingReplacement,
          qtyWaitingOriginal,
          qtyWaiting,
          qtyReady: entry.qtyReady + qty,
        };
      })
      .filter((entry) => entry.qtyWaiting > 0),
  };
}

export function applyReadyToWaiterWorkspace(workspace: WaiterWorkspace | null, item: StationQueueItem, quantity: number): WaiterWorkspace | null {
  if (!workspace) return workspace;
  const qty = clamp(quantity);
  if (!qty) return workspace;
  const replacementTaken = Math.min(item.qtyWaitingReplacement, qty);
  const normalTaken = Math.min(item.qtyWaitingOriginal, qty - replacementTaken);

  let readyItems = workspace.readyItems.map((ready) => {
    if (ready.orderItemId !== item.orderItemId) return ready;
    return {
      ...ready,
      qtyReadyForNormalDelivery: ready.qtyReadyForNormalDelivery + normalTaken,
      qtyReadyForReplacementDelivery: ready.qtyReadyForReplacementDelivery + replacementTaken,
      qtyReadyForDelivery: ready.qtyReadyForDelivery + qty,
    };
  });

  if (!readyItems.some((ready) => ready.orderItemId === item.orderItemId)) {
    readyItems = [
      {
        orderItemId: item.orderItemId,
        serviceSessionId: item.serviceSessionId,
        sessionLabel: item.sessionLabel,
        productName: item.productName,
        stationCode: item.stationCode,
        qtyReadyForNormalDelivery: normalTaken,
        qtyReadyForReplacementDelivery: replacementTaken,
        qtyReadyForDelivery: qty,
      },
      ...readyItems,
    ];
  }

  return {
    ...workspace,
    readyItems,
    sessionItems: workspace.sessionItems.map((entry) =>
      entry.orderItemId === item.orderItemId
        ? {
            ...entry,
            qtyReady: entry.qtyReady + qty,
            qtyReadyForDelivery: entry.qtyReadyForDelivery + qty,
          }
        : entry,
    ),
    sessions: workspace.sessions.map((session) =>
      session.id === item.serviceSessionId
        ? { ...session, readyCount: session.readyCount + qty }
        : session,
    ),
  };
}

export function applyDeliverToWaiterWorkspace(workspace: WaiterWorkspace | null, orderItemId: string, quantity: number): WaiterWorkspace | null {
  if (!workspace) return workspace;
  const qty = clamp(quantity);
  if (!qty) return workspace;

  const readyItem = workspace.readyItems.find((entry) => entry.orderItemId === orderItemId) ?? null;
  const replacementTaken = readyItem ? Math.min(readyItem.qtyReadyForReplacementDelivery, qty) : 0;
  const normalTaken = Math.max(qty - replacementTaken, 0);

  return {
    ...workspace,
    readyItems: workspace.readyItems
      .map((entry) => {
        if (entry.orderItemId !== orderItemId) return entry;
        return {
          ...entry,
          qtyReadyForReplacementDelivery: Math.max(entry.qtyReadyForReplacementDelivery - replacementTaken, 0),
          qtyReadyForNormalDelivery: Math.max(entry.qtyReadyForNormalDelivery - normalTaken, 0),
          qtyReadyForDelivery: Math.max(entry.qtyReadyForDelivery - qty, 0),
        };
      })
      .filter((entry) => entry.qtyReadyForDelivery > 0),
    sessionItems: workspace.sessionItems.map((entry) =>
      entry.orderItemId === orderItemId
        ? {
            ...entry,
            qtyReady: Math.max(entry.qtyReady - qty, 0),
            qtyReadyForDelivery: Math.max(entry.qtyReadyForDelivery - qty, 0),
            qtyDelivered: entry.qtyDelivered + normalTaken,
            qtyReplacementDelivered: entry.qtyReplacementDelivered + replacementTaken,
          }
        : entry,
    ),
    sessions: workspace.sessions.map((session) => {
      const item = workspace.sessionItems.find((entry) => entry.orderItemId === orderItemId && entry.serviceSessionId === session.id);
      return item
        ? { ...session, readyCount: Math.max(session.readyCount - qty, 0), billableCount: session.billableCount + qty }
        : session;
    }),
  };
}

export function applyBillingToWorkspace(
  workspace: BillingWorkspace | null,
  serviceSessionId: string,
  allocations: Array<{ orderItemId: string; quantity: number }>,
  mode: 'settle' | 'defer',
): BillingWorkspace | null {
  if (!workspace) return workspace;
  const byId = new Map(allocations.map((entry) => [entry.orderItemId, clamp(entry.quantity)]));
  return {
    ...workspace,
    sessions: workspace.sessions
      .map((session) => {
        if (session.sessionId !== serviceSessionId) return session;
        const items = session.items
          .map((item) => {
            const qty = byId.get(item.orderItemId) ?? 0;
            if (!qty) return item;
            return {
              ...item,
              qtyBillable: Math.max(item.qtyBillable - qty, 0),
              qtyPaid: mode === 'settle' ? item.qtyPaid + qty : item.qtyPaid,
              qtyDeferred: mode === 'defer' ? item.qtyDeferred + qty : item.qtyDeferred,
            };
          })
          .filter((item) => item.qtyBillable > 0);
        const totalBillableQty = items.reduce((sum, item) => sum + item.qtyBillable, 0);
        const totalBillableAmount = items.reduce((sum, item) => sum + item.qtyBillable * Number(item.unitPrice ?? 0), 0);
        return { ...session, items, totalBillableQty, totalBillableAmount };
      })
      .filter((session) => session.items.length > 0),
  };
}

export function applyRealtimeEventToStationWorkspace(workspace: StationWorkspace | null, event: OpsRealtimeEvent): StationWorkspace | null {
  if (!workspace) return workspace;
  if (event.type !== 'station.ready') return workspace;
  const stationCode = event.data?.stationCode;
  if (stationCode !== workspace.stationCode) return workspace;
  const orderItemId = String(event.entityId ?? '').trim();
  const quantity = clamp(Number(event.data?.quantity ?? 0));
  if (!orderItemId || !quantity) return workspace;
  const existing = workspace.queue.find((entry) => entry.orderItemId === orderItemId);
  if (!existing) return workspace;
  return applyReadyToStationWorkspace(workspace, existing, quantity);
}

export function applyRealtimeEventToWaiterWorkspace(workspace: WaiterWorkspace | null, event: OpsRealtimeEvent): WaiterWorkspace | null {
  if (!workspace) return workspace;

  if (event.type === 'station.ready') {
    const orderItemId = String(event.entityId ?? '').trim();
    const quantity = clamp(Number(event.data?.quantity ?? 0));
    if (!orderItemId || !quantity) return workspace;
    const item = workspace.sessionItems.find((entry) => entry.orderItemId === orderItemId);
    if (!item) return workspace;
    const syntheticQueueItem: StationQueueItem = {
      orderItemId: item.orderItemId,
      serviceSessionId: item.serviceSessionId,
      sessionLabel: item.sessionLabel,
      productName: item.productName,
      stationCode: item.stationCode,
      qtyWaitingOriginal: Math.max(item.qtyTotal - item.qtyReady - item.qtyDelivered - item.qtyReplacementDelivered - item.qtyCancelled - item.qtyWaived, 0),
      qtyWaitingReplacement: Math.max(item.qtyRemade - item.qtyReplacementDelivered - item.qtyReadyForDelivery, 0),
      qtyWaiting: Math.max(item.qtyTotal - item.qtyReady - item.qtyDelivered - item.qtyReplacementDelivered - item.qtyCancelled - item.qtyWaived, 0),
      qtyReady: item.qtyReady,
      qtyDelivered: item.qtyDelivered + item.qtyReplacementDelivered,
      qtyReplacementDelivered: item.qtyReplacementDelivered,
      createdAt: new Date().toISOString(),
    };
    return applyReadyToWaiterWorkspace(workspace, syntheticQueueItem, quantity);
  }

  if (event.type === 'delivery.delivered') {
    const orderItemId = String(event.entityId ?? '').trim();
    const quantity = clamp(Number(event.data?.quantity ?? event.data?.deliveredQty ?? 0));
    if (!orderItemId || !quantity) return workspace;
    return applyDeliverToWaiterWorkspace(workspace, orderItemId, quantity);
  }

  return workspace;
}
