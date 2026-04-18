'use client';

import { useEffect, useMemo, useState } from 'react';
import { useOpsWorkspace } from '@/lib/ops/hooks';
import type { OpsRealtimeEvent } from '@/lib/ops/types';
import { readLocalStorage, writeLocalStorage } from './storage';

type WorkspaceSnapshot<T> = {
  data: T;
  loadedAt: number;
};

type UseWorkspaceSnapshotOptions = {
  enabled?: boolean;
  shouldReloadOnEvent?: (event: OpsRealtimeEvent) => boolean;
  staleTimeMs?: number;
  realtimeDebounceMs?: number;
  pollIntervalMs?: number;
  pollWhenHidden?: boolean;
  cacheKey?: string;
  invalidationTags?: readonly string[];
  storageKey: string;
};

export function useWorkspaceSnapshot<T>(loader: Parameters<typeof useOpsWorkspace<T>>[0], options: UseWorkspaceSnapshotOptions) {
  const { storageKey, ...workspaceOptions } = options;
  const workspace = useOpsWorkspace<T>(loader, workspaceOptions);
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot<T> | null>(null);
  const [online, setOnline] = useState<boolean>(() => (typeof navigator === 'undefined' ? true : navigator.onLine));

  useEffect(() => {
    const stored = readLocalStorage<WorkspaceSnapshot<T> | null>(storageKey, null);
    setSnapshot(stored);
  }, [storageKey]);

  useEffect(() => {
    if (!workspace.data) return;
    const nextSnapshot = { data: workspace.data, loadedAt: workspace.lastLoadedAt ?? Date.now() } satisfies WorkspaceSnapshot<T>;
    setSnapshot(nextSnapshot);
    writeLocalStorage(storageKey, nextSnapshot);
  }, [workspace.data, workspace.lastLoadedAt, storageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const hasFallbackSnapshot = Boolean(snapshot?.data) && (!workspace.data || workspace.error !== null || online === false);
  const data = workspace.data ?? snapshot?.data ?? null;
  const error = hasFallbackSnapshot ? null : workspace.error;

  return useMemo(
    () => ({
      ...workspace,
      data,
      error,
      online,
      usingSnapshotFallback: hasFallbackSnapshot,
      snapshotLoadedAt: snapshot?.loadedAt ?? null,
    }),
    [workspace, data, error, online, hasFallbackSnapshot, snapshot?.loadedAt],
  );
}
