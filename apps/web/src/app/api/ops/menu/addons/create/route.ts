import { adminOps } from '@/app/api/ops/_server';
import { enqueueOpsMutation, jsonError, ok, requireOwnerRole, requireOpsActorContext } from '@/app/api/ops/_helpers';
import { finalizeMenuMutation, loadProduct, nextAddonSortOrder, normalizeStationCode } from '@/app/api/ops/menu/_utils';
import type { StationCode } from '@/lib/ops/types';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      addonName?: string;
      stationCode?: StationCode;
      unitPrice?: number;
      productIds?: string[];
    };
    const addonName = String(body.addonName ?? '').trim();
    const stationCode = normalizeStationCode(body.stationCode);
    const unitPrice = Number(body.unitPrice ?? 0);
    const rawProductIds = Array.isArray(body.productIds) ? body.productIds : [];
    const productIds = Array.from(new Set(rawProductIds.map((value) => String(value ?? '').trim()).filter(Boolean)));
    if (!addonName || !Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new Error('INVALID_INPUT');
    }

    const ctx = requireOwnerRole(await requireOpsActorContext());
    const sortOrder = await nextAddonSortOrder(ctx.cafeId, ctx.databaseKey);

    for (const productId of productIds) {
      const product = await loadProduct(ctx.cafeId, productId, ctx.databaseKey);
      if (normalizeStationCode(product.station_code) !== stationCode) {
        throw new Error('ADDON_PRODUCT_STATION_MISMATCH');
      }
    }

    const { data, error } = await adminOps(ctx.databaseKey)
      .from('menu_addons')
      .insert({
        cafe_id: ctx.cafeId,
        addon_name: addonName,
        station_code: stationCode,
        unit_price: unitPrice,
        sort_order: sortOrder,
        is_active: true,
      })
      .select('id')
      .single();
    if (error) throw error;

    const addonId = String(data.id);

    if (productIds.length) {
      const { error: linkError } = await adminOps(ctx.databaseKey)
        .from('menu_product_addons')
        .insert(productIds.map((productId) => ({
          cafe_id: ctx.cafeId,
          menu_product_id: productId,
          menu_addon_id: addonId,
        })));
      if (linkError) throw linkError;
    }

    await enqueueOpsMutation(ctx, {
      type: 'menu.addon_created',
      entityId: addonId,
      data: { addonName, stationCode, unitPrice, productIds, sortOrder },
    });
    finalizeMenuMutation(ctx);
    return ok({ addonId });
  } catch (error) {
    return jsonError(error, 400);
  }
}
