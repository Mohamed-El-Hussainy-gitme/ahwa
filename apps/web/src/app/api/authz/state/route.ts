import { NextResponse } from 'next/server';
import { getEnrichedRuntimeMeFromCookie } from '@/lib/runtime/me';
import { readCurrentShiftState } from '@/lib/ops/owner-admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const me = await getEnrichedRuntimeMeFromCookie();
  if (!me) {
    return NextResponse.json({ ok: false, error: 'UNAUTHENTICATED' }, { status: 401 });
  }

  try {
    const state = await readCurrentShiftState(String(me.tenantId));
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
  } catch {
    return NextResponse.json({ ok: false, error: 'SHIFT_FETCH_FAILED' }, { status: 500 });
  }
}
