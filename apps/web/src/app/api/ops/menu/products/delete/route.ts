import { adminOps } from '@/app/api/ops/_server';
import { enqueueOpsMutation, jsonError, kickOpsOutboxDispatch, ok, requireOwnerRole, requireOpsActorContext } from '@/app/api/ops/_helpers';
import { loadProduct, productUsageCount, renumberProductSortOrders } from '@/app/api/ops/menu/_utils';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { productId?: string };
    const productId = String(body.productId ?? '').trim();
    if (!productId) throw new Error('PRODUCT_ID_REQUIRED');

    const ctx = requireOwnerRole(await requireOpsActorContext());
    const product = await loadProduct(ctx.cafeId, productId, ctx.databaseKey);
    const usageCount = await productUsageCount(ctx.cafeId, productId, ctx.databaseKey);

    if (usageCount > 0) {
      const { error } = await adminOps(ctx.databaseKey).from('menu_products').update({ is_active: false }).eq('cafe_id', ctx.cafeId).eq('id', productId);
      if (error) throw error;
      await enqueueOpsMutation(ctx, { type: 'menu.product_archived', entityId: productId, data: { productName: String(product.product_name ?? ''), usageCount } });
      kickOpsOutboxDispatch(ctx);
      return ok({ ok: true, mode: 'archived' as const });
    }

    const sectionId = String(product.section_id ?? '');
    const { error } = await adminOps(ctx.databaseKey).from('menu_products').delete().eq('cafe_id', ctx.cafeId).eq('id', productId);
    if (error) throw error;
    await renumberProductSortOrders(ctx.cafeId, sectionId, ctx.databaseKey);
    await enqueueOpsMutation(ctx, { type: 'menu.product_deleted', entityId: productId, data: { productName: String(product.product_name ?? '') } });
    kickOpsOutboxDispatch(ctx);
    return ok({ ok: true, mode: 'deleted' as const });
  } catch (error) {
    return jsonError(error, 400);
  }
}
