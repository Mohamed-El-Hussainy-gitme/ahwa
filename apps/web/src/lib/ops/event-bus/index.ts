import 'server-only';
import { createInMemoryOpsEventBus } from './in-memory';
import { createRedisOpsEventBus } from './redis';
import type { OpsEventBus } from './types';

const OPS_EVENT_BUS_KEY = '__ahwa_ops_event_bus_driver__';

type GlobalOpsEventBusScope = typeof globalThis & {
  [OPS_EVENT_BUS_KEY]?: OpsEventBus;
};

function resolveDriver() {
  const configured = String(process.env.AHWA_OPS_EVENT_BUS_DRIVER ?? 'auto').trim().toLowerCase();
  if (configured === 'memory' || configured === 'redis') {
    return configured;
  }
  return process.env.AHWA_OPS_EVENT_BUS_REDIS_URL ? 'redis' : 'memory';
}

export function getOpsEventBus(): OpsEventBus {
  const scope = globalThis as GlobalOpsEventBusScope;
  if (!scope[OPS_EVENT_BUS_KEY]) {
    scope[OPS_EVENT_BUS_KEY] = resolveDriver() === 'redis'
      ? createRedisOpsEventBus()
      : createInMemoryOpsEventBus();
  }
  return scope[OPS_EVENT_BUS_KEY] as OpsEventBus;
}
