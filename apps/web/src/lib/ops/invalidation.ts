'use client';

type Listener = (tags?: readonly string[]) => void;

const listeners = new Set<Listener>();

export function invalidateOpsWorkspaces(tags?: readonly string[]) {
  for (const listener of listeners) {
    listener(tags);
  }
}

export function subscribeOpsInvalidation(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
