import { buildWaiterCatalogWorkspace } from '@/app/api/ops/_server';
import { jsonError, ok, requireOpsActorContext, requireWaiterWorkspaceAccess } from '@/app/api/ops/_helpers';

export async function POST() {
  try {
    const ctx = requireWaiterWorkspaceAccess(await requireOpsActorContext());
    const scope = ctx.shiftRole === 'shisha'
      ? { productStationCodes: ['shisha'] as const }
      : {};

    return ok(await buildWaiterCatalogWorkspace(ctx.cafeId, ctx.databaseKey, scope));
  } catch (e) {
    return jsonError(e, 400);
  }
}
