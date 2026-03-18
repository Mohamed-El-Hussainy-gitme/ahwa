'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuthz } from '@/lib/authz';
import { subscribeOpsRealtime, useOpsRealtimeStatus } from '@/lib/ops/realtime';
import { subscribeOpsInvalidation } from '@/lib/ops/invalidation';
import type { OpsNavSummary } from '@/lib/ops/types';
import { matchesWorkspaceScopes, OPS_SCOPE_NAV_SUMMARY, scopesForRealtimeEvent } from '@/lib/ops/workspaceScopes';

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
const SUMMARY_SCOPES = [OPS_SCOPE_NAV_SUMMARY] as const;

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
  const { user, shift } = useAuthz();
  const sync = useOpsRealtimeStatus();
  const [summary, setSummary] = useState<OpsNavSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const queuedRef = useRef(false);
  const lastLoadedAtRef = useRef<number | null>(null);

  useEffect(() => {
    lastLoadedAtRef.current = lastLoadedAt;
  }, [lastLoadedAt]);

  const enabled = Boolean(user);

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

    const shouldRevalidate = () => {
      if (lastLoadedAtRef.current === null) {
        return true;
      }
      return Date.now() - lastLoadedAtRef.current >= SUMMARY_STALE_TIME_MS;
    };

    const unsubscribeRealtime = subscribeOpsRealtime((event) => {
      if (!matchesWorkspaceScopes(SUMMARY_SCOPES, scopesForRealtimeEvent(event))) {
        return;
      }
      scheduleReload();
    });

    const unsubscribeInvalidation = subscribeOpsInvalidation((payload) => {
      if (!matchesWorkspaceScopes(SUMMARY_SCOPES, payload.scopes)) {
        return;
      }
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
  }, [clearReloadTimer, enabled, scheduleReload]);

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
