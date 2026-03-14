import { buildStationWorkspace } from '@/app/api/ops/_server';
import { jsonError, ok, requireOpsActorContext } from '@/app/api/ops/_helpers';
import type { StationCode } from '@/lib/ops/types';
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as { stationCode?: StationCode };
    const ctx = await requireOpsActorContext();
    const stationCode = body.stationCode === 'shisha' ? 'shisha' : 'barista';
    return ok(await buildStationWorkspace(ctx.cafeId, stationCode));
  } catch (e) { return jsonError(e, 400); }
}
