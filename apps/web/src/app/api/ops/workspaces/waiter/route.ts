import { buildWaiterWorkspace } from '@/app/api/ops/_server';
import { jsonError, ok, requireOpsActorContext, requireWaiterWorkspaceAccess } from '@/app/api/ops/_helpers';
export async function POST() {
  try { const ctx = requireWaiterWorkspaceAccess(await requireOpsActorContext()); return ok(await buildWaiterWorkspace(ctx.cafeId, ctx.databaseKey)); }
  catch (e) { return jsonError(e, 400); }
}
