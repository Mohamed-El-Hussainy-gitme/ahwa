import { NextResponse } from 'next/server';
import {
  getEnrichedRuntimeMeFromCookie,
  isSupportRuntimeSessionError,
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
    if (isUnboundRuntimeSessionError(error) || isSupportRuntimeSessionError(error)) {
      return NextResponse.json({ error: 'UNBOUND_RUNTIME_SESSION' }, { status: 409 });
    }
    throw error;
  }

  if (!me?.tenantId) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const cafeId = String(me.tenantId);
  const encoder = new TextEncoder();
  const abortController = new AbortController();
  let subscriptionCleanup: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;
  const lastCursor = lastEventCursorFromRequest(req);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const stop = () => {
        if (closed) {
          return;
        }
        closed = true;
        abortController.abort();
        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
        if (subscriptionCleanup) {
          subscriptionCleanup();
          subscriptionCleanup = null;
        }
      };

      const safeEnqueue = (chunk: string) => {
        if (closed) {
          return false;
        }
        try {
          controller.enqueue(encoder.encode(chunk));
          return true;
        } catch {
          stop();
          return false;
        }
      };

      const send = (event: OpsRealtimeEvent) => {
        if (event.cafeId !== cafeId) {
          return;
        }
        safeEnqueue(`event: ops
id: ${event.cursor ?? event.id}
data: ${JSON.stringify(event)}

`);
      };

      req.signal.addEventListener(
        'abort',
        () => {
          stop();
        },
        { once: true },
      );

      if (!safeEnqueue(`event: ready
data: ${JSON.stringify({ cafeId, ok: true, cursor: lastCursor })}

`)) {
        return;
      }

      try {
        subscriptionCleanup = await subscribeOpsEvents(
          {
            cafeId,
            cursor: lastCursor,
            signal: abortController.signal,
            onError: () => {
              safeEnqueue(`event: reconnect
data: ${JSON.stringify({ cafeId, ok: false })}

`);
            },
          },
          send,
        );
      } catch {
        safeEnqueue(`event: reconnect
data: ${JSON.stringify({ cafeId, ok: false })}

`);
        stop();
        try {
          controller.close();
        } catch {}
        return;
      }

      heartbeat = setInterval(() => {
        safeEnqueue(`event: ping
data: ${Date.now()}

`);
      }, 15_000);
    },
    cancel() {
      if (closed) {
        return;
      }
      closed = true;
      abortController.abort();
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
      if (subscriptionCleanup) {
        subscriptionCleanup();
        subscriptionCleanup = null;
      }
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
