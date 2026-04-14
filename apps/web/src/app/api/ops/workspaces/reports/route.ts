import { buildReportsWorkspace } from '@/app/api/ops/_reports';
import { jsonError, ok, requireReportsAccess, requireOpsActorContext } from '@/app/api/ops/_helpers';

export async function POST(request: Request) {
  try {
    const ctx = requireReportsAccess(await requireOpsActorContext());
    let payload: { startDate?: string; endDate?: string } = {};
    try {
      payload = (await request.json()) as { startDate?: string; endDate?: string };
    } catch {}
    return ok(await buildReportsWorkspace(ctx.cafeId, ctx.databaseKey, payload));
  } catch (error) {
    return jsonError(error, 400);
  }
}
