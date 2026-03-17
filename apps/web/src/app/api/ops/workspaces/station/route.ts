import { buildStationWorkspace } from '@/app/api/ops/_server';
import { jsonError, ok, requireOpsActorContext, requireStationAccess } from '@/app/api/ops/_helpers';
import type { StationCode } from '@/lib/ops/types';

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { stationCode?: StationCode };
    const stationCode = body.stationCode === 'shisha' ? 'shisha' : 'barista';
    const ctx = requireStationAccess(await requireOpsActorContext(), stationCode);
    return ok(await buildStationWorkspace(ctx.cafeId, stationCode, ctx.databaseKey));
  } catch (e) {
    return jsonError(e, 400);
  }
}
