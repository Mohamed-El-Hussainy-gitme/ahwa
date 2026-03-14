'use client';

import type { OpsRealtimeEvent } from './types';

type Listener = (event: OpsRealtimeEvent) => void;

type RealtimeState = {
  source: EventSource | null;
  listeners: Set<Listener>;
};

const state: RealtimeState = {
  source: null,
  listeners: new Set<Listener>(),
};

function handleEvent(event: MessageEvent<string>) {
  try {
    const payload = JSON.parse(event.data) as OpsRealtimeEvent;
    for (const listener of state.listeners) {
      listener(payload);
    }
  } catch {
    // Ignore malformed realtime payloads.
  }
}

function ensureSource() {
  if (state.source || typeof window === 'undefined') {
    return;
  }

  const source = new EventSource('/api/ops/events', { withCredentials: true });
  source.addEventListener('ops', handleEvent as EventListener);
  source.onerror = () => {
    if (source.readyState === EventSource.CLOSED) {
      state.source = null;
    }
  };
  state.source = source;
}

export function subscribeOpsRealtime(listener: Listener) {
  state.listeners.add(listener);
  ensureSource();

  return () => {
    state.listeners.delete(listener);

    if (!state.listeners.size && state.source) {
      state.source.close();
      state.source = null;
    }
  };
}
