import { buildComplaintsWorkspace } from '@/app/api/ops/_server';
import { jsonError, ok, requireComplaintLogAccess, requireOpsActorContext } from '@/app/api/ops/_helpers';

export async function POST() {
  try {
    const ctx = requireComplaintLogAccess(await requireOpsActorContext());
    const scope = ctx.shiftRole === 'shisha'
      ? { itemStationCodes: ['shisha'] as const }
      : ctx.shiftRole === 'waiter'
        ? { itemStationCodes: ['barista'] as const }
        : {};
    return ok(await buildComplaintsWorkspace(ctx.cafeId, ctx.databaseKey, scope));
  } catch (e) {
    return jsonError(e, 400);
  }
}
