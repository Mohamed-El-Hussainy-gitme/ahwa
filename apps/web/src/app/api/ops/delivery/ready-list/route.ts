import { buildWaiterWorkspace } from '@/app/api/ops/_server';
import { jsonError, ok, requireOpsActorContext } from '@/app/api/ops/_helpers';
export async function POST() { try { const ctx = await requireOpsActorContext(); return ok((await buildWaiterWorkspace(ctx.cafeId)).readyItems); } catch (e) { return jsonError(e, 400); } }
