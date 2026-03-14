'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { OpsRealtimeEvent } from './types';
import { subscribeOpsRealtime } from './realtime';

type WorkspaceOptions = {
  enabled?: boolean;
  shouldReloadOnEvent?: (event: OpsRealtimeEvent) => boolean;
};

export function useOpsWorkspace<T>(loader: () => Promise<T>, options: WorkspaceOptions = {}) {
  const { enabled = true, shouldReloadOnEvent } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) {
      return null;
    }

    setLoading(true);
    try {
      const next = await loader();
      setData(next);
      setError(null);
      return next;
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'REQUEST_FAILED';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [enabled, loader]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    return subscribeOpsRealtime((event) => {
      if (shouldReloadOnEvent && !shouldReloadOnEvent(event)) {
        return;
      }
      void reload();
    });
  }, [enabled, reload, shouldReloadOnEvent]);

  return useMemo(
    () => ({ data, setData, loading, error, reload }),
    [data, loading, error, reload],
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
