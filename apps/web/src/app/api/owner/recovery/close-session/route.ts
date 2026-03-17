import { z } from 'zod';
import { requireOpsActorContext, requireOwnerRole, publishOpsMutation } from '@/app/api/ops/_helpers';
import { closeRecoverableServiceSession } from '@/lib/ops/recovery';
import { apiFail } from '@/app/api/_shared';
import { NextResponse } from 'next/server';

const Input = z.object({
  serviceSessionId: z.string().uuid(),
  notes: z.string().trim().max(250).optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = Input.safeParse(body);
  if (!parsed.success) {
    return apiFail(400, 'INVALID_INPUT', 'INVALID_INPUT');
  }

  try {
    const ctx = requireOwnerRole(await requireOpsActorContext());
    await closeRecoverableServiceSession({
      cafeId: ctx.cafeId,
      databaseKey: ctx.databaseKey,
      serviceSessionId: parsed.data.serviceSessionId,
      ownerUserId: ctx.actorOwnerId,
      notes: parsed.data.notes ?? null,
    });

    publishOpsMutation(ctx, {
      type: 'recovery.session.closed',
      entityId: parsed.data.serviceSessionId,
    });

    return NextResponse.json({ ok: true, code: 'RECOVERY_SESSION_CLOSED' });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'RECOVERY_CLOSE_SESSION_FAILED';
    return apiFail(400, code, code);
  }
}
