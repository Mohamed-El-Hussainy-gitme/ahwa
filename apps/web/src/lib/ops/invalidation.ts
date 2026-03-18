'use client';

import type { OpsWorkspaceScope } from './workspaceScopes';

type InvalidationPayload = {
  scopes: OpsWorkspaceScope[];
  reason?: string;
  at: number;
};

type Listener = (payload: InvalidationPayload) => void;

const listeners = new Set<Listener>();

export function invalidateOpsWorkspaces(scopes: OpsWorkspaceScope[], reason?: string) {
  if (!scopes.length) {
    return;
  }

  const payload: InvalidationPayload = {
    scopes: Array.from(new Set(scopes)),
    reason,
    at: Date.now(),
  };

  for (const listener of listeners) {
    listener(payload);
  }
}

export function subscribeOpsInvalidation(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export type { InvalidationPayload };
