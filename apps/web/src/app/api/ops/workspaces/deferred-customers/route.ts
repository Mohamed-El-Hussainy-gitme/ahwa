import { buildDeferredCustomersWorkspace } from '@/app/api/ops/_server';
import { jsonError, ok, requireDeferredAccess, requireOpsActorContext } from '@/app/api/ops/_helpers';

export async function POST() {
  try {
    const ctx = requireDeferredAccess(await requireOpsActorContext());
    return ok({ items: await buildDeferredCustomersWorkspace(ctx.cafeId, ctx.databaseKey) });
  } catch (error) {
    return jsonError(error, 400);
  }
}
