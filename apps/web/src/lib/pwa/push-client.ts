'use client';

export type EligiblePushRole = 'waiter' | 'american_waiter' | 'barista' | 'shisha';
export type OpsPushPermissionState = NotificationPermission | 'unsupported';

type SyncInput = { enabled: boolean; role: EligiblePushRole | null; shiftId: string | null; };

function isPushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export function getOpsPushPermissionState(): OpsPushPermissionState {
  if (!isPushSupported()) {
    return 'unsupported';
  }
  return Notification.permission;
}

async function registerServiceWorker() {
  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  return registration;
}

async function localUnsubscribe() {
  const registration = await navigator.serviceWorker.ready;
  const current = await registration.pushManager.getSubscription();
  if (current) {
    try {
      await current.unsubscribe();
    } catch {}
  }
}

async function clearPushSubscription() {
  try {
    await fetch('/api/pwa/push/subscription', { method: 'DELETE' });
  } catch {}
  try {
    await localUnsubscribe();
  } catch {}
}

export async function syncOpsPushSubscription(input: SyncInput): Promise<OpsPushPermissionState> {
  if (!isPushSupported()) {
    return 'unsupported';
  }

  if (!input.enabled || !input.role || !input.shiftId) {
    await clearPushSubscription();
    return getOpsPushPermissionState();
  }

  if (Notification.permission !== 'granted') {
    return Notification.permission;
  }

  const publicKey = String(process.env.NEXT_PUBLIC_AHWA_PWA_PUSH_PUBLIC_KEY ?? '').trim();
  if (!publicKey) {
    return Notification.permission;
  }

  const registration = await registerServiceWorker();
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  await fetch('/api/pwa/push/subscription', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ role: input.role, shiftId: input.shiftId, subscription: subscription.toJSON() }),
  });

  return 'granted';
}

export async function requestOpsPushPermissionAndSync(input: SyncInput): Promise<OpsPushPermissionState> {
  if (!isPushSupported()) {
    return 'unsupported';
  }

  let permission = Notification.permission;
  if (permission !== 'granted') {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') {
    return permission;
  }

  return syncOpsPushSubscription(input);
}
