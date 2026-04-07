import { buildWaiterLiveWorkspace } from '@/app/api/ops/_server';
import { jsonError, ok, requireOpsActorContext, requireWaiterWorkspaceAccess } from '@/app/api/ops/_helpers';

export async function POST() {
  try {
    const ctx = requireWaiterWorkspaceAccess(await requireOpsActorContext());
    const scope = ctx.shiftRole === 'shisha'
      ? { readyStationCodes: ['shisha'] as const, sessionItemStationCodes: ['shisha'] as const }
      : ctx.shiftRole === 'waiter'
        ? { readyStationCodes: ['barista'] as const, sessionItemStationCodes: ['barista'] as const }
        : {};

    return ok(await buildWaiterLiveWorkspace(ctx.cafeId, ctx.databaseKey, scope));
  } catch (e) {
    return jsonError(e, 400);
  }
}
