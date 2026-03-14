import { z } from 'zod';
import { publishOpsEvent } from '@/lib/ops/events';
import { requireOpsActorContext, requireOwnerRole } from '@/app/api/ops/_helpers';
import { closeShift } from '@/lib/ops/owner-admin';
import { apiFail } from '@/app/api/_shared';
import { NextResponse } from 'next/server';

const Input = z.object({
  shiftId: z.string().uuid().optional(),
  notes: z.string().trim().max(500).optional(),
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

  try {
    const ctx = requireOwnerRole(await requireOpsActorContext());

    const shiftId = parsed.data.shiftId ?? ctx.shiftId;
    if (!shiftId) {
      return apiFail(400, 'SHIFT_ID_REQUIRED', 'SHIFT_ID_REQUIRED');
    }

    const result = await closeShift({
      cafeId: ctx.cafeId,
      shiftId,
      ownerUserId: ctx.actorOwnerId,
      notes: parsed.data.notes ?? null,
    });

    publishOpsEvent({
      type: 'shift.closed',
      cafeId: ctx.cafeId,
      shiftId,
      entityId: shiftId,
    });

    return NextResponse.json({ ok: true, shift: result });
  } catch (error) {
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
