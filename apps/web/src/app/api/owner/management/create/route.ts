import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireFullOwnerRole, requireOpsActorContext } from '@/app/api/ops/_helpers';
import { createManagementAccount } from '@/lib/ops/owner-admin';

const Body = z.object({
  fullName: z.string().min(2),
  phone: z.string().min(5),
  password: z.string().min(4),
  ownerLabel: z.enum(['partner', 'branch_manager']),
});

export async function POST(request: Request) {
  try {
    const ctx = requireFullOwnerRole(await requireOpsActorContext());
    const body = Body.parse(await request.json());

    const result = await createManagementAccount({
      cafeId: ctx.cafeId,
      databaseKey: ctx.databaseKey,
      createdByOwnerId: ctx.actorOwnerId,
      fullName: body.fullName.trim(),
      phone: body.phone.trim(),
      password: body.password,
      ownerLabel: body.ownerLabel,
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'MANAGEMENT_CREATE_FAILED';
    return NextResponse.json({ ok: false, error: code }, { status: 400 });
  }
}
