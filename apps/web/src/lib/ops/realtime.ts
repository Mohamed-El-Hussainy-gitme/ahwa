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

type RealtimeState = {
  source: EventSource | null;
  listeners: Set<Listener>;
  statusListeners: Set<StatusListener>;
  snapshot: RealtimeSnapshot;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  reconnectAttempts: number;
};

const state: RealtimeState = {
  source: null,
  listeners: new Set<Listener>(),
  statusListeners: new Set<StatusListener>(),
  snapshot: {
    state: 'idle',
    lastEventAt: null,
    lastConnectAt: null,
    lastErrorAt: null,
  },
  reconnectTimer: null,
  reconnectAttempts: 0,
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

function clearReconnectTimer() {
  if (state.reconnectTimer) {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }
}

function scheduleReconnect() {
  if (typeof window === 'undefined' || state.reconnectTimer || !state.listeners.size) {
    return;
  }

  const attempt = Math.min(state.reconnectAttempts + 1, 6);
  state.reconnectAttempts = attempt;
  const delay = Math.min(1000 * 2 ** (attempt - 1), 30000);
  setSnapshot({ state: 'reconnecting' });
  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null;
    ensureSource();
  }, delay);
}

function disposeSource() {
  if (state.source) {
    state.source.close();
    state.source = null;
  }
}

function handleEvent(event: MessageEvent<string>) {
  try {
    const payload = JSON.parse(event.data) as OpsRealtimeEvent;
    setSnapshot({ lastEventAt: Date.now() });
    for (const listener of state.listeners) {
      listener(payload);
    }
  } catch {
    // Ignore malformed realtime payloads.
  }
}

function ensureSource() {
  if (state.source || typeof window === 'undefined' || !state.listeners.size || !isDocumentVisible()) {
    return;
  }

  clearReconnectTimer();
  setSnapshot({ state: state.snapshot.lastConnectAt ? 'reconnecting' : 'connecting' });

  const source = new EventSource('/api/ops/events', { withCredentials: true });

  source.onopen = () => {
    state.reconnectAttempts = 0;
    setSnapshot({
      state: 'connected',
      lastConnectAt: Date.now(),
    });
  };

  source.addEventListener('ops', handleEvent as EventListener);
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

export function subscribeOpsRealtime(listener: Listener) {
  state.listeners.add(listener);

  const onVisibilityChange = () => {
    if (isDocumentVisible()) {
      ensureSource();
      return;
    }

    clearReconnectTimer();
    disposeSource();
    setSnapshot({ state: state.listeners.size ? 'idle' : 'disconnected' });
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  ensureSource();

  return () => {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    }
    state.listeners.delete(listener);

    if (!state.listeners.size) {
      clearReconnectTimer();
      disposeSource();
      setSnapshot({ state: 'disconnected' });
    }
  };
}

export function getOpsRealtimeSnapshot(): RealtimeSnapshot {
  return { ...state.snapshot };
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
