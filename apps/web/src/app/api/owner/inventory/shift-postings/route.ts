import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsActorContext, requireOwnerRole } from '@/app/api/ops/_helpers';
import { buildShiftInventorySnapshot, postShiftInventorySnapshot } from '@/lib/ops/inventory';

const Input = z.object({
  shiftId: z.string().uuid(),
  notes: z.string().trim().max(500).optional(),
});

function getErrorCode(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
    return String((error as { message?: string }).message);
  }
  return 'SHIFT_INVENTORY_POST_FAILED';
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = Input.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  }

  try {
    const ctx = requireOwnerRole(await requireOpsActorContext());
    const posting = await postShiftInventorySnapshot({
      cafeId: ctx.cafeId,
      databaseKey: ctx.databaseKey,
      shiftId: parsed.data.shiftId,
      actorOwnerId: ctx.actorOwnerId,
      notes: parsed.data.notes ?? null,
    });
    const snapshot = await buildShiftInventorySnapshot({
      cafeId: ctx.cafeId,
      databaseKey: ctx.databaseKey,
      shiftId: parsed.data.shiftId,
      actorOwnerId: ctx.actorOwnerId,
      persist: true,
    });
    return NextResponse.json({ ok: true, posting, snapshot });
  } catch (error) {
    const code = getErrorCode(error);
    return NextResponse.json({ ok: false, error: code }, { status: 400 });
  }
}
