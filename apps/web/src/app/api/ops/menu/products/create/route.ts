import { adminOps } from '@/app/api/ops/_server';
import { enqueueOpsMutation, jsonError, ok, requireOwnerRole, requireOpsActorContext } from '@/app/api/ops/_helpers';
import { finalizeMenuMutation, loadSection, nextProductSortOrder, normalizeStationCode } from '@/app/api/ops/menu/_utils';
import type { StationCode } from '@/lib/ops/types';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      sectionId?: string;
      productName?: string;
      stationCode?: StationCode;
      unitPrice?: number;
    };
    const sectionId = String(body.sectionId ?? '').trim();
    const productName = String(body.productName ?? '').trim();
    const stationCode = normalizeStationCode(body.stationCode);
    const unitPrice = Number(body.unitPrice ?? 0);
    if (!sectionId || !productName || !Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new Error('INVALID_INPUT');
    }

    const ctx = requireOwnerRole(await requireOpsActorContext());
    await loadSection(ctx.cafeId, sectionId, ctx.databaseKey);
    const sortOrder = await nextProductSortOrder(ctx.cafeId, sectionId, ctx.databaseKey);
    const { data, error } = await adminOps(ctx.databaseKey)
      .from('menu_products')
      .insert({
        cafe_id: ctx.cafeId,
        section_id: sectionId,
        product_name: productName,
        station_code: stationCode,
        unit_price: unitPrice,
        sort_order: sortOrder,
        is_active: true,
      })
      .select('id')
      .single();
    if (error) throw error;

    await enqueueOpsMutation(ctx, {
      type: 'menu.product_created',
      entityId: String(data.id),
      data: { sectionId, productName, stationCode, unitPrice, sortOrder },
    });

    await finalizeMenuMutation(ctx);

    return ok({ productId: String(data.id) });
  } catch (error) {
    return jsonError(error, 400);
  }
}
