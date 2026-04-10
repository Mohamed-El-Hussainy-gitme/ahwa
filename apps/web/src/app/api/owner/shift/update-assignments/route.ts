import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireManagementAccess, requireOpsActorContext } from '@/app/api/ops/_helpers';
import { replaceShiftAssignments } from '@/lib/ops/owner-admin';

const Body = z.object({
  shiftId: z.string().uuid(),
  assignments: z.array(z.object({
    userId: z.string().uuid(),
    role: z.enum(['supervisor', 'waiter', 'american_waiter', 'barista', 'shisha']),
    actorType: z.enum(['owner', 'staff']).optional(),
  })),
});

export async function POST(request: Request) {
  try {
    const ctx = requireManagementAccess(await requireOpsActorContext());
    const body = Body.parse(await request.json());

    const data = await replaceShiftAssignments({
      cafeId: ctx.cafeId,
      databaseKey: ctx.databaseKey,
      shiftId: body.shiftId,
      ownerUserId: ctx.actorOwnerId!,
      assignments: body.assignments,
    });

    return NextResponse.json({ ok: true, data, message: 'تم تحديث فريق الوردية بدون إغلاقها.' });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'SHIFT_ASSIGNMENTS_UPDATE_FAILED';
    return NextResponse.json({ ok: false, error: code }, { status: 400 });
  }
}
