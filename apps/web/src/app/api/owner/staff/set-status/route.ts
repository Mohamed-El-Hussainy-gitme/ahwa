import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsActorContext, requireOwnerRole } from '@/app/api/ops/_helpers';
import { setStaffMemberStatus } from '@/lib/ops/owner-admin';
import { publishOpsEvent } from '@/lib/ops/events';

const Input = z.object({
  userId: z.string().uuid(),
  employmentStatus: z.enum(['active', 'inactive', 'left']),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = Input.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  }

  try {
    const ctx = requireOwnerRole(await requireOpsActorContext());
    await setStaffMemberStatus(ctx.cafeId, parsed.data.userId, parsed.data.employmentStatus);
    publishOpsEvent({
      type: 'runtime.staff.updated',
      cafeId: ctx.cafeId,
      shiftId: ctx.shiftId,
      entityId: parsed.data.userId,
      data: { employmentStatus: parsed.data.employmentStatus },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'STAFF_STATUS_UPDATE_FAILED';
    return NextResponse.json({ ok: false, error: code }, { status: 400 });
  }
}
