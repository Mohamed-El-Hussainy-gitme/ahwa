import type { OpsRealtimeEvent } from './types';

type Listener = (event: OpsRealtimeEvent) => void;

type OpsEventBus = {
  listeners: Map<string, Listener>;
};

const OPS_BUS_KEY = '__ahwa_ops_event_bus__';

function getBus(): OpsEventBus {
  const globalScope = globalThis as typeof globalThis & {
    [OPS_BUS_KEY]?: OpsEventBus;
  };

  if (!globalScope[OPS_BUS_KEY]) {
    globalScope[OPS_BUS_KEY] = {
      listeners: new Map<string, Listener>(),
    };
  }

  return globalScope[OPS_BUS_KEY] as OpsEventBus;
}

export function publishOpsEvent(input: Omit<OpsRealtimeEvent, 'id' | 'at'> & Partial<Pick<OpsRealtimeEvent, 'id' | 'at'>>) {
  const bus = getBus();
  const event: OpsRealtimeEvent = {
    id: input.id ?? crypto.randomUUID(),
    at: input.at ?? new Date().toISOString(),
    type: input.type,
    cafeId: input.cafeId,
    shiftId: input.shiftId ?? null,
    entityId: input.entityId ?? null,
    data: input.data,
  };

  for (const listener of bus.listeners.values()) {
    listener(event);
  }

  return event;
}

export function subscribeOpsEvents(listener: Listener) {
  const bus = getBus();
  const id = crypto.randomUUID();
  bus.listeners.set(id, listener);
  return () => {
    bus.listeners.delete(id);
  };
}
