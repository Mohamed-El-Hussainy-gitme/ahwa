import { NextResponse } from 'next/server';
import { clearRuntimeSessionCookie } from '@/lib/auth/cookies';
import {
  getEnrichedRuntimeMeFromCookie,
  isSupportRuntimeSessionError,
  isUnboundRuntimeSessionError,
} from '@/lib/runtime/me';
import { readCurrentShiftState } from '@/lib/ops/owner-admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const me = await getEnrichedRuntimeMeFromCookie();
    if (!me) {
      const response = NextResponse.json({ ok: false, error: 'UNAUTHENTICATED' }, { status: 401 });
      clearRuntimeSessionCookie(response);
      return response;
    }

    const databaseKey = String(me.databaseKey ?? '').trim();
    if (!databaseKey) {
      const response = NextResponse.json({ ok: false, error: 'UNBOUND_RUNTIME_SESSION' }, { status: 409 });
      clearRuntimeSessionCookie(response);
      return response;
    }

    const state = await readCurrentShiftState({ cafeId: String(me.tenantId), databaseKey });
    const shift = state.shift;

    return NextResponse.json({
      ok: true,
      me: {
        userId: String(me.userId),
        fullName: me.fullName ?? null,
        accountKind: me.accountKind,
        ownerLabel: me.ownerLabel ?? null,
        shiftId: me.shiftId ?? null,
        shiftRole: me.shiftRole ?? null,
        actorOwnerId: me.actorOwnerId ?? null,
        actorStaffId: me.actorStaffId ?? null,
      },
      shift: shift
        ? {
            id: shift.id,
            kind: shift.kind,
            startedAt: shift.openedAt ? new Date(shift.openedAt).getTime() : Date.now(),
            endedAt: shift.closedAt ? new Date(shift.closedAt).getTime() : null,
            isOpen: shift.status === 'open',
            supervisorUserId: state.assignments.find((item) => item.role === 'supervisor')?.userId ?? null,
          }
        : null,
      assignments: state.assignments.map((item) => ({ userId: item.userId, role: item.role })),
    });
  } catch (error) {
    if (isUnboundRuntimeSessionError(error) || isSupportRuntimeSessionError(error)) {
      const response = NextResponse.json({ ok: false, error: 'UNBOUND_RUNTIME_SESSION' }, { status: 409 });
      clearRuntimeSessionCookie(response);
      return response;
    }
    const code = error instanceof Error ? error.message : 'SHIFT_FETCH_FAILED';
    return NextResponse.json({ ok: false, error: code }, { status: 500 });
  }
}
