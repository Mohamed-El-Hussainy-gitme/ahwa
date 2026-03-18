import { buildWaiterWorkspace } from '@/app/api/ops/_server';
import { jsonError, ok, requireOpsActorContext, requireWaiterWorkspaceAccess } from '@/app/api/ops/_helpers';

export async function POST() {
  try {
    const ctx = requireWaiterWorkspaceAccess(await requireOpsActorContext());
    const scope = ctx.shiftRole === 'shisha'
      ? { productStationCodes: ['shisha'] as const, readyStationCodes: ['shisha'] as const, sessionItemStationCodes: ['shisha'] as const }
      : ctx.shiftRole === 'waiter'
        ? { readyStationCodes: ['barista', 'service'] as const, sessionItemStationCodes: ['barista', 'service'] as const }
        : {};

    return ok(await buildWaiterWorkspace(ctx.cafeId, ctx.databaseKey, scope));
  } catch (e) {
    return jsonError(e, 400);
  }
}
