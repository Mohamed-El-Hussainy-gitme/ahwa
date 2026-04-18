'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { buildQueuedMutation, enqueueAdminMutation, flushAdminQueue, getAdminQueueSnapshot, subscribeAdminQueue, syncAdminQueueSnapshotFromStorage } from './admin-queue';

type OpsPwaContextValue = {
  isOnline: boolean;
  queueSize: number;
  syncing: boolean;
  lastSyncAt: number | null;
  lastError: string | null;
  nextRetryAt: number | null;
  enqueueMutation: typeof enqueueAdminMutation;
  flushQueue: () => Promise<void>;
};

const OpsPwaContext = createContext<OpsPwaContextValue | null>(null);

export function OpsPwaProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState<boolean>(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [snapshot, setSnapshot] = useState(() => getAdminQueueSnapshot());

  useEffect(() => subscribeAdminQueue(setSnapshot), []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onOnline = () => {
      setIsOnline(true);
      void flushAdminQueue();
    };
    const onOffline = () => setIsOnline(false);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void flushAdminQueue();
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'ahwa:pwa:admin-queue:v1') {
        setSnapshot(syncAdminQueueSnapshotFromStorage());
      }
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisible);
    if (navigator.onLine) {
      void flushAdminQueue();
    }
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const flushQueue = useCallback(async () => {
    await flushAdminQueue();
  }, []);

  const enqueueMutation = useCallback<OpsPwaContextValue['enqueueMutation']>(async (entry) => {
    await enqueueAdminMutation(entry);
  }, []);

  const value = useMemo(() => ({
    isOnline,
    queueSize: snapshot.queue.length,
    syncing: snapshot.syncing,
    lastSyncAt: snapshot.lastSyncAt,
    lastError: snapshot.lastError,
    nextRetryAt: snapshot.nextRetryAt,
    enqueueMutation,
    flushQueue,
  }), [enqueueMutation, flushQueue, isOnline, snapshot.lastError, snapshot.lastSyncAt, snapshot.nextRetryAt, snapshot.queue.length, snapshot.syncing]);

  return <OpsPwaContext.Provider value={value}>{children}</OpsPwaContext.Provider>;
}

export function useOpsPwa() {
  const context = useContext(OpsPwaContext);
  if (!context) {
    throw new Error('OpsPwaProvider is required');
  }
  return context;
}

export { buildQueuedMutation };
