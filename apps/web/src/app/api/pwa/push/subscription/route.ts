import { NextRequest } from 'next/server';
import { adminOps } from '@/app/api/ops/_server';
import { jsonWithRequestId, getRequestIdFromHeaders } from '@/lib/observability/http';
import { beginServerObservation, logServerObservation } from '@/lib/observability/server';
import { readCurrentShiftState } from '@/lib/ops/owner-admin';
import type { ShiftRole } from '@/lib/authz/policy';
import { getEnrichedRuntimeMeFromCookie, isSupportRuntimeSessionError, isUnboundRuntimeSessionError } from '@/lib/runtime/me';

type PushSubscriptionBody = { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
type SubscribeRequestBody = { role?: ShiftRole; shiftId?: string; subscription?: PushSubscriptionBody };
const ELIGIBLE_ROLES = new Set<ShiftRole>(['waiter', 'american_waiter', 'barista', 'shisha']);

async function resolveRuntimeContext() {
  const me = await getEnrichedRuntimeMeFromCookie();
  if (!me) return null;
  const databaseKey = String(me.databaseKey ?? '').trim();
  if (!databaseKey) throw new Error('UNBOUND_RUNTIME_SESSION');
  const state = await readCurrentShiftState({ cafeId: String(me.tenantId), databaseKey });
  const shiftId = state.shift?.status === 'open' ? String(state.shift.id) : '';
  const assignment = shiftId ? state.assignments.find((item) => item.userId === String(me.userId) && item.isActive) : null;
  return { me, databaseKey, currentShiftId: shiftId || null, currentRole: assignment?.role ?? null };
}

async function deactivateCurrentUserSubscriptions(databaseKey: string, cafeId: string, userId: string) {
  await adminOps(databaseKey).from('pwa_push_subscriptions').update({ is_active: false, updated_at: new Date().toISOString() }).eq('cafe_id', cafeId).eq('user_id', userId);
}

export async function POST(req: NextRequest) {
  const requestId = getRequestIdFromHeaders(req.headers);
  const observation = beginServerObservation('pwa.push.subscription.upsert', undefined, requestId);

  try {
    const runtime = await resolveRuntimeContext();
    if (!runtime) {
      logServerObservation(observation, 'error', { status: 401, code: 'UNAUTHENTICATED' });
      return jsonWithRequestId({ ok: false, error: 'UNAUTHENTICATED' }, requestId, { status: 401 });
    }
    const body = (await req.json().catch(() => ({}))) as SubscribeRequestBody;
    const requestedRole = body.role ?? null;
    const requestedShiftId = String(body.shiftId ?? '').trim();
    const endpoint = String(body.subscription?.endpoint ?? '').trim();
    const p256dh = String(body.subscription?.keys?.p256dh ?? '').trim();
    const auth = String(body.subscription?.keys?.auth ?? '').trim();
    if (!requestedRole || !ELIGIBLE_ROLES.has(requestedRole) || !requestedShiftId || !endpoint || !p256dh || !auth) {
      logServerObservation(observation, 'error', { status: 400, code: 'INVALID_INPUT' });
      return jsonWithRequestId({ ok: false, error: 'INVALID_INPUT' }, requestId, { status: 400 });
    }
    if (!runtime.currentShiftId || runtime.currentShiftId !== requestedShiftId || runtime.currentRole !== requestedRole) {
      await deactivateCurrentUserSubscriptions(runtime.databaseKey, String(runtime.me.tenantId), String(runtime.me.userId));
      logServerObservation(observation, 'ok', {
        active: false,
        databaseKey: runtime.databaseKey,
        requestedRole,
        requestedShiftId,
        tenantId: runtime.me.tenantId,
        userId: runtime.me.userId,
      });
      return jsonWithRequestId({ ok: true, active: false }, requestId);
    }
    const { error } = await adminOps(runtime.databaseKey).from('pwa_push_subscriptions').upsert({
      cafe_id: String(runtime.me.tenantId), user_id: String(runtime.me.userId), shift_id: requestedShiftId, role_code: requestedRole,
      endpoint, p256dh_key: p256dh, auth_key: auth, is_active: true, last_seen_at: new Date().toISOString(),
      user_agent: req.headers.get('user-agent')?.slice(0, 512) ?? null,
    }, { onConflict: 'cafe_id,endpoint' });
    if (error) throw error;
    logServerObservation(observation, 'ok', {
      active: true,
      databaseKey: runtime.databaseKey,
      requestedRole,
      requestedShiftId,
      tenantId: runtime.me.tenantId,
      userId: runtime.me.userId,
    });
    return jsonWithRequestId({ ok: true, active: true }, requestId);
  } catch (error) {
    if (isUnboundRuntimeSessionError(error) || isSupportRuntimeSessionError(error)) {
      logServerObservation(observation, 'error', { status: 409, code: 'UNBOUND_RUNTIME_SESSION' });
      return jsonWithRequestId({ ok: false, error: 'UNBOUND_RUNTIME_SESSION' }, requestId, { status: 409 });
    }
    const message = error instanceof Error ? error.message : 'PUSH_SUBSCRIPTION_SAVE_FAILED';
    logServerObservation(observation, 'error', { status: 500, code: 'PUSH_SUBSCRIPTION_SAVE_FAILED', message });
    return jsonWithRequestId({ ok: false, error: message }, requestId, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const requestId = getRequestIdFromHeaders(req.headers);
  const observation = beginServerObservation('pwa.push.subscription.delete', undefined, requestId);

  try {
    const runtime = await resolveRuntimeContext();
    if (!runtime) {
      logServerObservation(observation, 'error', { status: 401, code: 'UNAUTHENTICATED' });
      return jsonWithRequestId({ ok: false, error: 'UNAUTHENTICATED' }, requestId, { status: 401 });
    }
    await deactivateCurrentUserSubscriptions(runtime.databaseKey, String(runtime.me.tenantId), String(runtime.me.userId));
    logServerObservation(observation, 'ok', {
      databaseKey: runtime.databaseKey,
      tenantId: runtime.me.tenantId,
      userId: runtime.me.userId,
    });
    return jsonWithRequestId({ ok: true }, requestId);
  } catch (error) {
    if (isUnboundRuntimeSessionError(error) || isSupportRuntimeSessionError(error)) {
      logServerObservation(observation, 'error', { status: 409, code: 'UNBOUND_RUNTIME_SESSION' });
      return jsonWithRequestId({ ok: false, error: 'UNBOUND_RUNTIME_SESSION' }, requestId, { status: 409 });
    }
    const message = error instanceof Error ? error.message : 'PUSH_SUBSCRIPTION_DELETE_FAILED';
    logServerObservation(observation, 'error', { status: 500, code: 'PUSH_SUBSCRIPTION_DELETE_FAILED', message });
    return jsonWithRequestId({ ok: false, error: message }, requestId, { status: 500 });
  }
}
