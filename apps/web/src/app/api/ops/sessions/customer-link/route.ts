import { z } from 'zod';
import { jsonError, ok, requireOpsActorContext, requireSessionOrderAccess } from '@/app/api/ops/_helpers';
import { linkCustomerToCurrentSession } from '@/lib/ops/owner-admin';

const Input = z.object({
  serviceSessionId: z.string().uuid(),
  customerId: z.string().uuid(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = Input.parse(body);
    const ctx = requireSessionOrderAccess(await requireOpsActorContext());
    await linkCustomerToCurrentSession({
      cafeId: ctx.cafeId,
      databaseKey: ctx.databaseKey,
      serviceSessionId: parsed.serviceSessionId,
      customerId: parsed.customerId,
      actorOwnerId: ctx.actorOwnerId,
      actorStaffId: ctx.actorStaffId,
    });
    return ok({ ok: true });
  } catch (error) {
    return jsonError(error, 400);
  }
}
