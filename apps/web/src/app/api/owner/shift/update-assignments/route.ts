import { NextResponse } from 'next/server';
import { requireOpsActorContext, requireOwnerOrManager } from '@/app/api/ops/_helpers';
import { readCurrentShiftState, updateOpenShiftAssignments } from '@/lib/ops/owner-admin';

type ShiftRole = 'supervisor' | 'waiter' | 'barista' | 'shisha' | 'american_waiter';

export async function POST(request: Request) {
  try {
    const ctx = requireOwnerOrManager(await requireOpsActorContext());
    const body = (await request.json().catch(() => ({}))) as {
      shiftId?: string;
      assignments?: Array<{ userId?: string; role?: ShiftRole; actorType?: 'owner' | 'staff' }>;
    };
    const shiftId = String(body.shiftId ?? '').trim();
    if (!shiftId || !Array.isArray(body.assignments)) {
      return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
    }
    const state = await readCurrentShiftState({ cafeId: ctx.cafeId, databaseKey: ctx.databaseKey });
    if (!state.shift || state.shift.id !== shiftId || state.shift.status !== 'open') {
      return NextResponse.json({ ok: false, error: 'NO_OPEN_SHIFT' }, { status: 409 });
    }
    const assignments = body.assignments
      .map((item) => ({
        userId: String(item.userId ?? '').trim(),
        role: item.role,
        actorType: item.actorType === 'owner' ? 'owner' : 'staff',
      }))
      .filter((item): item is { userId: string; role: ShiftRole; actorType: 'owner' | 'staff' } => !!item.userId && !!item.role);
    if (assignments.filter((item) => item.role === 'supervisor').length !== 1) {
      return NextResponse.json({ ok: false, error: 'SHIFT_SUPERVISOR_REQUIRED' }, { status: 400 });
    }
    await updateOpenShiftAssignments({ cafeId: ctx.cafeId, databaseKey: ctx.databaseKey, shiftId, assignments });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'SHIFT_ASSIGNMENTS_UPDATE_FAILED';
    return NextResponse.json({ ok: false, error: code }, { status: 400 });
  }
}
