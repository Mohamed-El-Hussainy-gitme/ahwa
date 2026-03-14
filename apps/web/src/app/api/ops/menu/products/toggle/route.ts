import { adminOps } from '@/app/api/ops/_server';
import { jsonError, ok, publishOpsMutation, requireOpsActorContext } from '@/app/api/ops/_helpers';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { productId?: string; isActive?: boolean };
    const productId = String(body.productId ?? '').trim();
    if (!productId) throw new Error('PRODUCT_ID_REQUIRED');

    const ctx = await requireOpsActorContext();
    const isActive = Boolean(body.isActive);
    const { error } = await adminOps()
      .from('menu_products')
      .update({ is_active: isActive })
      .eq('cafe_id', ctx.cafeId)
      .eq('id', productId);
    if (error) throw error;

    publishOpsMutation(ctx, {
      type: 'menu.product_toggled',
      entityId: productId,
      data: { isActive },
    });

    return ok({ ok: true });
  } catch (error) {
    return jsonError(error, 400);
  }
}
