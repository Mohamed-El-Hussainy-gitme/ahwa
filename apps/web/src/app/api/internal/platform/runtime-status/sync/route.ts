import { NextResponse } from 'next/server';
import { syncCafeRuntimeStatusesToControlPlane, type CafeRuntimeSyncBinding } from '@/lib/control-plane/runtime-status-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RequestBody = {
  bindings?: CafeRuntimeSyncBinding[];
  source?: string;
  ttlMs?: number;
  timeoutMs?: number;
  concurrency?: number;
  force?: boolean;
};

function isAuthorized(req: Request) {
  const expected = String(process.env.CRON_SECRET ?? '').trim();
  if (!expected) {
    throw new Error('CRON_SECRET is required');
  }

  const authHeader = req.headers.get('authorization');
  return authHeader === `Bearer ${expected}` || req.headers.get('x-cron-secret') === expected;
}

export async function POST(req: Request) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as RequestBody;
    const bindings = Array.isArray(body.bindings) ? body.bindings : [];

    if (bindings.length === 0) {
      return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
    }

    const results = await syncCafeRuntimeStatusesToControlPlane(bindings, {
      source: body.source?.trim() || 'api/internal/platform/runtime-status/sync',
      ttlMs: typeof body.ttlMs === 'number' && Number.isFinite(body.ttlMs) ? body.ttlMs : undefined,
      timeoutMs: typeof body.timeoutMs === 'number' && Number.isFinite(body.timeoutMs) ? body.timeoutMs : undefined,
      concurrency: typeof body.concurrency === 'number' && Number.isFinite(body.concurrency) ? body.concurrency : undefined,
      force: body.force === true,
    });

    return NextResponse.json({
      ok: true,
      total: results.length,
      synced: results.filter((item) => item.ok && !item.skipped).length,
      skipped: results.filter((item) => item.skipped).length,
      failed: results.filter((item) => !item.ok && !item.skipped).length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'RUNTIME_STATUS_SYNC_FAILED';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, { status: 405 });
}
