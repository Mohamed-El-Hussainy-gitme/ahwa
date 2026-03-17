import { NextResponse } from 'next/server';
import { resolveOperationalRouteFromRuntimeSession } from '@/lib/operational-db/runtime';

export async function GET() {
  try {
    const route = await resolveOperationalRouteFromRuntimeSession();
    return NextResponse.json({ ok: true, data: route });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'OPERATIONAL_ROUTE_RESOLVE_FAILED',
      },
      { status: 500 },
    );
  }
}
