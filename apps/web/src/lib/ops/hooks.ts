'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeReloadDirective } from './reload-rules';
import type { OpsRealtimeEvent } from './types';
import { subscribeOpsRealtime } from './realtime';
import { subscribeOpsInvalidation } from './invalidation';

type WorkspaceOptions<T> = {
  enabled?: boolean;
  shouldReloadOnEvent?: (event: OpsRealtimeEvent) => RealtimeReloadDirective;
  applyRealtimeEvent?: (current: T | null, event: OpsRealtimeEvent) => T | null;
  staleTimeMs?: number;
  realtimeDebounceMs?: number;
  pollIntervalMs?: number;
  pollWhenHidden?: boolean;
};

type ReloadMode = 'manual' | 'background';

type NormalizedRealtimeDirective = {
  reload: 'none' | 'background' | 'immediate';
  debounceMs?: number;
  burstMs?: number;
  fastPollIntervalMs?: number;
  onlyIfStale?: boolean;
};

const DEFAULT_STALE_TIME_MS = 15_000;
const DEFAULT_REALTIME_DEBOUNCE_MS = 120;
const DEFAULT_FAST_POLL_INTERVAL_MS = 900;

function isStale(lastLoadedAt: number | null, staleTimeMs: number, hasError: boolean) {
  if (hasError || lastLoadedAt === null) {
    return true;
  }
  return Date.now() - lastLoadedAt >= staleTimeMs;
}

function normalizeDirective(directive: RealtimeReloadDirective | undefined): NormalizedRealtimeDirective {
  if (!directive) {
    return { reload: 'none' };
  }

  if (directive === true) {
    return { reload: 'background' };
  }

  return {
    reload: directive.reload ?? 'background',
    debounceMs: directive.debounceMs,
    burstMs: directive.burstMs,
    fastPollIntervalMs: directive.fastPollIntervalMs,
    onlyIfStale: directive.onlyIfStale,
  };
}

export function useOpsWorkspace<T>(loader: () => Promise<T>, options: WorkspaceOptions<T> = {}) {
  const {
    enabled = true,
    shouldReloadOnEvent,
    applyRealtimeEvent,
    staleTimeMs = DEFAULT_STALE_TIME_MS,
    realtimeDebounceMs = DEFAULT_REALTIME_DEBOUNCE_MS,
    pollIntervalMs = 0,
    pollWhenHidden = false,
  } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);
  const inFlightRef = useRef<Promise<T | null> | null>(null);
  const queuedRef = useRef(false);
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const burstIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const burstUntilRef = useRef<number | null>(null);
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

  const clearBurstInterval = useCallback(() => {
    if (burstIntervalRef.current) {
      clearInterval(burstIntervalRef.current);
      burstIntervalRef.current = null;
    }
    burstUntilRef.current = null;
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

  const scheduleBackgroundReload = useCallback(
    (overrideDebounceMs?: number) => {
      clearReloadTimer();
      reloadTimerRef.current = setTimeout(() => {
        reloadTimerRef.current = null;
        void runReload('background');
      }, overrideDebounceMs ?? realtimeDebounceMs);
    },
    [clearReloadTimer, realtimeDebounceMs, runReload],
  );

  const startBurstPolling = useCallback(
    (burstMs?: number, fastPollIntervalMs?: number) => {
      if (!enabled || !burstMs || burstMs <= 0) {
        return;
      }

      const nextUntil = Date.now() + burstMs;
      burstUntilRef.current = Math.max(burstUntilRef.current ?? 0, nextUntil);

      if (burstIntervalRef.current) {
        return;
      }

      const intervalMs = Math.max(250, fastPollIntervalMs ?? DEFAULT_FAST_POLL_INTERVAL_MS);
      burstIntervalRef.current = setInterval(() => {
        if (!pollWhenHidden && document.visibilityState !== 'visible') {
          return;
        }

        const burstUntil = burstUntilRef.current;
        if (!burstUntil || Date.now() >= burstUntil) {
          clearBurstInterval();
          return;
        }

        void runReload('background');
      }, intervalMs);
    },
    [clearBurstInterval, enabled, pollWhenHidden, runReload],
  );

  useEffect(() => {
    void runReload('manual');
  }, [runReload]);

  useEffect(() => {
    if (!enabled || pollIntervalMs <= 0) {
      return;
    }

    const interval = window.setInterval(() => {
      if (!pollWhenHidden && document.visibilityState !== 'visible') {
        return;
      }
      if (!isStale(lastLoadedAtRef.current, staleTimeMs, Boolean(errorRef.current))) {
        return;
      }
      void runReload('background');
    }, pollIntervalMs);

    return () => {
      window.clearInterval(interval);
    };
  }, [enabled, pollIntervalMs, pollWhenHidden, runReload, staleTimeMs]);

  useEffect(() => {
    if (!enabled) {
      clearReloadTimer();
      clearBurstInterval();
      return;
    }

    const shouldRevalidate = () => isStale(lastLoadedAtRef.current, staleTimeMs, Boolean(errorRef.current));

    const unsubscribeRealtime = subscribeOpsRealtime((event) => {
      if (applyRealtimeEvent) {
        setData((current) => applyRealtimeEvent(current, event));
      }

      const directive = normalizeDirective(shouldReloadOnEvent?.(event));
      if (directive.reload === 'none') {
        return;
      }

      if (directive.burstMs) {
        startBurstPolling(directive.burstMs, directive.fastPollIntervalMs);
      }

      if (directive.onlyIfStale && !shouldRevalidate()) {
        return;
      }

      if (directive.reload === 'immediate') {
        void runReload('background');
        return;
      }

      scheduleBackgroundReload(directive.debounceMs);
    });

    const unsubscribeInvalidation = subscribeOpsInvalidation(() => {
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
      clearBurstInterval();
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [applyRealtimeEvent, clearBurstInterval, clearReloadTimer, enabled, scheduleBackgroundReload, shouldReloadOnEvent, staleTimeMs, startBurstPolling, runReload]);

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

  return { run, busy, error, setError };
}
