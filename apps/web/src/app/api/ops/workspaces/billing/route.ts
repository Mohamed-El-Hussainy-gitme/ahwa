import { buildBillingWorkspace } from '@/app/api/ops/_server';
import { jsonError, ok, requireBillingAccess, requireOpsActorContext } from '@/app/api/ops/_helpers';
export async function POST() {
  try { const ctx = requireBillingAccess(await requireOpsActorContext()); return ok(await buildBillingWorkspace(ctx.cafeId)); }
  catch (e) { return jsonError(e, 400); }
}
