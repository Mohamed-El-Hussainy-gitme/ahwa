import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireFullOwnerRole, requireOpsActorContext } from '@/app/api/ops/_helpers';
import { createManagementAccount } from '@/lib/ops/owner-admin';
import { publishOpsEvent } from '@/lib/ops/events';

const Input = z.object({
  fullName: z.string().min(1),
  phone: z.string().min(1),
  password: z.string().min(4),
  ownerLabel: z.enum(['branch_manager']).default('branch_manager'),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = Input.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  }

  try {
    const ctx = requireFullOwnerRole(await requireOpsActorContext());
    const created = await createManagementAccount({
      cafeId: ctx.cafeId,
      databaseKey: ctx.databaseKey,
      actorOwnerId: ctx.actorOwnerId,
      fullName: parsed.data.fullName.trim(),
      phone: parsed.data.phone.trim(),
      password: parsed.data.password.trim(),
      ownerLabel: parsed.data.ownerLabel,
    });

    publishOpsEvent({
      type: 'runtime.owner.updated',
      cafeId: ctx.cafeId,
      shiftId: ctx.shiftId,
      entityId: created.ownerUserId,
      data: { ownerLabel: created.ownerLabel, action: 'management.create' },
    });

    return NextResponse.json({ ok: true, ownerUserId: created.ownerUserId, ownerLabel: created.ownerLabel });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'MANAGEMENT_CREATE_FAILED';
    return NextResponse.json({ ok: false, error: code }, { status: 400 });
  }
}
