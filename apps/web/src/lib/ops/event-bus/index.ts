import 'server-only';
import { createInMemoryOpsEventBus } from './in-memory';
import { createRedisOpsEventBus } from './redis';
import { getOpsEventBusConfig } from './config';
import { OpsEventBusDegradedError } from './errors';
import {
  getOpsEventBusHealthSnapshot,
  isOpsEventBusCircuitOpen,
  recordOpsEventBusAttempt,
  recordOpsEventBusFailure,
  recordOpsEventBusSuccess,
} from './health';
import type { OpsEventBus, OpsEventBusSubscribeOptions } from './types';

const OPS_EVENT_BUS_KEY = '__ahwa_ops_event_bus_driver__';
const OPS_MEMORY_EVENT_BUS_KEY = '__ahwa_ops_event_bus_memory_driver__';
const OPS_REDIS_EVENT_BUS_KEY = '__ahwa_ops_event_bus_redis_driver__';

type GlobalOpsEventBusScope = typeof globalThis & {
  [OPS_EVENT_BUS_KEY]?: OpsEventBus;
  [OPS_MEMORY_EVENT_BUS_KEY]?: OpsEventBus;
  [OPS_REDIS_EVENT_BUS_KEY]?: OpsEventBus;
};

function getMemoryDriver(scope: GlobalOpsEventBusScope) {
  if (!scope[OPS_MEMORY_EVENT_BUS_KEY]) {
    scope[OPS_MEMORY_EVENT_BUS_KEY] = createInMemoryOpsEventBus();
  }
  return scope[OPS_MEMORY_EVENT_BUS_KEY] as OpsEventBus;
}

function getRedisDriver(scope: GlobalOpsEventBusScope) {
  if (!scope[OPS_REDIS_EVENT_BUS_KEY]) {
    scope[OPS_REDIS_EVENT_BUS_KEY] = createRedisOpsEventBus();
  }
  return scope[OPS_REDIS_EVENT_BUS_KEY] as OpsEventBus;
}

function shouldUseRedisForPublish() {
  const config = getOpsEventBusConfig();
  if (config.resolvedDriver !== 'redis') {
    return false;
  }
  if (!config.redis.valid) {
    return false;
  }
  return !isOpsEventBusCircuitOpen();
}

function assertRedisRealtimeAvailable() {
  const config = getOpsEventBusConfig();
  const health = getOpsEventBusHealthSnapshot();
  if (config.resolvedDriver !== 'redis') {
    return;
  }
  if (!config.redis.valid) {
    throw new OpsEventBusDegradedError(config.redis.error ?? 'Redis realtime configuration is invalid');
  }
  if (health.circuitOpen) {
    throw new OpsEventBusDegradedError(`Redis realtime circuit is open until ${health.circuitOpenUntil ?? 'later'}`);
  }
}

function withInstrumentedOptions(options: OpsEventBusSubscribeOptions): OpsEventBusSubscribeOptions {
  return {
    ...options,
    onError: (error) => {
      recordOpsEventBusFailure('redis', error);
      options.onError?.(error);
    },
  } satisfies OpsEventBusSubscribeOptions;
}

function createResilientOpsEventBus(scope: GlobalOpsEventBusScope): OpsEventBus {
  const memory = getMemoryDriver(scope);

  return {
    async publish(event) {
      if (!shouldUseRedisForPublish()) {
        recordOpsEventBusAttempt('memory');
        const published = await memory.publish(event);
        recordOpsEventBusSuccess('memory');
        return published;
      }

      const redis = getRedisDriver(scope);
      recordOpsEventBusAttempt('redis');
      try {
        const published = await redis.publish(event);
        recordOpsEventBusSuccess('redis');
        return published;
      } catch (error) {
        recordOpsEventBusFailure('redis', error);
        recordOpsEventBusAttempt('memory');
        const published = await memory.publish(event);
        recordOpsEventBusSuccess('memory');
        return published;
      }
    },
    async subscribe(options, listener) {
      assertRedisRealtimeAvailable();
      const config = getOpsEventBusConfig();
      if (config.resolvedDriver !== 'redis') {
        recordOpsEventBusAttempt('memory');
        const unsubscribe = await memory.subscribe(options, listener);
        recordOpsEventBusSuccess('memory');
        return unsubscribe;
      }

      const redis = getRedisDriver(scope);
      recordOpsEventBusAttempt('redis');
      try {
        const unsubscribe = await redis.subscribe(withInstrumentedOptions(options), listener);
        recordOpsEventBusSuccess('redis');
        return unsubscribe;
      } catch (error) {
        recordOpsEventBusFailure('redis', error);
        throw new OpsEventBusDegradedError(
          error instanceof Error ? error.message : 'Redis realtime subscription failed',
        );
      }
    },
  } satisfies OpsEventBus;
}

export function getOpsEventBus(): OpsEventBus {
  const scope = globalThis as GlobalOpsEventBusScope;
  if (!scope[OPS_EVENT_BUS_KEY]) {
    scope[OPS_EVENT_BUS_KEY] = createResilientOpsEventBus(scope);
  }
  return scope[OPS_EVENT_BUS_KEY] as OpsEventBus;
}
