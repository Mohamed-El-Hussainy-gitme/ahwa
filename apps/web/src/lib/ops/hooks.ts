'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { OpsRealtimeEvent } from './types';
import { subscribeOpsRealtime } from './realtime';
import { subscribeOpsInvalidation } from './invalidation';
import { matchesWorkspaceScopes, scopesForRealtimeEvent, type OpsWorkspaceScope } from './workspaceScopes';

type WorkspaceOptions = {
  enabled?: boolean;
  scopes?: OpsWorkspaceScope[];
  shouldReloadOnEvent?: (event: OpsRealtimeEvent) => boolean;
  staleTimeMs?: number;
  realtimeDebounceMs?: number;
};

type ReloadMode = 'manual' | 'background';

const DEFAULT_STALE_TIME_MS = 15_000;
const DEFAULT_REALTIME_DEBOUNCE_MS = 120;

function isStale(lastLoadedAt: number | null, staleTimeMs: number, hasError: boolean) {
  if (hasError || lastLoadedAt === null) {
    return true;
  }
  return Date.now() - lastLoadedAt >= staleTimeMs;
}

export function useOpsWorkspace<T>(loader: () => Promise<T>, options: WorkspaceOptions = {}) {
  const {
    enabled = true,
    scopes = [],
    shouldReloadOnEvent,
    staleTimeMs = DEFAULT_STALE_TIME_MS,
    realtimeDebounceMs = DEFAULT_REALTIME_DEBOUNCE_MS,
  } = options;
  const scopeSignature = scopes.join('|');
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);
  const inFlightRef = useRef<Promise<T | null> | null>(null);
  const queuedRef = useRef(false);
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLoadedAtRef = useRef<number | null>(null);
  const errorRef = useRef<string | null>(null);

  useEffect(() => {
    lastLoadedAtRef.current = lastLoadedAt;
  }, [lastLoadedAt]);

  useEffect(() => {
    errorRef.current = error;
  }, [error]);

  const clearReloadTimer = useCallback(() => {
    if (reloadTimerRef.current) {
      clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = null;
    }
  }, []);

  const runReload = useCallback(
    async (mode: ReloadMode) => {
      if (!enabled) {
        setData(null);
        setError(null);
        setLoading(false);
        setLastLoadedAt(null);
        return null;
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
          const next = await loader();
          const loadedAt = Date.now();
          setData(next);
          setError(null);
          setLastLoadedAt(loadedAt);
          return next;
        } catch (loadError) {
          const message = loadError instanceof Error ? loadError.message : 'REQUEST_FAILED';
          setError(message);
          return null;
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
    },
    [enabled, loader],
  );

  const reload = useCallback(async () => runReload('manual'), [runReload]);

  const scheduleBackgroundReload = useCallback(() => {
    clearReloadTimer();
    reloadTimerRef.current = setTimeout(() => {
      reloadTimerRef.current = null;
      void runReload('background');
    }, realtimeDebounceMs);
  }, [clearReloadTimer, realtimeDebounceMs, runReload]);

  useEffect(() => {
    void runReload('manual');
  }, [runReload]);

  useEffect(() => {
    if (!enabled) {
      clearReloadTimer();
      return;
    }

    const shouldRevalidate = () => isStale(lastLoadedAtRef.current, staleTimeMs, Boolean(errorRef.current));

    const unsubscribeRealtime = subscribeOpsRealtime((event) => {
      const scopeMatch = !scopes.length || matchesWorkspaceScopes(scopes, scopesForRealtimeEvent(event));
      const customMatch = shouldReloadOnEvent ? shouldReloadOnEvent(event) : true;
      if (!scopeMatch || !customMatch) {
        return;
      }
      scheduleBackgroundReload();
    });

    const unsubscribeInvalidation = subscribeOpsInvalidation((payload) => {
      if (scopes.length && !matchesWorkspaceScopes(scopes, payload.scopes)) {
        return;
      }
      scheduleBackgroundReload();
    });

    const onFocus = () => {
      if (shouldRevalidate()) {
        scheduleBackgroundReload();
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible' && shouldRevalidate()) {
        scheduleBackgroundReload();
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
  }, [clearReloadTimer, enabled, scheduleBackgroundReload, scopeSignature, shouldReloadOnEvent, staleTimeMs]);

  return useMemo(
    () => ({ data, setData, loading, error, reload, lastLoadedAt }),
    [data, loading, error, reload, lastLoadedAt],
  );
}

export function useOpsCommand<TArgs extends unknown[], TResult>(
  command: (...args: TArgs) => Promise<TResult>,
  options: {
    onSuccess?: (result: TResult) => void | Promise<void>;
    onError?: (message: string) => void;
  } = {},
) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (...args: TArgs) => {
      setBusy(true);
      setError(null);
      try {
        const result = await command(...args);
        await options.onSuccess?.(result);
        return result;
      } catch (commandError) {
        const message = commandError instanceof Error ? commandError.message : 'REQUEST_FAILED';
        setError(message);
        options.onError?.(message);
        throw commandError;
      } finally {
        setBusy(false);
      }
    },
    [command, options],
  );

  return useMemo(() => ({ run, busy, error, setError }), [run, busy, error]);
}

export function useOpsPendingCommand<TKey extends string, TArgs extends unknown[], TResult>(
  keyOf: (...args: TArgs) => TKey,
  command: (...args: TArgs) => Promise<TResult>,
  options: {
    onSuccess?: (result: TResult, key: TKey) => void | Promise<void>;
    onError?: (message: string, key: TKey) => void;
  } = {},
) {
  const [pendingByKey, setPendingByKey] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (...args: TArgs) => {
      const key = keyOf(...args);
      setPendingByKey((current) => ({ ...current, [key]: (current[key] ?? 0) + 1 }));
      setError(null);
      try {
        const result = await command(...args);
        await options.onSuccess?.(result, key);
        return result;
      } catch (commandError) {
        const message = commandError instanceof Error ? commandError.message : 'REQUEST_FAILED';
        setError(message);
        options.onError?.(message, key);
        throw commandError;
      } finally {
        setPendingByKey((current) => {
          const remaining = (current[key] ?? 1) - 1;
          if (remaining <= 0) {
            const next = { ...current };
            delete next[key];
            return next;
          }
          return { ...current, [key]: remaining };
        });
      }
    },
    [command, keyOf, options],
  );

  const isPending = useCallback(
    (key: TKey) => Boolean(pendingByKey[key]),
    [pendingByKey],
  );

  const busy = Object.keys(pendingByKey).length > 0;

  return useMemo(
    () => ({ run, busy, error, setError, pendingByKey, isPending }),
    [busy, error, isPending, pendingByKey, run],
  );
}
