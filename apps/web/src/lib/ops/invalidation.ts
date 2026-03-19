'use client';

type Listener = () => void;

const listeners = new Set<Listener>();

export function invalidateOpsWorkspaces() {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeOpsInvalidation(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
