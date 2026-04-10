import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsActorContext, requireManagementAccess } from '@/app/api/ops/_helpers';
import { setStaffMemberPin } from '@/lib/ops/owner-admin';
import { publishOpsEvent } from '@/lib/ops/events';

const Input = z.object({
  userId: z.string().uuid(),
  pin: z.string().min(4),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = Input.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  }

  try {
    const ctx = requireManagementAccess(await requireOpsActorContext());

    await setStaffMemberPin({
      cafeId: ctx.cafeId,
      databaseKey: ctx.databaseKey,
      staffMemberId: parsed.data.userId,
      pin: parsed.data.pin.trim(),
    });
    publishOpsEvent({
      type: 'runtime.staff.updated',
      cafeId: ctx.cafeId,
      shiftId: ctx.shiftId,
      entityId: parsed.data.userId,
      data: { pinReset: true },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'PIN_RESET_FAILED';
    return NextResponse.json({ ok: false, error: code }, { status: 400 });
  }
}
