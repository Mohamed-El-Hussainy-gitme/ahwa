'use client';

import { useCallback, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import type { ShiftRole } from '@/lib/authz/policy';
import type { OpsRealtimeEvent, StationCode } from '@/lib/ops/types';

const SOUND_COOLDOWN_MS = 1200;
const MAX_SEEN_EVENTS = 256;
const globalSignalLastPlayedAt: Record<OpsNotificationSignal, number> = { 'station-order': 0, 'waiter-ready': 0 };

export type OpsNotificationSignal = 'station-order' | 'waiter-ready';

type UseOpsRealtimeNotificationsInput = { enabled: boolean; role: ShiftRole | null; isOwner: boolean; };

let cachedAudioContext: AudioContext | null = null;
let unlockListenersAttached = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const WindowWithAudio = window as typeof window & { webkitAudioContext?: typeof AudioContext };
  const AudioContextCtor = window.AudioContext ?? WindowWithAudio.webkitAudioContext;
  if (!AudioContextCtor) return null;
  if (!cachedAudioContext) cachedAudioContext = new AudioContextCtor();
  return cachedAudioContext;
}
async function unlockAudioContext() {
  const context = getAudioContext();
  if (!context) return;
  if (context.state === 'suspended') { try { await context.resume(); } catch {} }
}
function ensureAudioUnlockListeners() {
  if (typeof window === 'undefined' || unlockListenersAttached) return;
  unlockListenersAttached = true;
  const unlock = () => { void unlockAudioContext(); };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
  window.addEventListener('touchstart', unlock, { passive: true });
}
function vibrate(pattern: number[]) {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try { navigator.vibrate(pattern); } catch {}
}
function scheduleTone(context: AudioContext, startAt: number, frequency: number, durationMs: number, gainValue: number) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(gainValue, startAt + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationMs / 1000);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + durationMs / 1000 + 0.03);
}
export async function playOpsNotificationSignal(signal: OpsNotificationSignal) {
  const now = Date.now();
  if (now - globalSignalLastPlayedAt[signal] < SOUND_COOLDOWN_MS) return;
  globalSignalLastPlayedAt[signal] = now;
  const context = getAudioContext();
  if (!context) return;
  if (context.state === 'suspended') { try { await context.resume(); } catch { return; } }
  const startAt = context.currentTime + 0.01;
  if (signal === 'station-order') {
    scheduleTone(context, startAt, 760, 180, 0.16);
    scheduleTone(context, startAt + 0.18, 980, 180, 0.16);
    scheduleTone(context, startAt + 0.36, 1240, 220, 0.18);
    vibrate([160, 70, 160, 70, 220]);
    return;
  }
  scheduleTone(context, startAt, 1180, 150, 0.15);
  scheduleTone(context, startAt + 0.16, 1480, 150, 0.15);
  scheduleTone(context, startAt + 0.34, 1760, 240, 0.17);
  vibrate([110, 40, 110, 40, 160]);
}
function normalizeStationCode(value: unknown): StationCode | null { return value === 'barista' || value === 'shisha' ? value : null; }
function resolveSignalForEvent(event: OpsRealtimeEvent, role: ShiftRole | null, isOwner: boolean, pathname: string): OpsNotificationSignal | null {
  if (!role || isOwner) return null;
  if (event.type === 'station.order_submitted') {
    const stationCode = normalizeStationCode(event.data?.stationCode);
    if (role === 'barista' && stationCode === 'barista') return 'station-order';
    if (role === 'shisha' && stationCode === 'shisha') return 'station-order';
    return null;
  }
  if (event.type === 'station.ready' && (role === 'waiter' || role === 'american_waiter') && pathname === '/ready') return 'waiter-ready';
  return null;
}
export function useOpsRealtimeNotifications(input: UseOpsRealtimeNotificationsInput) {
  const pathname = usePathname();
  const seenEventIdsRef = useRef<string[]>([]);
  const seenEventIdsSetRef = useRef<Set<string>>(new Set());
  const lastPlayedAtRef = useRef<Record<OpsNotificationSignal, number>>({ 'station-order': 0, 'waiter-ready': 0 });
  useEffect(() => { if (input.enabled) ensureAudioUnlockListeners(); }, [input.enabled]);
  return useCallback(async (event: OpsRealtimeEvent) => {
    if (!input.enabled) return;
    if (seenEventIdsSetRef.current.has(event.id)) return;
    seenEventIdsSetRef.current.add(event.id);
    seenEventIdsRef.current.push(event.id);
    while (seenEventIdsRef.current.length > MAX_SEEN_EVENTS) {
      const oldest = seenEventIdsRef.current.shift();
      if (oldest) seenEventIdsSetRef.current.delete(oldest);
    }
    const signal = resolveSignalForEvent(event, input.role, input.isOwner, pathname);
    if (!signal) return;
    const now = Date.now();
    if (now - lastPlayedAtRef.current[signal] < SOUND_COOLDOWN_MS) return;
    lastPlayedAtRef.current[signal] = now;
    await playOpsNotificationSignal(signal);
  }, [input.enabled, input.isOwner, input.role, pathname]);
}
