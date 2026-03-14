import { NextResponse } from 'next/server';
import { z } from 'zod';
import { publishOpsEvent } from '@/lib/ops/events';
import { requireOpsActorContext, requireOwnerRole } from '@/app/api/ops/_helpers';
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
    const ctx = requireOwnerRole(await requireOpsActorContext());

    const opened = await openShiftWithAssignments({
      cafeId: ctx.cafeId,
      ownerUserId: ctx.actorOwnerId,
      kind: parsed.data.kind,
      notes: parsed.data.notes ?? null,
      assignments: parsed.data.assignments,
    });

    publishOpsEvent({
      type: 'shift.opened',
      cafeId: ctx.cafeId,
      shiftId: opened.shiftId,
      entityId: opened.shiftId,
      data: { kind: parsed.data.kind, mode: opened.mode },
    });

    const message =
      opened.mode === 'resumed_closed'
        ? 'تمت متابعة آخر وردية مقفولة بالخطأ.'
        : opened.mode === 'resumed_open'
          ? 'الوردية الحالية كانت مفتوحة بالفعل وتمت المتابعة عليها.'
          : 'تم فتح الوردية.';

    return NextResponse.json({
      ok: true,
      shift: { id: opened.shiftId, kind: parsed.data.kind, status: 'open' },
      mode: opened.mode,
      message,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'SHIFT_OPEN_FAILED';
    const message =
      code === 'another_shift_is_already_open'
        ? 'هناك وردية مفتوحة بالفعل. لا يمكن فتح وردية ثانية قبل إنهائها.'
        : code === 'cannot_resume_shift_after_next_shift_started'
          ? 'لا يمكن متابعة هذه الوردية لأن الشيفت التالي بدأ بالفعل.'
          : code;
    return NextResponse.json({ ok: false, error: { code, message } }, { status: 400 });
  }
}
