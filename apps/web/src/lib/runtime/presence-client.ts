"use client";

import type { ShiftRole } from '@/lib/authz/policy';

const DEVICE_STORAGE_KEY = 'ahwa.runtime.device-id.v1';
const PRESENCE_THROTTLE_MS = 5_000;

declare global {
  // eslint-disable-next-line no-var
  var __ahwaPresenceThrottle__: Map<string, number> | undefined;
}

function canUseDom() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function getThrottleCache() {
  if (!globalThis.__ahwaPresenceThrottle__) {
    globalThis.__ahwaPresenceThrottle__ = new Map<string, number>();
  }
  return globalThis.__ahwaPresenceThrottle__;
}

export function getRuntimePresenceDeviceId(): string {
  if (!canUseDom()) {
    return 'server';
  }

  try {
    const cached = window.localStorage.getItem(DEVICE_STORAGE_KEY)?.trim();
    if (cached) {
      return cached;
    }
    const nextId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(DEVICE_STORAGE_KEY, nextId);
    return nextId;
  } catch {
    return `device-${Date.now()}`;
  }
}

export type RuntimePresenceReason = 'app_open' | 'visible' | 'heartbeat';

export type RuntimePresenceInput = {
  reason: RuntimePresenceReason;
  shiftId?: string | null;
  shiftRole?: ShiftRole | null;
};

export async function postRuntimePresence(input: RuntimePresenceInput): Promise<void> {
  if (!canUseDom()) return;

  const deviceId = getRuntimePresenceDeviceId();
  const pagePath = `${window.location.pathname}${window.location.search}`.slice(0, 512);
  const now = Date.now();
  const throttleKey = `${deviceId}:${input.reason}:${input.shiftId ?? ''}:${input.shiftRole ?? ''}:${pagePath}`;
  const throttleCache = getThrottleCache();
  const lastSentAt = throttleCache.get(throttleKey) ?? 0;
  if (now - lastSentAt < PRESENCE_THROTTLE_MS) {
    return;
  }
  throttleCache.set(throttleKey, now);

  await fetch('/api/runtime/presence', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    keepalive: true,
    body: JSON.stringify({
      deviceId,
      pagePath,
      reason: input.reason,
      shiftId: input.shiftId ?? null,
      shiftRole: input.shiftRole ?? null,
    }),
  }).catch(() => undefined);
}
