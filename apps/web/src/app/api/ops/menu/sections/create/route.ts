import { adminOpsForCafeId } from '@/app/api/ops/_server';
import { jsonError, ok, publishOpsMutation, requireOwnerRole, requireOpsActorContext } from '@/app/api/ops/_helpers';
import { nextSectionSortOrder, normalizeStationCode } from '@/app/api/ops/menu/_utils';
import type { StationCode } from '@/lib/ops/types';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { title?: string; stationCode?: StationCode; sortOrder?: number };
    const title = String(body.title ?? '').trim();
    const stationCode = normalizeStationCode(body.stationCode);
    if (!title) throw new Error('TITLE_REQUIRED');

    const ctx = requireOwnerRole(await requireOpsActorContext());
    const admin = await adminOpsForCafeId(ctx.cafeId);
    const sortOrder = Number.isInteger(body.sortOrder) ? Number(body.sortOrder) : await nextSectionSortOrder(ctx.cafeId);
    const { data, error } = await admin
      .from('menu_sections')
      .insert({ cafe_id: ctx.cafeId, title, station_code: stationCode, sort_order: sortOrder, is_active: true })
      .select('id')
      .single();
    if (error) throw error;

    publishOpsMutation(ctx, {
      type: 'menu.section_created',
      entityId: String(data.id),
      data: { title, stationCode, sortOrder },
    });

    return ok({ sectionId: String(data.id) });
  } catch (error) {
    return jsonError(error, 400);
  }
}
