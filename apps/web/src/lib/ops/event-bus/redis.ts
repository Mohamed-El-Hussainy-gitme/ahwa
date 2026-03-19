import 'server-only';
import Redis from 'ioredis';
import type { OpsRealtimeEvent } from '@/lib/ops/types';
import { getOpsEventStreamName, normalizeOpsRealtimeEvent } from './schema';
import type { OpsEventBus, OpsEventBusListener, OpsEventBusSubscribeOptions } from './types';

function env(name: string, fallback = '') {
  const value = process.env[name];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function getRedisUrl() {
  return env('AHWA_OPS_EVENT_BUS_REDIS_URL');
}

function getRedisPrefix() {
  return env('AHWA_OPS_EVENT_BUS_REDIS_PREFIX', 'ahwa');
}

function getRedisMaxLen() {
  const parsed = Number(env('AHWA_OPS_EVENT_BUS_REDIS_MAXLEN', '20000'));
  return Number.isFinite(parsed) && parsed >= 100 ? Math.trunc(parsed) : 20000;
}

const REDIS_PUBLISHER_KEY = '__ahwa_ops_event_bus_redis_publisher__';

type GlobalRedisScope = typeof globalThis & {
  [REDIS_PUBLISHER_KEY]?: Redis;
};

function getPublisher() {
  const scope = globalThis as GlobalRedisScope;
  const url = getRedisUrl();
  if (!url) {
    throw new Error('AHWA_OPS_EVENT_BUS_REDIS_URL is required when the Redis event bus driver is enabled');
  }
  if (!scope[REDIS_PUBLISHER_KEY]) {
    scope[REDIS_PUBLISHER_KEY] = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    });
  }
  return scope[REDIS_PUBLISHER_KEY] as Redis;
}

async function ensureConnected(redis: Redis) {
  if (redis.status === 'ready' || redis.status === 'connecting') {
    return;
  }
  await redis.connect();
}

function toError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error ?? 'REDIS_EVENT_BUS_ERROR'));
}

function fieldsToObject(fields: string[]) {
  const result: Record<string, string> = {};
  for (let index = 0; index < fields.length; index += 2) {
    result[String(fields[index] ?? '')] = String(fields[index + 1] ?? '');
  }
  return result;
}

export function createRedisOpsEventBus(): OpsEventBus {
  return {
    async publish(event: OpsRealtimeEvent) {
      const publisher = getPublisher();
      await ensureConnected(publisher);
      const stream = getOpsEventStreamName(event.cafeId, getRedisPrefix());
      const next = normalizeOpsRealtimeEvent({ ...event, stream });
      const cursor = await publisher.xadd(
        stream,
        'MAXLEN',
        '~',
        String(getRedisMaxLen()),
        '*',
        'payload',
        JSON.stringify(next),
      );
      return { ...next, cursor, stream } satisfies OpsRealtimeEvent;
    },
    async subscribe(options: OpsEventBusSubscribeOptions, listener: OpsEventBusListener) {
      const url = getRedisUrl();
      if (!url) {
        throw new Error('AHWA_OPS_EVENT_BUS_REDIS_URL is required when the Redis event bus driver is enabled');
      }

      const redis = new Redis(url, {
        lazyConnect: true,
        maxRetriesPerRequest: null,
        enableReadyCheck: true,
      });
      await ensureConnected(redis);

      const stream = getOpsEventStreamName(options.cafeId, getRedisPrefix());
      let active = true;
      let cursor = String(options.cursor ?? '').trim() || '$';

      const unsubscribe = () => {
        active = false;
        options.signal?.removeEventListener('abort', unsubscribe);
        void redis.quit().catch(() => {
          redis.disconnect();
        });
      };

      options.signal?.addEventListener('abort', unsubscribe, { once: true });

      void (async () => {
        while (active) {
          try {
            const result = await redis.xread('BLOCK', 15000, 'STREAMS', stream, cursor);
            if (!active || !Array.isArray(result)) {
              continue;
            }

            for (const [, entries] of result) {
              for (const [entryId, fields] of entries) {
                cursor = String(entryId);
                const record = fieldsToObject(fields);
                if (!record.payload) {
                  continue;
                }
                const parsed = JSON.parse(record.payload) as Partial<OpsRealtimeEvent>;
                const event = normalizeOpsRealtimeEvent({
                  id: parsed.id ?? null,
                  type: typeof parsed.type === 'string' ? parsed.type : '',
                  cafeId: options.cafeId,
                  shiftId: parsed.shiftId ?? null,
                  entityId: parsed.entityId ?? null,
                  at: parsed.at ?? null,
                  data: parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data) ? parsed.data : {},
                  version: 1,
                  stream,
                  cursor: entryId,
                  scopes: Array.isArray(parsed.scopes) ? parsed.scopes : [],
                });
                listener(event);
              }
            }
          } catch (error) {
            if (!active) {
              break;
            }
            options.onError?.(toError(error));
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }
      })();

      return unsubscribe;
    },
  } satisfies OpsEventBus;
}
