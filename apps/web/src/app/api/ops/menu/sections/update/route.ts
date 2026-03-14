import { adminOps } from '@/app/api/ops/_server';
import { jsonError, ok, publishOpsMutation, requireOpsActorContext } from '@/app/api/ops/_helpers';
import { loadSection, normalizeStationCode } from '@/app/api/ops/menu/_utils';
import type { StationCode } from '@/lib/ops/types';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { sectionId?: string; title?: string; stationCode?: StationCode };
    const sectionId = String(body.sectionId ?? '').trim();
    const title = String(body.title ?? '').trim();
    const stationCode = normalizeStationCode(body.stationCode);
    if (!sectionId || !title) throw new Error('INVALID_INPUT');

    const ctx = await requireOpsActorContext();
    await loadSection(ctx.cafeId, sectionId);
    const { error } = await adminOps()
      .from('menu_sections')
      .update({ title, station_code: stationCode })
      .eq('cafe_id', ctx.cafeId)
      .eq('id', sectionId);
    if (error) throw error;

    publishOpsMutation(ctx, {
      type: 'menu.section_updated',
      entityId: sectionId,
      data: { title, stationCode },
    });

    return ok({ ok: true });
  } catch (error) {
    return jsonError(error, 400);
  }
}
