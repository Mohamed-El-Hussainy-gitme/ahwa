'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuthz } from '@/lib/authz';
import { subscribeOpsRealtime, useOpsRealtimeStatus } from '@/lib/ops/realtime';
import type { OpsNavSummary } from '@/lib/ops/types';

export type OpsChromeState = {
  summary: OpsNavSummary | null;
  loading: boolean;
  lastLoadedAt: number | null;
  reload: () => Promise<void>;
  sync: ReturnType<typeof useOpsRealtimeStatus>;
};

const OpsChromeContext = createContext<OpsChromeState | null>(null);

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

  const enabled = Boolean(user);

  const reload = useCallback(async () => {
    if (!enabled) {
      setSummary(null);
      setLastLoadedAt(null);
      return;
    }

    setLoading(true);
    try {
      const next = await loadSummary();
      setSummary(next);
      setLastLoadedAt(Date.now());
    } catch {
      setSummary((current) => current);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void reload();
  }, [reload, shift?.id]);

  useEffect(() => {
    if (!enabled) return;

    const scheduleReload = () => {
      if (reloadTimerRef.current) {
        clearTimeout(reloadTimerRef.current);
      }
      reloadTimerRef.current = setTimeout(() => {
        void reload();
      }, 250);
    };

    const unsubscribe = subscribeOpsRealtime(() => {
      scheduleReload();
    });

    const onFocus = () => void reload();
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void reload();
      }
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      unsubscribe();
      if (reloadTimerRef.current) {
        clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = null;
      }
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, reload]);

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
