import { buildComplaintsWorkspace } from '@/app/api/ops/_server';
import { jsonError, ok, requireComplaintsAccess, requireOpsActorContext } from '@/app/api/ops/_helpers';

export async function POST() {
  try {
    const ctx = requireComplaintsAccess(await requireOpsActorContext());
    return ok(await buildComplaintsWorkspace(ctx.cafeId, ctx.databaseKey));
  } catch (e) {
    return jsonError(e, 400);
  }
}
