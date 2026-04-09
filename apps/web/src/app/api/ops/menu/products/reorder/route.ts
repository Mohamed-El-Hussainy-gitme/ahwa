import { adminOps } from '@/app/api/ops/_server';
import { finalizeMenuMutation } from '@/app/api/ops/menu/_utils';
import { enqueueOpsMutation, jsonError, ok, requireOwnerRole, requireOpsActorContext } from '@/app/api/ops/_helpers';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { sectionId?: string; productIds?: string[] };
    const sectionId = String(body.sectionId ?? '').trim();
    const productIds = Array.isArray(body.productIds) ? body.productIds.map((value) => String(value ?? '').trim()).filter(Boolean) : [];
    if (!sectionId || !productIds.length) throw new Error('INVALID_INPUT');

    const ctx = requireOwnerRole(await requireOpsActorContext());
    const { data, error } = await adminOps(ctx.databaseKey).from('menu_products').select('id').eq('cafe_id', ctx.cafeId).eq('section_id', sectionId).in('id', productIds);
    if (error) throw error;
    const existingIds = new Set((data ?? []).map((row) => String(row.id)));
    if (existingIds.size !== productIds.length) throw new Error('PRODUCT_NOT_FOUND');

    for (const [index, productId] of productIds.entries()) {
      const { error: updateError } = await adminOps(ctx.databaseKey).from('menu_products').update({ sort_order: index }).eq('cafe_id', ctx.cafeId).eq('id', productId);
      if (updateError) throw updateError;
    }

    await enqueueOpsMutation(ctx, { type: 'menu.products_reordered', data: { sectionId, productIds } });
    finalizeMenuMutation(ctx);
    return ok({ ok: true });
  } catch (error) {
    return jsonError(error, 400);
  }
}
