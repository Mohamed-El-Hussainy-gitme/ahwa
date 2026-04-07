import { buildReportsWorkspace } from '@/app/api/ops/_reports';
import { jsonError, ok, requireReportsAccess, requireOpsActorContext } from '@/app/api/ops/_helpers';
import type { ReportsWorkspaceRequest } from '@/lib/ops/types';

async function readRequest(req: Request): Promise<ReportsWorkspaceRequest> {
  try {
    const body = (await req.json()) as ReportsWorkspaceRequest | null;
    return body && typeof body === 'object' ? body : {};
  } catch {
    return {};
  }
}

export async function POST(req: Request) {
  try {
    const ctx = requireReportsAccess(await requireOpsActorContext());
    const input = await readRequest(req);
    return ok(await buildReportsWorkspace(ctx.cafeId, ctx.databaseKey, input));
  } catch (error) {
    return jsonError(error, 400);
  }
}
