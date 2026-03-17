import { NextResponse } from 'next/server';
import { clearAuthCookies } from '@/lib/auth/cookies';
import {
  getEnrichedRuntimeMeFromCookie,
  isUnboundRuntimeSessionError,
} from '@/lib/runtime/me';
import { subscribeOpsEvents } from '@/lib/ops/events';
import type { OpsRealtimeEvent } from '@/lib/ops/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  let me;
  try {
    me = await getEnrichedRuntimeMeFromCookie();
  } catch (error) {
    if (isUnboundRuntimeSessionError(error)) {
      const response = NextResponse.json(
        { error: 'UNBOUND_RUNTIME_SESSION' },
        { status: 409 },
      );
      clearAuthCookies(response);
      return response;
    }
    throw error;
  }

  if (!me?.tenantId) {
    const response = NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    clearAuthCookies(response);
    return response;
  }

  const cafeId = String(me.tenantId);
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: OpsRealtimeEvent) => {
        if (event.cafeId !== cafeId) {
          return;
        }
        controller.enqueue(
          encoder.encode(`event: ops\nid: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`),
        );
      };

      controller.enqueue(
        encoder.encode(`event: ready\ndata: ${JSON.stringify({ cafeId, ok: true })}\n\n`),
      );

      unsubscribe = subscribeOpsEvents(send);
      heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
      }, 15000);
    },
    cancel() {
      if (heartbeat) {
        clearInterval(heartbeat);
      }
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
