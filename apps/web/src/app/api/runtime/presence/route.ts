import { NextResponse } from 'next/server';
import { adminOps } from '@/app/api/ops/_server';
import { getEnrichedRuntimeMeFromCookie, isSupportRuntimeSessionError, isUnboundRuntimeSessionError } from '@/lib/runtime/me';
import type { ShiftRole } from '@/lib/authz/policy';

type PresenceBody = {
  deviceId?: string;
  pagePath?: string | null;
  reason?: 'app_open' | 'visible' | 'heartbeat';
  shiftId?: string | null;
  shiftRole?: ShiftRole | null;
};

function sanitizeReason(value: unknown): 'app_open' | 'visible' | 'heartbeat' {
  return value === 'app_open' || value === 'visible' || value === 'heartbeat' ? value : 'visible';
}

function sanitizeShiftRole(value: unknown): ShiftRole | null {
  return value === 'supervisor' || value === 'waiter' || value === 'barista' || value === 'shisha' || value === 'american_waiter'
    ? value
    : null;
}

export async function POST(request: Request) {
  try {
    const me = await getEnrichedRuntimeMeFromCookie();
    if (!me) {
      return NextResponse.json({ ok: false, error: 'UNAUTHENTICATED' }, { status: 401 });
    }

    const databaseKey = String(me.databaseKey ?? '').trim();
    if (!databaseKey) {
      return NextResponse.json({ ok: false, error: 'UNBOUND_RUNTIME_SESSION' }, { status: 409 });
    }

    const body = (await request.json().catch(() => ({}))) as PresenceBody;
    const deviceId = String(body.deviceId ?? '').trim().slice(0, 128);
    if (!deviceId) {
      return NextResponse.json({ ok: false, error: 'INVALID_DEVICE_ID' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const reason = sanitizeReason(body.reason);
    const shiftId = typeof body.shiftId === 'string' && body.shiftId.trim() ? body.shiftId.trim() : null;
    const shiftRole = sanitizeShiftRole(body.shiftRole);
    const pagePath = typeof body.pagePath === 'string' && body.pagePath.trim() ? body.pagePath.trim().slice(0, 512) : null;
    const actorType = me.supportAccess ? 'platform_support' : me.accountKind;
    const ownerLabel = me.ownerLabel ?? null;
    const userAgent = request.headers.get('user-agent')?.slice(0, 512) ?? null;
    const admin = adminOps(databaseKey);

    const updatePayload: Record<string, unknown> = {
      actor_type: actorType,
      owner_label: ownerLabel,
      shift_id: shiftId,
      shift_role: shiftRole,
      last_seen_at: now,
      last_visible_at: now,
      page_path: pagePath,
      user_agent: userAgent,
      updated_at: now,
    };

    if (reason === 'app_open') {
      updatePayload.last_app_opened_at = now;
    }

    const { data: updatedRows, error: updateError } = await admin
      .from('runtime_presence')
      .update(updatePayload)
      .eq('cafe_id', String(me.tenantId))
      .eq('runtime_user_id', String(me.userId))
      .eq('device_id', deviceId)
      .select('id')
      .limit(1);

    if (updateError) {
      throw updateError;
    }

    if (!updatedRows || updatedRows.length === 0) {
      const insertPayload = {
        cafe_id: String(me.tenantId),
        runtime_user_id: String(me.userId),
        device_id: deviceId,
        actor_type: actorType,
        owner_label: ownerLabel,
        shift_id: shiftId,
        shift_role: shiftRole,
        last_seen_at: now,
        last_app_opened_at: now,
        last_visible_at: now,
        page_path: pagePath,
        user_agent: userAgent,
        updated_at: now,
      };

      const { error: insertError } = await admin.from('runtime_presence').insert(insertPayload);
      if (insertError) {
        throw insertError;
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isUnboundRuntimeSessionError(error) || isSupportRuntimeSessionError(error)) {
      return NextResponse.json({ ok: false, error: 'UNBOUND_RUNTIME_SESSION' }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'RUNTIME_PRESENCE_FAILED' }, { status: 500 });
  }
}
