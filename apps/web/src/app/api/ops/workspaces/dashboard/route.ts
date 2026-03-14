import { buildDashboardWorkspace } from '@/app/api/ops/_server';
import { jsonError, ok, requireOwnerOrSupervisor, requireOpsActorContext } from '@/app/api/ops/_helpers';
export async function POST() {
  try { const ctx = requireOwnerOrSupervisor(await requireOpsActorContext()); return ok(await buildDashboardWorkspace(ctx.cafeId)); }
  catch (e) { return jsonError(e, 400); }
}
