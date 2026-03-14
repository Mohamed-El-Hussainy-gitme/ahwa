import { NextResponse } from 'next/server';
import { z } from 'zod';
import { publishOpsEvent } from '@/lib/ops/events';
import { requireOpsActorContext } from '@/app/api/ops/_helpers';
import { openShiftWithAssignments } from '@/lib/ops/owner-admin';

const ShiftKind = z.enum(['morning', 'evening']);
const Input = z.object({
  kind: ShiftKind,
  notes: z.string().trim().max(500).optional(),
  assignments: z
    .array(
      z.object({
        userId: z.string().uuid(),
        role: z.enum(['supervisor', 'waiter', 'barista', 'shisha']),
      }),
    )
    .default([]),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = Input.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  }

  const supervisorCount = parsed.data.assignments.filter((item) => item.role === 'supervisor').length;
  if (supervisorCount !== 1) {
    return NextResponse.json({ ok: false, error: 'SUPERVISOR_REQUIRED' }, { status: 400 });
  }

  try {
    const ctx = await requireOpsActorContext();
    if (ctx.accountKind !== 'owner' || !ctx.actorOwnerId) {
      return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
    }

    const shiftId = await openShiftWithAssignments({
      cafeId: ctx.cafeId,
      ownerUserId: ctx.actorOwnerId,
      kind: parsed.data.kind,
      notes: parsed.data.notes ?? null,
      assignments: parsed.data.assignments,
    });

    publishOpsEvent({
      type: 'shift.opened',
      cafeId: ctx.cafeId,
      shiftId,
      entityId: shiftId,
      data: { kind: parsed.data.kind },
    });

    return NextResponse.json({ ok: true, shift: { id: shiftId, kind: parsed.data.kind, status: 'open' } });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'SHIFT_OPEN_FAILED';
    return NextResponse.json({ ok: false, error: code }, { status: 400 });
  }
}
