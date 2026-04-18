import { NextResponse } from 'next/server';
import { requireOpsActorContext, requireOwnerOrSupervisor } from '@/app/api/ops/_helpers';
import { readCurrentShiftState, readShiftChecklists, upsertShiftChecklist } from '@/lib/ops/owner-admin';
import { ShiftChecklistPayloadSchema, ShiftChecklistStageSchema } from '@/lib/ops/shift-checklists-schema';
import { z } from 'zod';

const Input = z.object({
  shiftId: z.string().uuid().optional(),
  stage: ShiftChecklistStageSchema,
  payload: ShiftChecklistPayloadSchema,
});

export async function GET(request: Request) {
  try {
    const ctx = requireOwnerOrSupervisor(await requireOpsActorContext());
    const url = new URL(request.url);
    const shiftId = url.searchParams.get('shiftId');

    const resolvedShiftId = shiftId || (await readCurrentShiftState({ cafeId: ctx.cafeId, databaseKey: ctx.databaseKey })).shift?.id;
    if (!resolvedShiftId) {
      return NextResponse.json({ ok: true, checklists: [] });
    }

    const checklists = await readShiftChecklists({
      cafeId: ctx.cafeId,
      databaseKey: ctx.databaseKey,
      shiftId: resolvedShiftId,
    });

    return NextResponse.json({ ok: true, shiftId: resolvedShiftId, checklists });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'SHIFT_CHECKLISTS_READ_FAILED';
    return NextResponse.json({ ok: false, error: code }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = Input.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  }

  try {
    const ctx = requireOwnerOrSupervisor(await requireOpsActorContext());
    const resolvedShiftId = parsed.data.shiftId || (await readCurrentShiftState({ cafeId: ctx.cafeId, databaseKey: ctx.databaseKey })).shift?.id;
    if (!resolvedShiftId) {
      return NextResponse.json({ ok: false, error: 'SHIFT_ID_REQUIRED' }, { status: 400 });
    }

    const checklist = await upsertShiftChecklist({
      cafeId: ctx.cafeId,
      databaseKey: ctx.databaseKey,
      shiftId: resolvedShiftId,
      stage: parsed.data.stage,
      payload: parsed.data.payload,
      actorOwnerId: ctx.actorOwnerId,
      actorStaffId: ctx.actorStaffId,
    });

    return NextResponse.json({ ok: true, checklist });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'SHIFT_CHECKLISTS_WRITE_FAILED';
    return NextResponse.json({ ok: false, error: code }, { status: 400 });
  }
}
