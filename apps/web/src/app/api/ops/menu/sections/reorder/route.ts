import { adminOps } from '@/app/api/ops/_server';
import { enqueueOpsMutation, jsonError, kickOpsOutboxDispatch, ok, requireOwnerRole, requireOpsActorContext } from '@/app/api/ops/_helpers';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { sectionIds?: string[] };
    const sectionIds = Array.isArray(body.sectionIds) ? body.sectionIds.map((value) => String(value ?? '').trim()).filter(Boolean) : [];
    if (!sectionIds.length) throw new Error('SECTION_IDS_REQUIRED');

    const ctx = requireOwnerRole(await requireOpsActorContext());
    const { data, error } = await adminOps(ctx.databaseKey).from('menu_sections').select('id').eq('cafe_id', ctx.cafeId).in('id', sectionIds);
    if (error) throw error;
    const existingIds = new Set((data ?? []).map((row) => String(row.id)));
    if (existingIds.size !== sectionIds.length) throw new Error('SECTION_NOT_FOUND');

    for (const [index, sectionId] of sectionIds.entries()) {
      const { error: updateError } = await adminOps(ctx.databaseKey).from('menu_sections').update({ sort_order: index }).eq('cafe_id', ctx.cafeId).eq('id', sectionId);
      if (updateError) throw updateError;
    }

    await enqueueOpsMutation(ctx, { type: 'menu.sections_reordered', data: { sectionIds } });
    kickOpsOutboxDispatch(ctx);
    return ok({ ok: true });
  } catch (error) {
    return jsonError(error, 400);
  }
}
