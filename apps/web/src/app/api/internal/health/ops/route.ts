import { NextResponse } from 'next/server';
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

export async function GET(request: Request) {
  const observation = beginServerObservation('ops.health', {
    path: new URL(request.url).pathname,
    method: request.method,
  }, request.headers.get('x-request-id'));

  try {
    if (!isAuthorized(request)) {
      logServerObservation(observation, 'error', { status: 401, code: 'UNAUTHORIZED' });
      const response = NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
      response.headers.set('x-request-id', observation.requestId);
      return response;
    }

    const validation = validateCriticalEnv(true);
    const driver = String(process.env.AHWA_OPS_EVENT_BUS_DRIVER ?? 'auto').trim().toLowerCase() || 'auto';
    const redisUrl = String(process.env.AHWA_OPS_EVENT_BUS_REDIS_URL ?? '').trim();
    const operationalDatabases = listConfiguredOperationalDatabasesFromEnv().map((item) => item.databaseKey);
    const qstash = getQStashConfig();

    const response = NextResponse.json({
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
    }, { status: validation.ok ? 200 : 500 });

    response.headers.set('x-request-id', observation.requestId);
    logServerObservation(observation, validation.ok ? 'ok' : 'error', {
      status: validation.ok ? 200 : 500,
      databaseCount: operationalDatabases.length,
      qstashEnabled: qstash.enabled,
      outboxPolicy: getOutboxDispatchPolicy(),
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OPS_HEALTH_FAILED';
    logServerObservation(observation, 'error', { status: 500, message });
    const response = NextResponse.json({ ok: false, error: message }, { status: 500 });
    response.headers.set('x-request-id', observation.requestId);
    return response;
  }
}
