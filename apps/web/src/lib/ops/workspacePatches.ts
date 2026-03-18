import type {
  BillingWorkspace,
  OpsProduct,
  ReadyItem,
  SessionOrderItem,
  StationWorkspace,
  WaiterWorkspace,
} from './types';

function getSessionItemReadyBreakdown(item: SessionOrderItem) {
  const totalOriginalReady = Math.min(item.qtyReady, Math.max(item.qtyTotal - item.qtyCancelled, 0));
  const qtyReadyForNormalDelivery = Math.max(totalOriginalReady - item.qtyDelivered, 0);
  const qtyReadyForReplacementDelivery = Math.max(item.qtyReady - totalOriginalReady - item.qtyReplacementDelivered, 0);
  return {
    qtyReadyForNormalDelivery,
    qtyReadyForReplacementDelivery,
    qtyReadyForDelivery: qtyReadyForNormalDelivery + qtyReadyForReplacementDelivery,
  };
}

function normalizeSessionOrderItem(item: SessionOrderItem): SessionOrderItem {
  const breakdown = getSessionItemReadyBreakdown(item);
  return {
    ...item,
    qtyReadyForDelivery: breakdown.qtyReadyForDelivery,
    availableRemakeQty: Math.max(item.qtyDelivered + item.qtyReplacementDelivered - item.qtyRemade, 0),
  };
}

function buildReadyItems(sessionItems: SessionOrderItem[]): ReadyItem[] {
  return sessionItems
    .map((item) => {
      const breakdown = getSessionItemReadyBreakdown(item);
      if (breakdown.qtyReadyForDelivery <= 0) {
        return null;
      }
      return {
        orderItemId: item.orderItemId,
        serviceSessionId: item.serviceSessionId,
        sessionLabel: item.sessionLabel,
        productName: item.productName,
        stationCode: item.stationCode,
        qtyReadyForNormalDelivery: breakdown.qtyReadyForNormalDelivery,
        qtyReadyForReplacementDelivery: breakdown.qtyReadyForReplacementDelivery,
        qtyReadyForDelivery: breakdown.qtyReadyForDelivery,
      } satisfies ReadyItem;
    })
    .filter(Boolean) as ReadyItem[];
}

function buildSessionSummaries(workspace: WaiterWorkspace, sessionItems: SessionOrderItem[]) {
  const billableMap = new Map<string, number>();
  for (const item of sessionItems) {
    const qtyBillable = Math.max(item.qtyDelivered - item.qtyPaid - item.qtyDeferred - item.qtyWaived, 0);
    billableMap.set(item.serviceSessionId, (billableMap.get(item.serviceSessionId) ?? 0) + qtyBillable);
  }

  const readyMap = new Map<string, number>();
  for (const item of buildReadyItems(sessionItems)) {
    readyMap.set(item.serviceSessionId, (readyMap.get(item.serviceSessionId) ?? 0) + item.qtyReadyForDelivery);
  }

  return workspace.sessions.map((session) => ({
    ...session,
    billableCount: billableMap.get(session.id) ?? 0,
    readyCount: readyMap.get(session.id) ?? 0,
  }));
}

export function patchWaiterDelivered(workspace: WaiterWorkspace, orderItemId: string, requestedQuantity: number): WaiterWorkspace {
  const sessionItems = workspace.sessionItems.map((item) => {
    if (item.orderItemId !== orderItemId) {
      return item;
    }

    const breakdown = getSessionItemReadyBreakdown(item);
    const quantity = Math.min(Math.max(requestedQuantity, 0), breakdown.qtyReadyForDelivery);
    const normalDelivered = Math.min(quantity, breakdown.qtyReadyForNormalDelivery);
    const replacementDelivered = Math.min(quantity - normalDelivered, breakdown.qtyReadyForReplacementDelivery);

    return normalizeSessionOrderItem({
      ...item,
      qtyDelivered: item.qtyDelivered + normalDelivered,
      qtyReplacementDelivered: item.qtyReplacementDelivered + replacementDelivered,
    });
  });

  return {
    ...workspace,
    sessionItems,
    readyItems: buildReadyItems(sessionItems),
    sessions: buildSessionSummaries(workspace, sessionItems),
  };
}

export function patchWaiterReady(workspace: WaiterWorkspace, orderItemId: string, requestedQuantity: number): WaiterWorkspace {
  const sessionItems = workspace.sessionItems.map((item) => {
    if (item.orderItemId !== orderItemId) {
      return item;
    }
    return normalizeSessionOrderItem({
      ...item,
      qtyReady: item.qtyReady + Math.max(requestedQuantity, 0),
    });
  });

  return {
    ...workspace,
    sessionItems,
    readyItems: buildReadyItems(sessionItems),
    sessions: buildSessionSummaries(workspace, sessionItems),
  };
}

export function patchWaiterRemakeRequested(workspace: WaiterWorkspace, orderItemId: string, requestedQuantity: number): WaiterWorkspace {
  const sessionItems = workspace.sessionItems.map((item) => {
    if (item.orderItemId !== orderItemId) {
      return item;
    }
    return normalizeSessionOrderItem({
      ...item,
      qtyRemade: item.qtyRemade + Math.max(requestedQuantity, 0),
    });
  });

  return {
    ...workspace,
    sessionItems,
    readyItems: buildReadyItems(sessionItems),
    sessions: buildSessionSummaries(workspace, sessionItems),
  };
}

export function patchWaiterOrderSubmitted(
  workspace: WaiterWorkspace,
  input: {
    serviceSessionId: string;
    sessionLabel: string;
    items: Array<{ productId: string; quantity: number }>;
  },
): WaiterWorkspace {
  const productsById = new Map<string, OpsProduct>(workspace.products.map((product) => [product.id, product]));
  const nextSessionItems = [...workspace.sessionItems];
  const timestamp = Date.now();

  input.items.forEach((line, index) => {
    const product = productsById.get(line.productId);
    if (!product) {
      return;
    }

    nextSessionItems.push(normalizeSessionOrderItem({
      orderItemId: `temp:${input.serviceSessionId}:${line.productId}:${timestamp}:${index}`,
      serviceSessionId: input.serviceSessionId,
      sessionLabel: input.sessionLabel,
      productName: product.name,
      stationCode: product.stationCode,
      unitPrice: Number(product.unitPrice ?? 0),
      qtyTotal: line.quantity,
      qtyReady: 0,
      qtyDelivered: 0,
      qtyReplacementDelivered: 0,
      qtyPaid: 0,
      qtyDeferred: 0,
      qtyWaived: 0,
      qtyCancelled: 0,
      qtyRemade: 0,
      qtyReadyForDelivery: 0,
      availableRemakeQty: 0,
    }));
  });

  const hasSession = workspace.sessions.some((session) => session.id === input.serviceSessionId);
  const nextWorkspace: WaiterWorkspace = {
    ...workspace,
    sessions: hasSession
      ? workspace.sessions
      : [
          ...workspace.sessions,
          {
            id: input.serviceSessionId,
            label: input.sessionLabel,
            status: 'open',
            openedAt: new Date().toISOString(),
            billableCount: 0,
            readyCount: 0,
          },
        ],
    sessionItems: nextSessionItems,
  };

  return {
    ...nextWorkspace,
    readyItems: buildReadyItems(nextSessionItems),
    sessions: buildSessionSummaries(nextWorkspace, nextSessionItems),
  };
}

export function patchStationReady(workspace: StationWorkspace, orderItemId: string, requestedQuantity: number): StationWorkspace {
  const queue = workspace.queue
    .map((item) => {
      if (item.orderItemId !== orderItemId) {
        return item;
      }

      const quantity = Math.min(Math.max(requestedQuantity, 0), item.qtyWaiting);
      const consumeOriginal = Math.min(quantity, item.qtyWaitingOriginal);
      const consumeReplacement = Math.min(quantity - consumeOriginal, item.qtyWaitingReplacement);

      return {
        ...item,
        qtyWaitingOriginal: item.qtyWaitingOriginal - consumeOriginal,
        qtyWaitingReplacement: item.qtyWaitingReplacement - consumeReplacement,
        qtyWaiting: item.qtyWaiting - quantity,
        qtyReady: item.qtyReady + quantity,
      };
    })
    .filter((item) => item.qtyWaiting > 0);

  return {
    ...workspace,
    queue,
  };
}

export function patchStationRemakeRequested(
  workspace: StationWorkspace,
  input: {
    orderItemId: string;
    quantity: number;
    fallback?: Pick<SessionOrderItem, 'serviceSessionId' | 'sessionLabel' | 'productName' | 'stationCode' | 'qtyReady' | 'qtyDelivered' | 'qtyReplacementDelivered'>;
  },
): StationWorkspace {
  const existing = workspace.queue.find((item) => item.orderItemId === input.orderItemId);
  if (existing) {
    return {
      ...workspace,
      queue: workspace.queue.map((item) =>
        item.orderItemId !== input.orderItemId
          ? item
          : {
              ...item,
              qtyWaitingReplacement: item.qtyWaitingReplacement + input.quantity,
              qtyWaiting: item.qtyWaiting + input.quantity,
            }),
    };
  }

  if (!input.fallback) {
    return workspace;
  }

  return {
    ...workspace,
    queue: [
      ...workspace.queue,
      {
        orderItemId: input.orderItemId,
        serviceSessionId: input.fallback.serviceSessionId,
        sessionLabel: input.fallback.sessionLabel,
        productName: input.fallback.productName,
        stationCode: input.fallback.stationCode,
        qtyWaitingOriginal: 0,
        qtyWaitingReplacement: input.quantity,
        qtyWaiting: input.quantity,
        qtyReady: input.fallback.qtyReady,
        qtyDelivered: input.fallback.qtyDelivered,
        qtyReplacementDelivered: input.fallback.qtyReplacementDelivered,
        createdAt: new Date().toISOString(),
      },
    ],
  };
}

export function patchBillingSettlement(
  workspace: BillingWorkspace,
  input: {
    mode: 'settle' | 'defer';
    allocations: Array<{ orderItemId: string; quantity: number }>;
    debtorName?: string;
  },
): BillingWorkspace {
  const allocationMap = new Map<string, number>();
  input.allocations.forEach((line) => {
    if (line.quantity > 0) {
      allocationMap.set(line.orderItemId, (allocationMap.get(line.orderItemId) ?? 0) + line.quantity);
    }
  });

  const sessions = workspace.sessions
    .map((session) => {
      const items = session.items
        .map((item) => {
          const allocated = Math.min(allocationMap.get(item.orderItemId) ?? 0, item.qtyBillable);
          if (allocated <= 0) {
            return item;
          }
          return {
            ...item,
            qtyBillable: item.qtyBillable - allocated,
            qtyPaid: input.mode === 'settle' ? item.qtyPaid + allocated : item.qtyPaid,
            qtyDeferred: input.mode === 'defer' ? item.qtyDeferred + allocated : item.qtyDeferred,
          };
        })
        .filter((item) => item.qtyBillable > 0);

      const totalBillableQty = items.reduce((sum, item) => sum + item.qtyBillable, 0);
      const totalBillableAmount = items.reduce((sum, item) => sum + item.qtyBillable * item.unitPrice, 0);
      return {
        ...session,
        items,
        totalBillableQty,
        totalBillableAmount,
      };
    })
    .filter((session) => session.items.length > 0);

  const deferredNames = input.mode === 'defer' && input.debtorName?.trim()
    ? Array.from(new Set([...workspace.deferredNames, input.debtorName.trim()])).sort((left, right) => left.localeCompare(right, 'ar'))
    : workspace.deferredNames;

  return {
    ...workspace,
    sessions,
    deferredNames,
  };
}


export function rebindWaiterSession(
  workspace: WaiterWorkspace,
  input: {
    fromSessionId: string;
    toSessionId: string;
    sessionLabel: string;
  },
): WaiterWorkspace {
  if (!input.fromSessionId || input.fromSessionId === input.toSessionId) {
    return workspace;
  }

  const sessions = workspace.sessions.map((session) => (
    session.id !== input.fromSessionId
      ? session
      : {
          ...session,
          id: input.toSessionId,
          label: input.sessionLabel,
        }
  ));

  const sessionItems = workspace.sessionItems.map((item) => (
    item.serviceSessionId !== input.fromSessionId
      ? item
      : normalizeSessionOrderItem({
          ...item,
          serviceSessionId: input.toSessionId,
          sessionLabel: input.sessionLabel,
        })
  ));

  return {
    ...workspace,
    sessions,
    sessionItems,
    readyItems: buildReadyItems(sessionItems),
  };
}
