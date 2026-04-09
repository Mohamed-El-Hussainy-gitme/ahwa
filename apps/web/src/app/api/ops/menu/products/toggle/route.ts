import { adminOps } from '@/app/api/ops/_server';
import { finalizeMenuMutation } from '@/app/api/ops/menu/_utils';
import { enqueueOpsMutation, jsonError, ok, requireOwnerRole, requireOpsActorContext } from '@/app/api/ops/_helpers';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { productId?: string; isActive?: boolean };
    const productId = String(body.productId ?? '').trim();
    if (!productId) throw new Error('PRODUCT_ID_REQUIRED');

    const ctx = requireOwnerRole(await requireOpsActorContext());
    const isActive = Boolean(body.isActive);
    const { error } = await adminOps(ctx.databaseKey)
      .from('menu_products')
      .update({ is_active: isActive })
      .eq('cafe_id', ctx.cafeId)
      .eq('id', productId);
    if (error) throw error;

    await enqueueOpsMutation(ctx, {
      type: 'menu.product_toggled',
      entityId: productId,
      data: { isActive },
    });

    await finalizeMenuMutation(ctx);
    return ok({ ok: true });
  } catch (error) {
    return jsonError(error, 400);
  }
}
