import crypto from 'node:crypto';
import type { OpsRealtimeEvent } from '@/lib/ops/types';
import type { OpsEventBus, OpsEventBusListener, OpsEventBusSubscribeOptions } from './types';

type InMemoryCafeListeners = Map<string, OpsEventBusListener>;
type InMemoryBusState = Map<string, InMemoryCafeListeners>;

const OPS_MEMORY_BUS_KEY = '__ahwa_ops_event_bus_memory__';

function getMemoryBusState(): InMemoryBusState {
  const scope = globalThis as typeof globalThis & {
    [OPS_MEMORY_BUS_KEY]?: InMemoryBusState;
  };

  if (!scope[OPS_MEMORY_BUS_KEY]) {
    scope[OPS_MEMORY_BUS_KEY] = new Map<string, InMemoryCafeListeners>();
  }

  return scope[OPS_MEMORY_BUS_KEY] as InMemoryBusState;
}

function ensureCafeListeners(cafeId: string) {
  const bus = getMemoryBusState();
  const current = bus.get(cafeId) ?? new Map<string, OpsEventBusListener>();
  if (!bus.has(cafeId)) {
    bus.set(cafeId, current);
  }
  return current;
}

export function createInMemoryOpsEventBus(): OpsEventBus {
  return {
    async publish(event: OpsRealtimeEvent) {
      const listeners = ensureCafeListeners(event.cafeId);
      for (const listener of listeners.values()) {
        listener(event);
      }
      return event;
    },
    subscribe(options: OpsEventBusSubscribeOptions, listener: OpsEventBusListener) {
      const listeners = ensureCafeListeners(options.cafeId);
      const listenerId = crypto.randomUUID();
      listeners.set(listenerId, listener);

      const unsubscribe = () => {
        listeners.delete(listenerId);
        if (!listeners.size) {
          getMemoryBusState().delete(options.cafeId);
        }
      };

      options.signal?.addEventListener('abort', unsubscribe, { once: true });
      return unsubscribe;
    },
  } satisfies OpsEventBus;
}
