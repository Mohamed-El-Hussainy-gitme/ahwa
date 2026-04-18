import { z } from 'zod';
import { publishOpsEvent } from '@/lib/ops/events';
import {
  beginIdempotentMutation,
  type BegunIdempotentMutation,
  completeIdempotentMutation,
  releaseIdempotentMutation,
  requireOpsActorContext,
  requireOwnerRole,
} from '@/app/api/ops/_helpers';
import { closeShift, upsertShiftChecklist } from '@/lib/ops/owner-admin';
import { ShiftChecklistPayloadSchema } from '@/lib/ops/shift-checklists-schema';
import { apiFail } from '@/app/api/_shared';
import { NextResponse } from 'next/server';

const Input = z.object({
  shiftId: z.string().uuid().optional(),
  notes: z.string().trim().max(500).optional(),
  closingChecklist: ShiftChecklistPayloadSchema.optional(),
});

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return 'SHIFT_CLOSE_FAILED';
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = Input.safeParse(body);
  if (!parsed.success) {
    return apiFail(400, 'INVALID_INPUT', 'INVALID_INPUT');
  }

  let mutation: BegunIdempotentMutation | null = null;

  try {
    const ctx = requireOwnerRole(await requireOpsActorContext());

    const shiftId = parsed.data.shiftId ?? ctx.shiftId;
    if (!shiftId) {
      return apiFail(400, 'SHIFT_ID_REQUIRED', 'SHIFT_ID_REQUIRED');
    }

    const started = await beginIdempotentMutation(request, ctx, 'owner.shift.close', {
      shiftId,
      notes: parsed.data.notes ?? null,
    });
    if (started.replayResponse) {
      return started.replayResponse;
    }
    mutation = started.mutation;

    const warnings: string[] = [];
    if (parsed.data.closingChecklist) {
      try {
        await upsertShiftChecklist({
          cafeId: ctx.cafeId,
          databaseKey: ctx.databaseKey,
          shiftId,
          stage: 'closing',
          payload: { ...parsed.data.closingChecklist, status: 'draft' },
          actorOwnerId: ctx.actorOwnerId,
          actorStaffId: ctx.actorStaffId,
        });
      } catch (checklistError) {
        const checklistCode = checklistError instanceof Error && checklistError.message ? checklistError.message : 'SHIFT_CLOSING_CHECKLIST_SAVE_FAILED';
        warnings.push(checklistCode);
      }
    }

    const result = await closeShift({
      cafeId: ctx.cafeId,
      databaseKey: ctx.databaseKey,
      shiftId,
      ownerUserId: ctx.actorOwnerId,
      notes: parsed.data.notes ?? null,
    });

    if (parsed.data.closingChecklist) {
      try {
        await upsertShiftChecklist({
          cafeId: ctx.cafeId,
          databaseKey: ctx.databaseKey,
          shiftId,
          stage: 'closing',
          payload: { ...parsed.data.closingChecklist, status: 'completed' },
          actorOwnerId: ctx.actorOwnerId,
          actorStaffId: ctx.actorStaffId,
        });
      } catch (checklistError) {
        const checklistCode = checklistError instanceof Error && checklistError.message ? checklistError.message : 'SHIFT_CLOSING_CHECKLIST_COMPLETE_FAILED';
        warnings.push(checklistCode);
      }
    }

    publishOpsEvent({
      type: 'shift.closed',
      cafeId: ctx.cafeId,
      shiftId,
      entityId: shiftId,
    });

    const responseBody = { ok: true, shift: result, warnings };
    await completeIdempotentMutation(ctx, mutation, responseBody);
    return NextResponse.json(responseBody);
  } catch (error) {
    try {
      const ctx = requireOwnerRole(await requireOpsActorContext());
      await releaseIdempotentMutation(ctx, mutation);
    } catch {}

    const message = getErrorMessage(error);
    const code = /open service sessions exist/i.test(message)
      ? 'SHIFT_HAS_OPEN_SESSIONS'
      : message || 'SHIFT_CLOSE_FAILED';
    const userMessage = code === 'SHIFT_HAS_OPEN_SESSIONS'
      ? 'لا يمكن تقفيل الوردية لأن هناك جلسات ما زالت مفتوحة أو غير منتهية.'
      : code;
    return apiFail(400, code, userMessage);
  }
}
