import { NextRequest } from 'next/server';
import { jsonWithRequestId, getRequestIdFromHeaders } from '@/lib/observability/http';
import { beginServerObservation, logServerObservation } from '@/lib/observability/server';
import { validateCriticalEnv, getOutboxDispatchPolicy } from '@/lib/platform/env-contract';
import { getQStashConfig } from '@/lib/platform/qstash';
import { listConfiguredOperationalDatabasesFromEnv } from '@/lib/supabase/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAuthorized(request: Request) {
  const secret = String(process.env.CRON_SECRET ?? '').trim();
  if (!secret) {
    throw new Error('CRON_SECRET is required');
  }
  return request.headers.get('authorization') === `Bearer ${secret}` || request.headers.get('x-cron-secret') === secret;
}

export async function GET(request: NextRequest) {
  const requestId = getRequestIdFromHeaders(request.headers);
  const observation = beginServerObservation('internal.health.ops', undefined, requestId);

  try {
    if (!isAuthorized(request)) {
      logServerObservation(observation, 'error', { status: 401, code: 'UNAUTHORIZED' });
      return jsonWithRequestId({ ok: false, error: 'UNAUTHORIZED' }, requestId, { status: 401 });
    }

    const validation = validateCriticalEnv(true);
    const driver = String(process.env.AHWA_OPS_EVENT_BUS_DRIVER ?? 'auto').trim().toLowerCase() || 'auto';
    const redisUrl = String(process.env.AHWA_OPS_EVENT_BUS_REDIS_URL ?? '').trim();
    const operationalDatabases = listConfiguredOperationalDatabasesFromEnv().map((item) => item.databaseKey);
    const qstash = getQStashConfig();

    const body = {
      ok: validation.ok,
      checks: {
        env: validation,
        eventBus: {
          driver,
          redisConfigured: Boolean(redisUrl),
          redisTls: redisUrl.startsWith('rediss://'),
        },
        outbox: {
          policy: getOutboxDispatchPolicy(),
          batchLimit: Number(process.env.AHWA_OPS_OUTBOX_DISPATCH_BATCH_LIMIT ?? '100'),
          retryAfterSeconds: Number(process.env.AHWA_OPS_OUTBOX_RETRY_AFTER_SECONDS ?? '15'),
          maxAttempts: Number(process.env.AHWA_OPS_OUTBOX_MAX_ATTEMPTS ?? '20'),
        },
        qstash: {
          enabled: qstash.enabled,
          tokenConfigured: Boolean(qstash.token),
          signingKeysConfigured: Boolean(qstash.currentSigningKey && qstash.nextSigningKey),
          baseUrlConfigured: Boolean(qstash.baseUrl),
        },
        operationalDatabases,
      },
    };

    logServerObservation(observation, validation.ok ? 'ok' : 'error', {
      status: validation.ok ? 200 : 500,
      envOk: validation.ok,
      operationalDatabaseCount: operationalDatabases.length,
      qstashEnabled: qstash.enabled,
      redisConfigured: Boolean(redisUrl),
    });
    return jsonWithRequestId(body, requestId, { status: validation.ok ? 200 : 500 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OPS_HEALTH_FAILED';
    logServerObservation(observation, 'error', { status: 500, code: 'OPS_HEALTH_FAILED', message });
    return jsonWithRequestId({ ok: false, error: message }, requestId, { status: 500 });
  }
}
