import { adminOps } from '@/app/api/ops/_server';
import { enqueueOpsMutation, jsonError, kickOpsOutboxDispatch, ok, requireOwnerRole, requireOpsActorContext } from '@/app/api/ops/_helpers';
import { addonUsageCount, loadAddon, renumberAddonSortOrders } from '@/app/api/ops/menu/_utils';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { addonId?: string };
    const addonId = String(body.addonId ?? '').trim();
    if (!addonId) {
      throw new Error('INVALID_INPUT');
    }

    const ctx = requireOwnerRole(await requireOpsActorContext());
    const addon = await loadAddon(ctx.cafeId, addonId, ctx.databaseKey);
    const usageCount = await addonUsageCount(ctx.cafeId, addonId, ctx.databaseKey);

    if (usageCount > 0) {
      const { error } = await adminOps(ctx.databaseKey)
        .from('menu_addons')
        .update({ is_active: false })
        .eq('cafe_id', ctx.cafeId)
        .eq('id', addonId);
      if (error) throw error;

      await enqueueOpsMutation(ctx, { type: 'menu.addon_archived', entityId: addonId, data: { addonName: String(addon.addon_name ?? ''), usageCount } });
      kickOpsOutboxDispatch(ctx);
      return ok({ ok: true, mode: 'archived' as const });
    }

    const { error: deleteLinksError } = await adminOps(ctx.databaseKey)
      .from('menu_product_addons')
      .delete()
      .eq('cafe_id', ctx.cafeId)
      .eq('menu_addon_id', addonId);
    if (deleteLinksError) throw deleteLinksError;

    const { error: deleteError } = await adminOps(ctx.databaseKey)
      .from('menu_addons')
      .delete()
      .eq('cafe_id', ctx.cafeId)
      .eq('id', addonId);
    if (deleteError) throw deleteError;

    await renumberAddonSortOrders(ctx.cafeId, ctx.databaseKey);
    await enqueueOpsMutation(ctx, { type: 'menu.addon_deleted', entityId: addonId, data: { addonName: String(addon.addon_name ?? '') } });
    kickOpsOutboxDispatch(ctx);
    return ok({ ok: true, mode: 'deleted' as const });
  } catch (error) {
    return jsonError(error, 400);
  }
}
