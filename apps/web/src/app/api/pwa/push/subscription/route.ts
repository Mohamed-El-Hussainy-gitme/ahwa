import { NextResponse } from 'next/server';
import { adminOps } from '@/app/api/ops/_server';
import { getEnrichedRuntimeMeFromCookie, isSupportRuntimeSessionError, isUnboundRuntimeSessionError } from '@/lib/runtime/me';
import { readCurrentShiftState } from '@/lib/ops/owner-admin';
import type { ShiftRole } from '@/lib/authz/policy';

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

export async function POST(req: Request) {
  try {
    const runtime = await resolveRuntimeContext();
    if (!runtime) return NextResponse.json({ ok: false, error: 'UNAUTHENTICATED' }, { status: 401 });
    const body = (await req.json().catch(() => ({}))) as SubscribeRequestBody;
    const requestedRole = body.role ?? null;
    const requestedShiftId = String(body.shiftId ?? '').trim();
    const endpoint = String(body.subscription?.endpoint ?? '').trim();
    const p256dh = String(body.subscription?.keys?.p256dh ?? '').trim();
    const auth = String(body.subscription?.keys?.auth ?? '').trim();
    if (!requestedRole || !ELIGIBLE_ROLES.has(requestedRole) || !requestedShiftId || !endpoint || !p256dh || !auth) {
      return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
    }
    if (!runtime.currentShiftId || runtime.currentShiftId !== requestedShiftId || runtime.currentRole !== requestedRole) {
      await deactivateCurrentUserSubscriptions(runtime.databaseKey, String(runtime.me.tenantId), String(runtime.me.userId));
      return NextResponse.json({ ok: true, active: false });
    }
    const { error } = await adminOps(runtime.databaseKey).from('pwa_push_subscriptions').upsert({
      cafe_id: String(runtime.me.tenantId), user_id: String(runtime.me.userId), shift_id: requestedShiftId, role_code: requestedRole,
      endpoint, p256dh_key: p256dh, auth_key: auth, is_active: true, last_seen_at: new Date().toISOString(),
      user_agent: req.headers.get('user-agent')?.slice(0, 512) ?? null,
    }, { onConflict: 'cafe_id,endpoint' });
    if (error) throw error;
    return NextResponse.json({ ok: true, active: true });
  } catch (error) {
    if (isUnboundRuntimeSessionError(error) || isSupportRuntimeSessionError(error)) {
      return NextResponse.json({ ok: false, error: 'UNBOUND_RUNTIME_SESSION' }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'PUSH_SUBSCRIPTION_SAVE_FAILED' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const runtime = await resolveRuntimeContext();
    if (!runtime) return NextResponse.json({ ok: false, error: 'UNAUTHENTICATED' }, { status: 401 });
    await deactivateCurrentUserSubscriptions(runtime.databaseKey, String(runtime.me.tenantId), String(runtime.me.userId));
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isUnboundRuntimeSessionError(error) || isSupportRuntimeSessionError(error)) {
      return NextResponse.json({ ok: false, error: 'UNBOUND_RUNTIME_SESSION' }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'PUSH_SUBSCRIPTION_DELETE_FAILED' }, { status: 500 });
  }
}
