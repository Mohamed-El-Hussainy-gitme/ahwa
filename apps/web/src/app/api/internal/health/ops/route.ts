import { NextResponse } from 'next/server';
import { validateCriticalEnv, getOutboxDispatchPolicy } from '@/lib/platform/env-contract';
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
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
    }

    const validation = validateCriticalEnv(true);
    const driver = String(process.env.AHWA_OPS_EVENT_BUS_DRIVER ?? 'auto').trim().toLowerCase() || 'auto';
    const redisUrl = String(process.env.AHWA_OPS_EVENT_BUS_REDIS_URL ?? '').trim();
    const operationalDatabases = listConfiguredOperationalDatabasesFromEnv().map((item) => item.databaseKey);

    return NextResponse.json({
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
        operationalDatabases,
      },
    }, { status: validation.ok ? 200 : 500 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'OPS_HEALTH_FAILED' }, { status: 500 });
  }
}
