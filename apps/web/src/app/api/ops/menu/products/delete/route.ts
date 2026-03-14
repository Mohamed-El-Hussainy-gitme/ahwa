import { adminOps } from '@/app/api/ops/_server';
import { jsonError, ok, publishOpsMutation, requireOpsActorContext } from '@/app/api/ops/_helpers';
import { loadProduct, productUsageCount, renumberProductSortOrders } from '@/app/api/ops/menu/_utils';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { productId?: string };
    const productId = String(body.productId ?? '').trim();
    if (!productId) throw new Error('PRODUCT_ID_REQUIRED');

    const ctx = await requireOpsActorContext();
    const product = await loadProduct(ctx.cafeId, productId);
    const usageCount = await productUsageCount(ctx.cafeId, productId);

    if (usageCount > 0) {
      const { error } = await adminOps().from('menu_products').update({ is_active: false }).eq('cafe_id', ctx.cafeId).eq('id', productId);
      if (error) throw error;
      publishOpsMutation(ctx, { type: 'menu.product_archived', entityId: productId, data: { productName: String(product.product_name ?? ''), usageCount } });
      return ok({ ok: true, mode: 'archived' as const });
    }

    const sectionId = String(product.section_id ?? '');
    const { error } = await adminOps().from('menu_products').delete().eq('cafe_id', ctx.cafeId).eq('id', productId);
    if (error) throw error;
    await renumberProductSortOrders(ctx.cafeId, sectionId);
    publishOpsMutation(ctx, { type: 'menu.product_deleted', entityId: productId, data: { productName: String(product.product_name ?? '') } });
    return ok({ ok: true, mode: 'deleted' as const });
  } catch (error) {
    return jsonError(error, 400);
  }
}
