import { adminOps } from '@/app/api/ops/_server';
import { jsonError, ok, publishOpsMutation, requireOpsActorContext } from '@/app/api/ops/_helpers';
import { loadSection, renumberSectionSortOrders, sectionUsageCount } from '@/app/api/ops/menu/_utils';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { sectionId?: string };
    const sectionId = String(body.sectionId ?? '').trim();
    if (!sectionId) throw new Error('SECTION_ID_REQUIRED');

    const ctx = await requireOpsActorContext();
    const section = await loadSection(ctx.cafeId, sectionId);
    const usageCount = await sectionUsageCount(ctx.cafeId, sectionId);

    if (usageCount > 0) {
      const { error: sectionError } = await adminOps().from('menu_sections').update({ is_active: false }).eq('cafe_id', ctx.cafeId).eq('id', sectionId);
      if (sectionError) throw sectionError;
      const { error: productsError } = await adminOps().from('menu_products').update({ is_active: false }).eq('cafe_id', ctx.cafeId).eq('section_id', sectionId);
      if (productsError) throw productsError;
      publishOpsMutation(ctx, { type: 'menu.section_archived', entityId: sectionId, data: { title: String(section.title ?? ''), usageCount } });
      return ok({ ok: true, mode: 'archived' as const });
    }

    const { error: deleteError } = await adminOps().from('menu_sections').delete().eq('cafe_id', ctx.cafeId).eq('id', sectionId);
    if (deleteError) throw deleteError;
    await renumberSectionSortOrders(ctx.cafeId);
    publishOpsMutation(ctx, { type: 'menu.section_deleted', entityId: sectionId, data: { title: String(section.title ?? '') } });
    return ok({ ok: true, mode: 'deleted' as const });
  } catch (error) {
    return jsonError(error, 400);
  }
}
