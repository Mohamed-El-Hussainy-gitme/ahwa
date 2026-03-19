'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuthz } from '@/lib/authz';
import { useOpsRealtimeNotifications } from '@/lib/ops/notifications';
import { subscribeOpsRealtime, useOpsRealtimeStatus } from '@/lib/ops/realtime';
import { subscribeOpsInvalidation } from '@/lib/ops/invalidation';
import type { OpsNavSummary } from '@/lib/ops/types';

export type OpsChromeState = {
  summary: OpsNavSummary | null;
  loading: boolean;
  lastLoadedAt: number | null;
  reload: () => Promise<void>;
  sync: ReturnType<typeof useOpsRealtimeStatus>;
};

const OpsChromeContext = createContext<OpsChromeState | null>(null);
const SUMMARY_STALE_TIME_MS = 15_000;
const SUMMARY_DEBOUNCE_MS = 150;
const PATCHABLE_SUMMARY_EVENTS = new Set(['station.order_submitted', 'station.ready', 'delivery.delivered', 'billing.settled', 'billing.deferred', 'session.opened', 'session.resumed', 'session.closed']);

function toPositiveInteger(value: unknown) {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.trunc(num);
}

function clampNonNegative(value: number) {
  return value > 0 ? value : 0;
}

function patchSummaryFromRealtimeEvent(current: OpsNavSummary | null, event: { type: string; data?: Record<string, unknown> }) {
  if (!current) return current;

  if (event.type === 'station.order_submitted') {
    const stationCode = event.data?.stationCode;
    const quantity = toPositiveInteger(event.data?.quantity ?? event.data?.itemsCount);
    if (quantity <= 0) return current;
    if (stationCode === 'barista') {
      return { ...current, waitingBarista: current.waitingBarista + quantity };
    }
    if (stationCode === 'shisha') {
      return { ...current, waitingShisha: current.waitingShisha + quantity };
    }
    return current;
  }

  if (event.type === 'station.ready') {
    const stationCode = event.data?.stationCode;
    const quantity = toPositiveInteger(event.data?.quantity);
    if (quantity <= 0) return current;
    if (stationCode === 'barista') {
      return {
        ...current,
        waitingBarista: clampNonNegative(current.waitingBarista - quantity),
        readyForDelivery: current.readyForDelivery + quantity,
      };
    }
    if (stationCode === 'shisha') {
      return {
        ...current,
        waitingShisha: clampNonNegative(current.waitingShisha - quantity),
        readyForDelivery: current.readyForDelivery + quantity,
      };
    }
    return { ...current, readyForDelivery: current.readyForDelivery + quantity };
  }

  if (event.type === 'delivery.delivered') {
    const quantity = toPositiveInteger(event.data?.quantity);
    if (quantity <= 0) return current;
    return {
      ...current,
      readyForDelivery: clampNonNegative(current.readyForDelivery - quantity),
      billableQty: current.billableQty + quantity,
    };
  }

  if (event.type === 'billing.settled' || event.type === 'billing.deferred') {
    const quantity = toPositiveInteger(event.data?.totalQuantity);
    if (quantity <= 0) return current;
    return {
      ...current,
      billableQty: clampNonNegative(current.billableQty - quantity),
    };
  }

  if (event.type === 'session.opened') {
    return { ...current, openSessions: current.openSessions + 1 };
  }

  if (event.type === 'session.closed') {
    return { ...current, openSessions: clampNonNegative(current.openSessions - 1) };
  }

  return current;
}

async function loadSummary(): Promise<OpsNavSummary> {
  const res = await fetch('/api/ops/workspaces/nav-summary', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
  });

  const json = (await res.json().catch(() => null)) as OpsNavSummary | { error?: string } | null;
  if (!res.ok) {
    throw new Error((json as { error?: string } | null)?.error ?? 'REQUEST_FAILED');
  }
  return json as OpsNavSummary;
}

export function OpsChromeProvider({ children }: { children: React.ReactNode }) {
  const { user, shift, effectiveRole, can } = useAuthz();
  const sync = useOpsRealtimeStatus();
  const [summary, setSummary] = useState<OpsNavSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenRealtimeEventIdsRef = useRef<string[]>([]);
  const seenRealtimeEventIdsSetRef = useRef<Set<string>>(new Set());
  const inFlightRef = useRef<Promise<void> | null>(null);
  const queuedRef = useRef(false);
  const lastLoadedAtRef = useRef<number | null>(null);

  useEffect(() => {
    lastLoadedAtRef.current = lastLoadedAt;
  }, [lastLoadedAt]);

  const enabled = Boolean(user);
  const notifyRealtime = useOpsRealtimeNotifications({ enabled, role: effectiveRole, isOwner: can.owner });

  const clearReloadTimer = useCallback(() => {
    if (reloadTimerRef.current) {
      clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = null;
    }
  }, []);

  const runReload = useCallback(async (mode: 'manual' | 'background') => {
    if (!enabled) {
      setSummary(null);
      setLastLoadedAt(null);
      setLoading(false);
      return;
    }

    if (inFlightRef.current) {
      queuedRef.current = true;
      return inFlightRef.current;
    }

    if (mode === 'manual') {
      setLoading(true);
    }

    const request = (async () => {
      try {
        const next = await loadSummary();
        setSummary(next);
        setLastLoadedAt(Date.now());
      } catch {
        setSummary((current) => current);
      } finally {
        inFlightRef.current = null;
        if (mode === 'manual') {
          setLoading(false);
        }
        if (queuedRef.current) {
          queuedRef.current = false;
          void runReload('background');
        }
      }
    })();

    inFlightRef.current = request;
    return request;
  }, [enabled]);

  const reload = useCallback(async () => {
    await runReload('manual');
  }, [runReload]);

  const scheduleReload = useCallback(() => {
    clearReloadTimer();
    reloadTimerRef.current = setTimeout(() => {
      reloadTimerRef.current = null;
      void runReload('background');
    }, SUMMARY_DEBOUNCE_MS);
  }, [clearReloadTimer, runReload]);

  useEffect(() => {
    void runReload('manual');
  }, [runReload, shift?.id]);

  useEffect(() => {
    if (!enabled) return;

    const rememberRealtimeEventId = (eventId: string) => {
      if (!eventId || seenRealtimeEventIdsSetRef.current.has(eventId)) {
        return false;
      }
      seenRealtimeEventIdsSetRef.current.add(eventId);
      seenRealtimeEventIdsRef.current.push(eventId);
      while (seenRealtimeEventIdsRef.current.length > 256) {
        const oldest = seenRealtimeEventIdsRef.current.shift();
        if (oldest) {
          seenRealtimeEventIdsSetRef.current.delete(oldest);
        }
      }
      return true;
    };

    const shouldRevalidate = () => {
      if (lastLoadedAtRef.current === null) {
        return true;
      }
      return Date.now() - lastLoadedAtRef.current >= SUMMARY_STALE_TIME_MS;
    };

    const unsubscribeRealtime = subscribeOpsRealtime((event) => {
      if (!rememberRealtimeEventId(event.id)) {
        return;
      }

      setSummary((current) => patchSummaryFromRealtimeEvent(current, event));
      void notifyRealtime(event);

      if (!PATCHABLE_SUMMARY_EVENTS.has(event.type) || shouldRevalidate()) {
        scheduleReload();
      }
    });

    const unsubscribeInvalidation = subscribeOpsInvalidation(() => {
      scheduleReload();
    });

    const onFocus = () => {
      if (shouldRevalidate()) {
        scheduleReload();
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && shouldRevalidate()) {
        scheduleReload();
      }
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      unsubscribeRealtime();
      unsubscribeInvalidation();
      clearReloadTimer();
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [clearReloadTimer, enabled, notifyRealtime, scheduleReload]);

  const value = useMemo<OpsChromeState>(
    () => ({ summary, loading, lastLoadedAt, reload, sync }),
    [summary, loading, lastLoadedAt, reload, sync],
  );

  return <OpsChromeContext.Provider value={value}>{children}</OpsChromeContext.Provider>;
}

export function useOpsChrome() {
  const value = useContext(OpsChromeContext);
  if (!value) {
    throw new Error('useOpsChrome must be used inside OpsChromeProvider');
  }
  return value;
}
