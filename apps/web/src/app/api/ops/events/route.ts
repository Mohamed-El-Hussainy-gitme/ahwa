import { NextResponse } from 'next/server';
import {
  getEnrichedRuntimeMeFromCookie,
  isUnboundRuntimeSessionError,
} from '@/lib/runtime/me';
import { subscribeOpsEvents } from '@/lib/ops/events';
import type { OpsRealtimeEvent } from '@/lib/ops/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function lastEventCursorFromRequest(req: Request) {
  const directHeader = req.headers.get('last-event-id');
  if (directHeader && directHeader.trim()) {
    return directHeader.trim();
  }

  const url = new URL(req.url);
  const queryValue = url.searchParams.get('cursor');
  return queryValue && queryValue.trim() ? queryValue.trim() : null;
}

export async function GET(req: Request) {
  let me;
  try {
    me = await getEnrichedRuntimeMeFromCookie();
  } catch (error) {
    if (isUnboundRuntimeSessionError(error)) {
      return NextResponse.json(
        { error: 'UNBOUND_RUNTIME_SESSION' },
        { status: 409 },
      );
    }
    throw error;
  }

  if (!me?.tenantId) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const cafeId = String(me.tenantId);
  const encoder = new TextEncoder();
  const abortController = new AbortController();
  let cleanup: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  const lastCursor = lastEventCursorFromRequest(req);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: OpsRealtimeEvent) => {
        if (event.cafeId !== cafeId) {
          return;
        }
        controller.enqueue(
          encoder.encode(`event: ops\nid: ${event.cursor ?? event.id}\ndata: ${JSON.stringify(event)}\n\n`),
        );
      };

      controller.enqueue(
        encoder.encode(`event: ready\ndata: ${JSON.stringify({ cafeId, ok: true, cursor: lastCursor })}\n\n`),
      );

      try {
        cleanup = await subscribeOpsEvents(
          {
            cafeId,
            cursor: lastCursor,
            signal: abortController.signal,
            onError: () => {
              controller.enqueue(encoder.encode(`event: reconnect\ndata: ${JSON.stringify({ cafeId, ok: false })}\n\n`));
            },
          },
          send,
        );
      } catch (error) {
        controller.error(error);
        return;
      }

      heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
      }, 15000);
    },
    cancel() {
      abortController.abort();
      if (heartbeat) {
        clearInterval(heartbeat);
      }
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
