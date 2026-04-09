import { adminOps } from '@/app/api/ops/_server';
import { enqueueOpsMutation, jsonError, ok, requireOwnerRole, requireOpsActorContext } from '@/app/api/ops/_helpers';
import { finalizeMenuMutation, loadAddon, loadProduct, normalizeStationCode } from '@/app/api/ops/menu/_utils';
import type { StationCode } from '@/lib/ops/types';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      addonId?: string;
      addonName?: string;
      stationCode?: StationCode;
      unitPrice?: number;
      productIds?: string[];
    };
    const addonId = String(body.addonId ?? '').trim();
    const addonName = String(body.addonName ?? '').trim();
    const stationCode = normalizeStationCode(body.stationCode);
    const unitPrice = Number(body.unitPrice ?? 0);
    const rawProductIds = Array.isArray(body.productIds) ? body.productIds : [];
    const productIds = Array.from(new Set(rawProductIds.map((value) => String(value ?? '').trim()).filter(Boolean)));
    if (!addonId || !addonName || !Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new Error('INVALID_INPUT');
    }

    const ctx = requireOwnerRole(await requireOpsActorContext());
    await loadAddon(ctx.cafeId, addonId, ctx.databaseKey);

    for (const productId of productIds) {
      const product = await loadProduct(ctx.cafeId, productId, ctx.databaseKey);
      if (normalizeStationCode(product.station_code) !== stationCode) {
        throw new Error('ADDON_PRODUCT_STATION_MISMATCH');
      }
    }

    const { error: updateError } = await adminOps(ctx.databaseKey)
      .from('menu_addons')
      .update({
        addon_name: addonName,
        station_code: stationCode,
        unit_price: unitPrice,
      })
      .eq('cafe_id', ctx.cafeId)
      .eq('id', addonId);
    if (updateError) throw updateError;

    const { error: deleteLinksError } = await adminOps(ctx.databaseKey)
      .from('menu_product_addons')
      .delete()
      .eq('cafe_id', ctx.cafeId)
      .eq('menu_addon_id', addonId);
    if (deleteLinksError) throw deleteLinksError;

    if (productIds.length) {
      const { error: insertLinksError } = await adminOps(ctx.databaseKey)
        .from('menu_product_addons')
        .insert(productIds.map((productId) => ({
          cafe_id: ctx.cafeId,
          menu_product_id: productId,
          menu_addon_id: addonId,
        })));
      if (insertLinksError) throw insertLinksError;
    }

    await enqueueOpsMutation(ctx, {
      type: 'menu.addon_updated',
      entityId: addonId,
      data: { addonName, stationCode, unitPrice, productIds },
    });
    await finalizeMenuMutation(ctx);
    return ok({ ok: true });
  } catch (error) {
    return jsonError(error, 400);
  }
}
