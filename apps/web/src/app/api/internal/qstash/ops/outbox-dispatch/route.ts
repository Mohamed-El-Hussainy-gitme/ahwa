import { NextResponse } from 'next/server';
import { beginServerObservation, logServerObservation } from '@/lib/observability/server';
import { enqueueInternalRequestWithQStash, isQStashConfigured } from '@/lib/platform/qstash';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAuthorized(req: Request) {
  const expected = String(process.env.CRON_SECRET ?? '').trim();
  if (!expected) {
    throw new Error('CRON_SECRET is required');
  }
  const authHeader = req.headers.get('authorization');
  return authHeader === `Bearer ${expected}` || req.headers.get('x-cron-secret') === expected;
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const observation = beginServerObservation('ops.outbox.dispatch.qstash.enqueue', {
    path: url.pathname,
    databaseKey: url.searchParams.get('databaseKey')?.trim() || null,
    cafeId: url.searchParams.get('cafeId')?.trim() || null,
  }, req.headers.get('x-request-id'));

  try {
    if (!isAuthorized(req)) {
      logServerObservation(observation, 'error', { status: 401, message: 'UNAUTHORIZED' });
      return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
    }

    if (!isQStashConfigured()) {
      logServerObservation(observation, 'ok', { mode: 'direct-fallback' });
      const directUrl = new URL('/api/internal/ops/outbox/dispatch', url.origin);
      directUrl.search = url.searchParams.toString();
      const response = await fetch(directUrl, {
        method: 'POST',
        headers: { authorization: req.headers.get('authorization') ?? '' },
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({ ok: response.ok }));
      return NextResponse.json(payload, { status: response.status });
    }

    const target = new URL('/api/internal/ops/outbox/dispatch', url.origin);
    target.search = url.searchParams.toString();
    await enqueueInternalRequestWithQStash({
      path: `${target.pathname}${target.search}`,
      method: 'POST',
      retries: 3,
      timeoutSeconds: 30,
      dedupeKey: `cron-outbox:${url.searchParams.get('databaseKey') ?? '*'}:${url.searchParams.get('cafeId') ?? '*'}:${url.searchParams.get('limit') ?? 'default'}`,
    });

    logServerObservation(observation, 'ok', { mode: 'qstash', queued: true });
    return NextResponse.json({ ok: true, queued: true, mode: 'qstash' }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'QSTASH_ENQUEUE_FAILED';
    logServerObservation(observation, 'error', { status: 500, message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
