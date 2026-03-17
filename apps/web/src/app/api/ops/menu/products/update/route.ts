import { adminOps } from '@/app/api/ops/_server';
import { jsonError, ok, publishOpsMutation, requireOwnerRole, requireOpsActorContext } from '@/app/api/ops/_helpers';
import { loadProduct, loadSection, nextProductSortOrder, normalizeStationCode, renumberProductSortOrders } from '@/app/api/ops/menu/_utils';
import type { StationCode } from '@/lib/ops/types';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { productId?: string; sectionId?: string; productName?: string; stationCode?: StationCode; unitPrice?: number };
    const productId = String(body.productId ?? '').trim();
    const sectionId = String(body.sectionId ?? '').trim();
    const productName = String(body.productName ?? '').trim();
    const stationCode = normalizeStationCode(body.stationCode);
    const unitPrice = Number(body.unitPrice ?? 0);
    if (!productId || !sectionId || !productName || !Number.isFinite(unitPrice) || unitPrice < 0) throw new Error('INVALID_INPUT');

    const ctx = requireOwnerRole(await requireOpsActorContext());
    const current = await loadProduct(ctx.cafeId, productId, ctx.databaseKey);
    await loadSection(ctx.cafeId, sectionId, ctx.databaseKey);
    const nextSortOrder = String(current.section_id) === sectionId ? Number(current.sort_order ?? 0) : await nextProductSortOrder(ctx.cafeId, sectionId, ctx.databaseKey);

    const { error } = await adminOps(ctx.databaseKey).from('menu_products').update({ section_id: sectionId, product_name: productName, station_code: stationCode, unit_price: unitPrice, sort_order: nextSortOrder }).eq('cafe_id', ctx.cafeId).eq('id', productId);
    if (error) throw error;
    if (String(current.section_id) !== sectionId) await renumberProductSortOrders(ctx.cafeId, String(current.section_id), ctx.databaseKey);

    publishOpsMutation(ctx, { type: 'menu.product_updated', entityId: productId, data: { sectionId, productName, stationCode, unitPrice } });
    return ok({ ok: true });
  } catch (error) {
    return jsonError(error, 400);
  }
}
