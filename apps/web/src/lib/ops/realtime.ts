'use client';

import { useEffect, useState } from 'react';
import type { OpsRealtimeEvent } from './types';

type Listener = (event: OpsRealtimeEvent) => void;
type StatusListener = (state: RealtimeSnapshot) => void;

export type RealtimeConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export type RealtimeSnapshot = {
  state: RealtimeConnectionState;
  lastEventAt: number | null;
  lastConnectAt: number | null;
  lastErrorAt: number | null;
};

const HEALTHY_CONNECTION_IDLE_WINDOW_MS = 45_000;
const VISIBILITY_DISCONNECT_GRACE_MS = 20_000;

const state = {
  source: null as EventSource | null,
  listeners: new Set<Listener>(),
  statusListeners: new Set<StatusListener>(),
  snapshot: {
    state: 'idle',
    lastEventAt: null,
    lastConnectAt: null,
    lastErrorAt: null,
  } as RealtimeSnapshot,
  reconnectTimer: null as number | null,
  reconnectAttempts: 0,
  visibilityHandlerAttached: false,
  onlineHandlerAttached: false,
  hiddenDisconnectTimer: null as number | null,
  lastCursor: null as string | null,
};

function isDocumentVisible() {
  return typeof document === 'undefined' || document.visibilityState === 'visible';
}

function emitStatus() {
  const snapshot = { ...state.snapshot };
  for (const listener of state.statusListeners) {
    listener(snapshot);
  }
}

function setSnapshot(next: Partial<RealtimeSnapshot>) {
  state.snapshot = { ...state.snapshot, ...next };
  emitStatus();
}

function markRealtimeActivity() {
  setSnapshot({ lastEventAt: Date.now() });
}

function clearReconnectTimer() {
  if (state.reconnectTimer) {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }
}

function clearHiddenDisconnectTimer() {
  if (state.hiddenDisconnectTimer) {
    clearTimeout(state.hiddenDisconnectTimer);
    state.hiddenDisconnectTimer = null;
  }
}

function detachVisibilityHandler() {
  if (typeof document === 'undefined' || !state.visibilityHandlerAttached) {
    return;
  }
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  state.visibilityHandlerAttached = false;
}

function attachVisibilityHandler() {
  if (typeof document === 'undefined' || state.visibilityHandlerAttached) {
    return;
  }
  document.addEventListener('visibilitychange', handleVisibilityChange);
  state.visibilityHandlerAttached = true;
}

function handleOnline() {
  if (!state.listeners.size) {
    return;
  }
  clearReconnectTimer();
  clearHiddenDisconnectTimer();
  ensureSource();
}

function handleOffline() {
  clearReconnectTimer();
  clearHiddenDisconnectTimer();
  disposeSource();
  setSnapshot({ state: state.listeners.size ? 'reconnecting' : 'disconnected', lastErrorAt: Date.now() });
}

function detachOnlineHandler() {
  if (typeof window === 'undefined' || !state.onlineHandlerAttached) {
    return;
  }
  window.removeEventListener('online', handleOnline);
  window.removeEventListener('offline', handleOffline);
  state.onlineHandlerAttached = false;
}

function attachOnlineHandler() {
  if (typeof window === 'undefined' || state.onlineHandlerAttached) {
    return;
  }
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  state.onlineHandlerAttached = true;
}

function disposeSource() {
  if (state.source) {
    state.source.close();
    state.source = null;
  }
}

function scheduleReconnect() {
  if (typeof window === 'undefined' || state.reconnectTimer || !state.listeners.size || !isDocumentVisible()) {
    return;
  }

  const attempt = Math.min(state.reconnectAttempts + 1, 6);
  state.reconnectAttempts = attempt;
  const baseDelay = Math.min(1000 * 2 ** (attempt - 1), 30_000);
  const jitter = Math.floor(Math.random() * 250);
  setSnapshot({ state: 'reconnecting' });
  state.reconnectTimer = window.setTimeout(() => {
    state.reconnectTimer = null;
    ensureSource();
  }, baseDelay + jitter);
}

function ensureSource() {
  if (state.source || typeof window === 'undefined' || !state.listeners.size || !isDocumentVisible() || navigator.onLine === false) {
    return;
  }

  clearReconnectTimer();
  clearHiddenDisconnectTimer();
  setSnapshot({ state: state.snapshot.lastConnectAt ? 'reconnecting' : 'connecting' });

  const url = new URL('/api/ops/events', window.location.origin);
  if (state.lastCursor) {
    url.searchParams.set('cursor', state.lastCursor);
  }

  const source = new EventSource(url.toString(), { withCredentials: true });

  source.onopen = () => {
    state.reconnectAttempts = 0;
    const now = Date.now();
    setSnapshot({
      state: 'connected',
      lastConnectAt: now,
      lastEventAt: now,
    });
  };

  source.addEventListener('ready', () => {
    markRealtimeActivity();
  });

  source.addEventListener('ping', () => {
    markRealtimeActivity();
  });

  source.addEventListener('ops', ((event: MessageEvent<string>) => {
    try {
      const payload = JSON.parse(event.data) as OpsRealtimeEvent;
      state.lastCursor = payload.cursor ?? payload.id ?? state.lastCursor;
      markRealtimeActivity();
      for (const listener of state.listeners) {
        listener(payload);
      }
    } catch {
      // Ignore malformed realtime payloads.
    }
  }) as EventListener);

  source.addEventListener('reconnect', () => {
    setSnapshot({
      state: state.listeners.size ? 'reconnecting' : 'disconnected',
      lastErrorAt: Date.now(),
    });
  });

  source.onerror = () => {
    setSnapshot({
      state: state.listeners.size ? 'reconnecting' : 'disconnected',
      lastErrorAt: Date.now(),
    });
    disposeSource();
    scheduleReconnect();
  };

  state.source = source;
}

function handleVisibilityChange() {
  if (isDocumentVisible()) {
    clearHiddenDisconnectTimer();
    ensureSource();
    return;
  }

  clearReconnectTimer();
  clearHiddenDisconnectTimer();
  state.hiddenDisconnectTimer = window.setTimeout(() => {
    state.hiddenDisconnectTimer = null;
    if (isDocumentVisible()) {
      ensureSource();
      return;
    }
    disposeSource();
    setSnapshot({ state: state.listeners.size ? 'idle' : 'disconnected' });
  }, VISIBILITY_DISCONNECT_GRACE_MS);
}

export function subscribeOpsRealtime(listener: Listener) {
  state.listeners.add(listener);
  attachVisibilityHandler();
  attachOnlineHandler();
  ensureSource();

  return () => {
    state.listeners.delete(listener);

    if (!state.listeners.size) {
      clearReconnectTimer();
      clearHiddenDisconnectTimer();
      disposeSource();
      detachVisibilityHandler();
      detachOnlineHandler();
      setSnapshot({ state: 'disconnected' });
    }
  };
}

export function getOpsRealtimeSnapshot(): RealtimeSnapshot {
  return { ...state.snapshot };
}

export function isOpsRealtimeHealthy(snapshot: RealtimeSnapshot = state.snapshot) {
  if (snapshot.state !== 'connected') {
    return false;
  }

  const referenceTime = snapshot.lastEventAt ?? snapshot.lastConnectAt;
  if (referenceTime === null) {
    return false;
  }

  return Date.now() - referenceTime <= HEALTHY_CONNECTION_IDLE_WINDOW_MS;
}

export function subscribeOpsRealtimeStatus(listener: StatusListener) {
  state.statusListeners.add(listener);
  listener(getOpsRealtimeSnapshot());
  return () => {
    state.statusListeners.delete(listener);
  };
}

export function useOpsRealtimeStatus() {
  const [snapshot, setSnapshot] = useState<RealtimeSnapshot>(() => getOpsRealtimeSnapshot());

  useEffect(() => subscribeOpsRealtimeStatus(setSnapshot), []);

  return snapshot;
}
