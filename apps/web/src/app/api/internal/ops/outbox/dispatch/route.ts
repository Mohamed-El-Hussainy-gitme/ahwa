import { NextResponse } from 'next/server';
import { beginServerObservation, logServerObservation } from '@/lib/observability/server';
import { dispatchOpsOutboxAcrossConfiguredDatabases, dispatchOpsOutboxBatch } from '@/lib/ops/outbox/dispatcher';
import { verifyQStashRequest } from '@/lib/platform/qstash-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function isAuthorized(req: Request, rawBody: string) {
  if (await verifyQStashRequest(req, rawBody)) {
    return true;
  }

  const expected = String(process.env.CRON_SECRET ?? '').trim();
  if (!expected) {
    throw new Error('CRON_SECRET is required');
  }

  const authHeader = req.headers.get('authorization');
  if (authHeader === `Bearer ${expected}`) {
    return true;
  }

  return req.headers.get('x-cron-secret') === expected;
}

function getOptionalNumber(value: string | null) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : undefined;
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const url = new URL(req.url);
  const observation = beginServerObservation('ops.outbox.dispatch.route', {
    path: url.pathname,
    databaseKey: url.searchParams.get('databaseKey')?.trim() || null,
    cafeId: url.searchParams.get('cafeId')?.trim() || null,
  }, req.headers.get('x-request-id'));

  try {
    if (!(await isAuthorized(req, rawBody))) {
      logServerObservation(observation, 'error', { status: 401, message: 'UNAUTHORIZED' });
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    }

    const databaseKey = url.searchParams.get('databaseKey')?.trim() || '';
    const cafeId = url.searchParams.get('cafeId')?.trim() || null;
    const limit = getOptionalNumber(url.searchParams.get('limit'));

    if (databaseKey) {
      const result = await dispatchOpsOutboxBatch({
        databaseKey,
        cafeId,
        limit,
        triggerSource: 'cron-route',
      });
      logServerObservation(observation, 'ok', { shardCount: 1, published: result.published, failed: result.failed });
      return NextResponse.json({ ok: true, results: [result] }, { status: 200 });
    }

    const results = await dispatchOpsOutboxAcrossConfiguredDatabases(limit);
    logServerObservation(observation, 'ok', {
      shardCount: results.length,
      published: results.reduce((sum, item) => sum + item.published, 0),
      failed: results.reduce((sum, item) => sum + item.failed, 0),
    });
    return NextResponse.json({ ok: true, results }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OUTBOX_DISPATCH_FAILED';
    logServerObservation(observation, 'error', { status: 500, message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
