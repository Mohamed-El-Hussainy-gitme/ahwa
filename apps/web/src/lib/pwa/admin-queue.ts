'use client';

import { invalidateApiRequestCacheByTags } from '@/lib/http/client';
import { uniqueTags } from '@/lib/ops/cache-tags';
import { invalidateOpsWorkspaces } from '@/lib/ops/invalidation';
import { invalidateWorkspaceCacheByTags } from '@/lib/ops/workspace-cache';
import { readLocalStorage, removeLocalStorage, writeLocalStorage } from './storage';

const ADMIN_QUEUE_STORAGE_KEY = 'ahwa:pwa:admin-queue:v1';
const RETRYABLE_HTTP_STATUSES = new Set([408, 409, 425, 429]);
const RETRY_BACKOFF_STEPS_MS = [15_000, 45_000, 120_000, 300_000] as const;

type AdminQueueEntry = {
  id: string;
  label: string;
  url: string;
  method: 'POST' | 'PATCH';
  body: unknown;
  invalidateTags: string[];
  clearDraftKeys?: string[];
  createdAt: number;
  attempts: number;
  nextRetryAt: number | null;
  lastError: string | null;
};

type AdminQueueSnapshot = {
  queue: AdminQueueEntry[];
  syncing: boolean;
  lastSyncAt: number | null;
  lastError: string | null;
  nextRetryAt: number | null;
};

type QueueListener = (snapshot: AdminQueueSnapshot) => void;

class QueueRequestError extends Error {
  status: number;
  retryable: boolean;

  constructor(message: string, status: number, retryable: boolean) {
    super(message);
    this.name = 'QueueRequestError';
    this.status = status;
    this.retryable = retryable;
  }
}

const listeners = new Set<QueueListener>();
let inMemoryState: AdminQueueSnapshot = {
  queue: [],
  syncing: false,
  lastSyncAt: null,
  lastError: null,
  nextRetryAt: null,
};
let loaded = false;
let activeFlush: Promise<void> | null = null;
let retryTimer: number | null = null;

function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  const stored = readLocalStorage<Partial<AdminQueueSnapshot>>(ADMIN_QUEUE_STORAGE_KEY, {});
  const queue = Array.isArray(stored.queue) ? stored.queue.map((entry) => ({
    ...entry,
    attempts: typeof entry.attempts === 'number' ? entry.attempts : 0,
    nextRetryAt: typeof entry.nextRetryAt === 'number' ? entry.nextRetryAt : null,
    lastError: typeof entry.lastError === 'string' ? entry.lastError : null,
  })) : [];
  inMemoryState = {
    queue,
    syncing: Boolean(stored.syncing),
    lastSyncAt: typeof stored.lastSyncAt === 'number' ? stored.lastSyncAt : null,
    lastError: typeof stored.lastError === 'string' ? stored.lastError : null,
    nextRetryAt: queue[0]?.nextRetryAt ?? null,
  };
}

function publish() {
  inMemoryState = {
    ...inMemoryState,
    nextRetryAt: inMemoryState.queue[0]?.nextRetryAt ?? null,
  };
  writeLocalStorage(ADMIN_QUEUE_STORAGE_KEY, inMemoryState);
  for (const listener of listeners) {
    listener(inMemoryState);
  }
}

function clearRetryTimer() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

function scheduleRetryIfNeeded() {
  clearRetryTimer();
  const nextRetryAt = inMemoryState.queue[0]?.nextRetryAt ?? null;
  if (!nextRetryAt || typeof window === 'undefined') {
    return;
  }
  const waitMs = Math.max(0, nextRetryAt - Date.now());
  retryTimer = window.setTimeout(() => {
    retryTimer = null;
    void flushAdminQueue();
  }, waitMs);
}

function setState(next: Partial<AdminQueueSnapshot>) {
  ensureLoaded();
  inMemoryState = { ...inMemoryState, ...next };
  publish();
  scheduleRetryIfNeeded();
}

function getErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === 'object') {
    const candidate = payload as { error?: string | { message?: string; code?: string }; message?: string };
    if (typeof candidate.error === 'string' && candidate.error.trim()) return candidate.error;
    if (candidate.error && typeof candidate.error === 'object') {
      if (typeof candidate.error.message === 'string' && candidate.error.message.trim()) return candidate.error.message;
      if (typeof candidate.error.code === 'string' && candidate.error.code.trim()) return candidate.error.code;
    }
    if (typeof candidate.message === 'string' && candidate.message.trim()) return candidate.message;
  }
  return fallback;
}

function removeDraftKeys(keys?: string[]) {
  for (const key of keys ?? []) {
    removeLocalStorage(key);
  }
}

function isRetryableStatus(status: number) {
  return status >= 500 || RETRYABLE_HTTP_STATUSES.has(status);
}

function computeRetryDelayMs(attempts: number) {
  const index = Math.min(Math.max(attempts - 1, 0), RETRY_BACKOFF_STEPS_MS.length - 1);
  return RETRY_BACKOFF_STEPS_MS[index] ?? RETRY_BACKOFF_STEPS_MS[RETRY_BACKOFF_STEPS_MS.length - 1] ?? 300_000;
}

async function executeEntry(entry: AdminQueueEntry) {
  const response = await fetch(entry.url, {
    method: entry.method,
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(entry.body ?? {}),
    cache: 'no-store',
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new QueueRequestError(getErrorMessage(payload, `REQUEST_${response.status}`), response.status, isRetryableStatus(response.status));
  }
  invalidateApiRequestCacheByTags(entry.invalidateTags);
  invalidateWorkspaceCacheByTags(entry.invalidateTags);
  invalidateOpsWorkspaces(entry.invalidateTags);
  removeDraftKeys(entry.clearDraftKeys);
}

export function isOfflineLikeError(error: unknown) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return true;
  }
  if (error instanceof TypeError) return true;
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes('failed to fetch') || message.includes('networkerror') || message.includes('load failed') || message.includes('fetch');
  }
  return false;
}

export function getAdminQueueSnapshot() {
  ensureLoaded();
  return inMemoryState;
}

export function syncAdminQueueSnapshotFromStorage() {
  loaded = false;
  ensureLoaded();
  publish();
  return inMemoryState;
}

export function subscribeAdminQueue(listener: QueueListener) {
  ensureLoaded();
  listeners.add(listener);
  listener(inMemoryState);
  return () => {
    listeners.delete(listener);
  };
}

export function buildQueuedMutation(input: Omit<AdminQueueEntry, 'id' | 'createdAt' | 'invalidateTags' | 'attempts' | 'nextRetryAt' | 'lastError'> & { invalidateTags?: readonly string[] }) {
  return {
    ...input,
    id: typeof globalThis.crypto?.randomUUID === 'function' ? globalThis.crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
    createdAt: Date.now(),
    attempts: 0,
    nextRetryAt: null,
    lastError: null,
    invalidateTags: [...uniqueTags(input.invalidateTags ?? [])],
  } satisfies AdminQueueEntry;
}

export async function enqueueAdminMutation(entry: AdminQueueEntry) {
  ensureLoaded();
  const nextEntry = { ...entry, attempts: entry.attempts ?? 0, nextRetryAt: entry.nextRetryAt ?? null, lastError: entry.lastError ?? null };
  setState({
    queue: [...inMemoryState.queue, nextEntry],
    lastError: null,
  });
  if (typeof navigator === 'undefined' || navigator.onLine) {
    void flushAdminQueue();
  }
}

export async function flushAdminQueue() {
  ensureLoaded();
  if (activeFlush) return activeFlush;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    setState({ syncing: false, lastError: 'OFFLINE' });
    return;
  }
  activeFlush = (async () => {
    setState({ syncing: true, lastError: null });
    while (inMemoryState.queue.length > 0) {
      const current = inMemoryState.queue[0];
      if (!current) break;
      if (current.nextRetryAt && current.nextRetryAt > Date.now()) {
        setState({ syncing: false, lastError: current.lastError ?? null, nextRetryAt: current.nextRetryAt });
        return;
      }
      try {
        await executeEntry(current);
        setState({
          queue: inMemoryState.queue.slice(1),
          lastSyncAt: Date.now(),
          lastError: null,
        });
      } catch (error) {
        const isRetryableError = error instanceof QueueRequestError ? error.retryable : false;
        if (isOfflineLikeError(error) || isRetryableError) {
          const attempts = current.attempts + 1;
          const nextRetryAt = Date.now() + computeRetryDelayMs(attempts);
          setState({
            queue: [{
              ...current,
              attempts,
              nextRetryAt,
              lastError: error instanceof Error ? error.message : 'QUEUE_SYNC_FAILED',
            }, ...inMemoryState.queue.slice(1)],
            syncing: false,
            lastError: error instanceof Error ? error.message : 'QUEUE_SYNC_FAILED',
            lastSyncAt: Date.now(),
            nextRetryAt,
          });
          return;
        }
        setState({
          queue: inMemoryState.queue.slice(1),
          lastError: error instanceof Error ? error.message : 'QUEUE_SYNC_FAILED',
          lastSyncAt: Date.now(),
        });
      }
    }
    setState({ syncing: false, lastError: null, lastSyncAt: Date.now(), nextRetryAt: null });
  })().finally(() => {
    activeFlush = null;
    if (inMemoryState.syncing) {
      setState({ syncing: false });
    }
  });
  return activeFlush;
}
