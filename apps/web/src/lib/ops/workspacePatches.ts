import type { BillingWorkspace, ReadyItem, SessionOrderItem, StationQueueItem, StationWorkspace, WaiterLiveWorkspace, WaiterWorkspace } from './types';

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

export function appendOrTouchSession<T extends Pick<WaiterLiveWorkspace, 'sessions'>>(workspace: T | null, sessionId: string, label: string): T | null {
  if (!workspace) return workspace;
  const touchedAt = new Date().toISOString();
  const existing = workspace.sessions.find((session) => session.id === sessionId) ?? null;
  const rest = workspace.sessions.filter((session) => session.id !== sessionId);
  const nextSession = existing
    ? { ...existing, label: label || existing.label, openedAt: touchedAt }
    : { id: sessionId, label, status: 'open', openedAt: touchedAt, billableCount: 0, readyCount: 0 };
  return {
    ...workspace,
    sessions: [nextSession, ...rest],
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

export function applyReadyToWaiterWorkspace<T extends Pick<WaiterLiveWorkspace, 'readyItems' | 'sessionItems' | 'sessions'>>(workspace: T | null, item: StationQueueItem, quantity: number): T | null {
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

export function applyDeliverToWaiterWorkspace<T extends Pick<WaiterLiveWorkspace, 'readyItems' | 'sessionItems' | 'sessions'>>(workspace: T | null, orderItemId: string, quantity: number): T | null {
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
