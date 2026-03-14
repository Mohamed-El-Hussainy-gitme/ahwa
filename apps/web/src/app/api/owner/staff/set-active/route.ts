import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsActorContext } from '@/app/api/ops/_helpers';
import { setStaffMemberActive } from '@/lib/ops/owner-admin';
import { publishOpsEvent } from '@/lib/ops/events';

const Input = z.object({
  userId: z.string().uuid(),
  isActive: z.boolean(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = Input.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  }

  try {
    const ctx = await requireOpsActorContext();
    if (ctx.accountKind !== 'owner' || !ctx.actorOwnerId) {
      return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
    }

    await setStaffMemberActive(ctx.cafeId, parsed.data.userId, parsed.data.isActive);
    publishOpsEvent({
      type: 'runtime.staff.updated',
      cafeId: ctx.cafeId,
      shiftId: ctx.shiftId,
      entityId: parsed.data.userId,
      data: { isActive: parsed.data.isActive },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'STAFF_UPDATE_FAILED';
    return NextResponse.json({ ok: false, error: code }, { status: 400 });
  }
}
