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

async function directFallback(req: Request, target: URL) {
  const method = req.method === 'POST' ? 'POST' : 'GET';
  const init: RequestInit = {
    method,
    headers: { authorization: req.headers.get('authorization') ?? '' },
    cache: 'no-store',
  };
  if (method === 'POST') {
    init.headers = {
      ...init.headers,
      'content-type': req.headers.get('content-type') || 'application/json',
    };
    init.body = await req.text();
  }
  const response = await fetch(target, init);
  const payload = await response.json().catch(() => ({ ok: response.ok }));
  return NextResponse.json(payload, { status: response.status });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}

async function handle(req: Request) {
  const url = new URL(req.url);
  const observation = beginServerObservation('maintenance.reporting.qstash.enqueue', {
    path: url.pathname,
    action: url.searchParams.get('action')?.trim() || null,
    method: req.method,
  }, req.headers.get('x-request-id'));

  try {
    if (!isAuthorized(req)) {
      logServerObservation(observation, 'error', { status: 401, message: 'UNAUTHORIZED' });
      return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
    }

    const target = new URL('/api/internal/maintenance/reporting', url.origin);
    target.search = url.searchParams.toString();

    if (!isQStashConfigured()) {
      logServerObservation(observation, 'ok', { mode: 'direct-fallback' });
      return directFallback(req, target);
    }

    let body: unknown;
    if (req.method === 'POST') {
      const text = await req.text();
      body = text ? JSON.parse(text) : {};
    }

    await enqueueInternalRequestWithQStash({
      path: `${target.pathname}${target.search}`,
      method: req.method === 'POST' ? 'POST' : 'GET',
      body,
      retries: 3,
      timeoutSeconds: 60,
      dedupeKey: `maintenance-reporting:${req.method}:${url.searchParams.get('action') ?? 'backfill'}:${url.searchParams.get('cafeId') ?? '*'}:${url.searchParams.get('windowDays') ?? 'default'}:${url.searchParams.get('graceDays') ?? 'default'}`,
    });

    logServerObservation(observation, 'ok', { mode: 'qstash', queued: true });
    return NextResponse.json({ ok: true, queued: true, mode: 'qstash' }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'QSTASH_ENQUEUE_FAILED';
    logServerObservation(observation, 'error', { status: 500, message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
