import { adminOps } from '@/app/api/ops/_server';
import { finalizeMenuMutation } from '@/app/api/ops/menu/_utils';
import { enqueueOpsMutation, jsonError, ok, requireOwnerRole, requireOpsActorContext } from '@/app/api/ops/_helpers';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { sectionId?: string; isActive?: boolean };
    const sectionId = String(body.sectionId ?? '').trim();
    if (!sectionId) throw new Error('SECTION_ID_REQUIRED');

    const ctx = requireOwnerRole(await requireOpsActorContext());
    const isActive = Boolean(body.isActive);
    const { error } = await adminOps(ctx.databaseKey)
      .from('menu_sections')
      .update({ is_active: isActive })
      .eq('cafe_id', ctx.cafeId)
      .eq('id', sectionId);
    if (error) throw error;

    await enqueueOpsMutation(ctx, {
      type: 'menu.section_toggled',
      entityId: sectionId,
      data: { isActive },
    });

    await finalizeMenuMutation(ctx);
    return ok({ ok: true });
  } catch (error) {
    return jsonError(error, 400);
  }
}
