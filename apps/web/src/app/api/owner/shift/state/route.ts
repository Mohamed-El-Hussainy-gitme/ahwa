import { NextResponse } from 'next/server';
import { requireOpsActorContext } from '@/app/api/ops/_helpers';
import { readCurrentShiftState } from '@/lib/ops/owner-admin';

export async function GET() {
  try {
    const ctx = await requireOpsActorContext();
    const allowed = ctx.accountKind === 'owner' || ctx.shiftRole === 'supervisor';
    if (!allowed) {
      return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
    }

    const state = await readCurrentShiftState(ctx.cafeId);
    if (!state.shift) {
      return NextResponse.json({ ok: true, shift: null, assignments: [] });
    }

    return NextResponse.json({
      ok: true,
      shift: {
        id: state.shift.id,
        kind: state.shift.kind,
        businessDate: state.shift.businessDate,
        status: state.shift.status,
        isOpen: state.shift.status === 'open',
        startedAt: state.shift.openedAt,
        closedAt: state.shift.closedAt,
        notes: state.shift.notes,
        supervisorUserId: state.assignments.find((item) => item.role === 'supervisor')?.userId ?? null,
      },
      assignments: state.assignments,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'SHIFT_STATE_FAILED';
    return NextResponse.json({ ok: false, error: code }, { status: 400 });
  }
}
