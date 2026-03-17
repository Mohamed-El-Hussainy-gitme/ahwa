import { buildReportsWorkspace } from '@/app/api/ops/_reports';
import { jsonError, ok, requireReportsAccess, requireOpsActorContext } from '@/app/api/ops/_helpers';

export async function POST() {
  try {
    const ctx = requireReportsAccess(await requireOpsActorContext());
    return ok(await buildReportsWorkspace(ctx.cafeId, ctx.databaseKey));
  } catch (error) {
    return jsonError(error, 400);
  }
}
