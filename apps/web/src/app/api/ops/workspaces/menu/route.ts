import { buildMenuWorkspace } from '@/app/api/ops/_server';
import { jsonError, ok, requireOwnerRole, requireOpsActorContext } from '@/app/api/ops/_helpers';

export async function POST() {
  try {
    const ctx = requireOwnerRole(await requireOpsActorContext());
    return ok(await buildMenuWorkspace(ctx.cafeId, ctx.databaseKey));
  } catch (error) {
    return jsonError(error, 400);
  }
}
