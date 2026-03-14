import { buildMenuWorkspace } from '@/app/api/ops/_server';
import { jsonError, ok, requireOpsActorContext } from '@/app/api/ops/_helpers';

export async function POST() {
  try {
    const ctx = await requireOpsActorContext();
    return ok(await buildMenuWorkspace(ctx.cafeId));
  } catch (error) {
    return jsonError(error, 400);
  }
}
