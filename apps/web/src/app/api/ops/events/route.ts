import { NextResponse } from 'next/server';
import {
  getEnrichedRuntimeMeFromCookie,
  isSupportRuntimeSessionError,
  isUnboundRuntimeSessionError,
} from '@/lib/runtime/me';
import { subscribeOpsEvents } from '@/lib/ops/events';
import { OpsEventBusDegradedError } from '@/lib/ops/event-bus/errors';
import { getOpsEventBusHealthSnapshot } from '@/lib/ops/event-bus/health';
import type { OpsRealtimeEvent } from '@/lib/ops/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SSE_HEARTBEAT_INTERVAL_MS = 15_000;
const SSE_MAX_CONNECTION_LIFETIME_MS = 240_000;

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
  let lifetimeTimer: ReturnType<typeof setTimeout> | null = null;
  const lastCursor = lastEventCursorFromRequest(req);
  let currentCursor = lastCursor;

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
        if (lifetimeTimer) {
          clearTimeout(lifetimeTimer);
          lifetimeTimer = null;
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
        currentCursor = event.cursor ?? event.id ?? currentCursor;
        safeEnqueue(`event: ops\nid: ${event.cursor ?? event.id}\ndata: ${JSON.stringify(event)}\n\n`);
      };

      const gracefulReconnect = (reason: string, includeHealth = false) => {
        const payload = JSON.stringify({
          cafeId,
          ok: reason.startsWith('polling-fallback:') ? false : true,
          reason,
          cursor: currentCursor,
          ...(includeHealth ? { health: getOpsEventBusHealthSnapshot() } : {}),
        });
        safeEnqueue(`event: reconnect\ndata: ${payload}\n\n`);
        stop();
        try {
          controller.close();
        } catch {}
      };

      req.signal.addEventListener(
        'abort',
        () => {
          stop();
        },
        { once: true },
      );

      const health = getOpsEventBusHealthSnapshot();
      if (!safeEnqueue(`event: ready\ndata: ${JSON.stringify({ cafeId, ok: true, cursor: lastCursor, transport: health.activeDriver, degraded: health.circuitOpen || !health.redisUrlValid })}\n\n`)) {
        return;
      }

      try {
        subscriptionCleanup = await subscribeOpsEvents(
          {
            cafeId,
            cursor: lastCursor,
            signal: abortController.signal,
            onError: (error) => {
              const snapshot = getOpsEventBusHealthSnapshot();
              gracefulReconnect(
                snapshot.circuitOpen
                  ? 'polling-fallback:circuit-open'
                  : `polling-fallback:${error instanceof Error && error.message ? error.message : 'subscription-error'}`,
                true,
              );
            },
          },
          send,
        );
      } catch (error) {
        const snapshot = getOpsEventBusHealthSnapshot();
        const reason = error instanceof OpsEventBusDegradedError
          ? `polling-fallback:${error.reason}`
          : snapshot.circuitOpen
            ? 'polling-fallback:circuit-open'
            : 'subscribe-failed';
        gracefulReconnect(reason, true);
        return;
      }

      heartbeat = setInterval(() => {
        safeEnqueue(`event: ping\ndata: ${Date.now()}\n\n`);
      }, SSE_HEARTBEAT_INTERVAL_MS);

      lifetimeTimer = setTimeout(() => {
        gracefulReconnect('max-connection-lifetime');
      }, SSE_MAX_CONNECTION_LIFETIME_MS);
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
      if (lifetimeTimer) {
        clearTimeout(lifetimeTimer);
        lifetimeTimer = null;
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
