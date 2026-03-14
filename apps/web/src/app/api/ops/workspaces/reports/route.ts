import { buildReportsWorkspace } from '@/app/api/ops/_reports';
import { jsonError, ok, requireOpsActorContext } from '@/app/api/ops/_helpers';

export async function POST() {
  try {
    const ctx = await requireOpsActorContext();
    return ok(await buildReportsWorkspace(ctx.cafeId));
  } catch (error) {
    return jsonError(error, 400);
  }
}
