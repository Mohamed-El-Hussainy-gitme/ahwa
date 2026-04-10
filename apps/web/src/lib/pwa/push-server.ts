import webpush from 'web-push';
import { adminOps } from '@/app/api/ops/_server';
import type { ShiftRole } from '@/lib/authz/policy';

const ELIGIBLE_PUSH_ROLES = new Set<ShiftRole>(['waiter', 'american_waiter', 'barista', 'shisha']);
let vapidConfigured = false;

export type OpsPushNotificationPayload = {
  title: string;
  body: string;
  tag: string;
  url: string;
  signal: 'station-order' | 'waiter-ready';
  requireInteraction?: boolean;
};

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
};

function env(name: string): string {
  return String(process.env[name] ?? '').trim();
}

function ensureVapidConfiguration() {
  if (vapidConfigured) return true;
  const subject = env('AHWA_PWA_PUSH_VAPID_SUBJECT');
  const publicKey = env('AHWA_PWA_PUSH_PUBLIC_KEY');
  const privateKey = env('AHWA_PWA_PUSH_PRIVATE_KEY');
  if (!subject || !publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

export function getPublicPushKey() {
  return env('AHWA_PWA_PUSH_PUBLIC_KEY');
}

export function isPushSupportedServerSide() {
  return Boolean(getPublicPushKey()) && ensureVapidConfiguration();
}

function normalizeRoles(roles: readonly ShiftRole[]) {
  return Array.from(new Set(roles.filter((role) => ELIGIBLE_PUSH_ROLES.has(role))));
}

async function markSubscriptionsInactive(databaseKey: string, ids: string[]) {
  if (!ids.length) return;
  await adminOps(databaseKey)
    .from('pwa_push_subscriptions')
    .update({ is_active: false, last_error_at: new Date().toISOString() })
    .in('id', ids);
}

export async function sendOpsPushToRoles(input: {
  cafeId: string;
  databaseKey: string;
  shiftId?: string | null;
  roles: readonly ShiftRole[];
  payload: OpsPushNotificationPayload;
}) {
  const roles = normalizeRoles(input.roles);
  const shiftId = String(input.shiftId ?? '').trim();
  if (!ensureVapidConfiguration() || !roles.length || !shiftId) return;

  const { data, error } = await adminOps(input.databaseKey)
    .from('pwa_push_subscriptions')
    .select('id, endpoint, p256dh_key, auth_key')
    .eq('cafe_id', input.cafeId)
    .eq('shift_id', shiftId)
    .eq('is_active', true)
    .in('role_code', roles)
    .limit(64);

  if (error || !(data ?? []).length) return;

  const payloadText = JSON.stringify({
    title: input.payload.title,
    body: input.payload.body,
    tag: input.payload.tag,
    url: input.payload.url,
    signal: input.payload.signal,
    requireInteraction: input.payload.requireInteraction ?? true,
    ts: Date.now(),
  });

  const staleIds = [];
  await Promise.allSettled(
    ((data ?? []) as PushSubscriptionRow[]).map(async (row) => {
      try {
        await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh_key, auth: row.auth_key } }, payloadText, { TTL: 30, urgency: 'high', topic: input.payload.tag });
      } catch (error) {
        const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error ? Number((error as { statusCode?: unknown }).statusCode ?? 0) : 0;
        if (statusCode === 404 || statusCode === 410) staleIds.push(row.id);
      }
    }),
  );

  if (staleIds.length) await markSubscriptionsInactive(input.databaseKey, staleIds);
}
