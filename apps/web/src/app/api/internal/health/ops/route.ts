import { NextResponse } from 'next/server';
import { validateCriticalEnv, getOutboxDispatchPolicy } from '@/lib/platform/env-contract';
import { getQStashConfig } from '@/lib/platform/qstash';
import { listConfiguredOperationalDatabasesFromEnv } from '@/lib/supabase/env';
import { getOpsEventBusHealthSnapshot } from '@/lib/ops/event-bus/health';

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
    const eventBusHealth = getOpsEventBusHealthSnapshot();
    const operationalDatabases = listConfiguredOperationalDatabasesFromEnv().map((item) => item.databaseKey);
    const qstash = getQStashConfig();

    return NextResponse.json({
      ok: validation.ok,
      checks: {
        env: validation,
        eventBus: eventBusHealth,
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
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'OPS_HEALTH_FAILED' }, { status: 500 });
  }
}
