'use client';

export type EligiblePushRole = 'waiter' | 'american_waiter' | 'barista' | 'shisha';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
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
    try { await current.unsubscribe(); } catch {}
  }
}

export async function syncOpsPushSubscription(input: { enabled: boolean; role: EligiblePushRole | null; shiftId: string | null; }) {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;

  if (!input.enabled || !input.role || !input.shiftId) {
    try { await fetch('/api/pwa/push/subscription', { method: 'DELETE' }); } catch {}
    try { await localUnsubscribe(); } catch {}
    return;
  }

  if (Notification.permission === 'denied') return;
  const publicKey = String(process.env.NEXT_PUBLIC_AHWA_PWA_PUSH_PUBLIC_KEY ?? '').trim();
  if (!publicKey) return;

  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') return;

  const registration = await registerServiceWorker();
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
  }

  await fetch('/api/pwa/push/subscription', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ role: input.role, shiftId: input.shiftId, subscription: subscription.toJSON() }),
  });
}
