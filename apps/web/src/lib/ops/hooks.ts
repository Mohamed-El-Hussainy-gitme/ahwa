'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { OpsRealtimeEvent } from './types';
import { getOpsRealtimeSnapshot, isOpsRealtimeHealthy, subscribeOpsRealtime } from './realtime';
import { subscribeOpsInvalidation } from './invalidation';

type WorkspaceOptions = {
  enabled?: boolean;
  shouldReloadOnEvent?: (event: OpsRealtimeEvent) => boolean;
  staleTimeMs?: number;
  realtimeDebounceMs?: number;
  pollIntervalMs?: number;
  pollWhenHidden?: boolean;
  cacheKey?: string;
};

type ReloadMode = 'manual' | 'background';
type WorkspaceLoadContext = {
  mode: ReloadMode;
  forceFresh: boolean;
};

const DEFAULT_STALE_TIME_MS = 30_000;
const DEFAULT_REALTIME_DEBOUNCE_MS = 180;

type WorkspaceCacheEntry = {
  data: unknown;
  loadedAt: number;
};

const workspaceCache = new Map<string, WorkspaceCacheEntry>();

function isStale(lastLoadedAt: number | null, staleTimeMs: number, hasError: boolean) {
  if (hasError || lastLoadedAt === null) {
    return true;
  }
  return Date.now() - lastLoadedAt >= staleTimeMs;
}

export function useOpsWorkspace<T>(loader: (context?: WorkspaceLoadContext) => Promise<T>, options: WorkspaceOptions = {}) {
  const {
    enabled = true,
    shouldReloadOnEvent,
    staleTimeMs = DEFAULT_STALE_TIME_MS,
    realtimeDebounceMs = DEFAULT_REALTIME_DEBOUNCE_MS,
    pollIntervalMs = 0,
    pollWhenHidden = false,
    cacheKey,
  } = options;
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
          const next = await loader({ mode, forceFresh: mode === 'background' });
          const loadedAt = Date.now();
          setData(next);
          setError(null);
          setLastLoadedAt(loadedAt);
          if (cacheKey) {
            workspaceCache.set(cacheKey, { data: next, loadedAt });
          }
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
    [cacheKey, enabled, loader],
  );

  const reload = useCallback(async () => runReload('manual'), [runReload]);

  const scheduleBackgroundReload = useCallback(() => {
    clearReloadTimer();
    reloadTimerRef.current = setTimeout(() => {
      reloadTimerRef.current = null;
      void runReload('background');
    }, realtimeDebounceMs);
  }, [clearReloadTimer, realtimeDebounceMs, runReload]);

  const shouldRevalidate = useCallback(
    () => isStale(lastLoadedAtRef.current, staleTimeMs, Boolean(errorRef.current)),
    [staleTimeMs],
  );

  const shouldUsePollingFallback = useCallback(() => {
    if (errorRef.current) {
      return true;
    }
    return !isOpsRealtimeHealthy(getOpsRealtimeSnapshot());
  }, []);

  useEffect(() => {
    if (!enabled) {
      setData(null);
      setError(null);
      setLoading(false);
      setLastLoadedAt(null);
      return;
    }

    if (cacheKey) {
      const cached = workspaceCache.get(cacheKey);
      if (cached && !isStale(cached.loadedAt, staleTimeMs, false)) {
        setData(cached.data as T);
        setError(null);
        setLoading(false);
        setLastLoadedAt(cached.loadedAt);
        return;
      }
    }

    void runReload('manual');
  }, [cacheKey, enabled, runReload, staleTimeMs]);

  useEffect(() => {
    if (!enabled || pollIntervalMs <= 0) {
      return;
    }

    const interval = window.setInterval(() => {
      if (!pollWhenHidden && document.visibilityState !== 'visible') {
        return;
      }
      if (!shouldUsePollingFallback()) {
        return;
      }
      void runReload('background');
    }, pollIntervalMs);

    return () => {
      window.clearInterval(interval);
    };
  }, [enabled, pollIntervalMs, pollWhenHidden, runReload, shouldUsePollingFallback]);

  useEffect(() => {
    if (!enabled) {
      clearReloadTimer();
      return;
    }

    const unsubscribeRealtime = subscribeOpsRealtime((event) => {
      if (shouldReloadOnEvent && !shouldReloadOnEvent(event)) {
        return;
      }
      scheduleBackgroundReload();
    });

    const unsubscribeInvalidation = subscribeOpsInvalidation(() => {
      scheduleBackgroundReload();
    });

    const onFocus = () => {
      if (shouldRevalidate() && shouldUsePollingFallback()) {
        scheduleBackgroundReload();
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible' && shouldRevalidate() && shouldUsePollingFallback()) {
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
  }, [clearReloadTimer, enabled, scheduleBackgroundReload, shouldReloadOnEvent, shouldRevalidate, shouldUsePollingFallback]);

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
