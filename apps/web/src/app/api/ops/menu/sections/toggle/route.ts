import { adminOps } from '@/app/api/ops/_server';
import { jsonError, ok, publishOpsMutation, requireOpsActorContext } from '@/app/api/ops/_helpers';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { sectionId?: string; isActive?: boolean };
    const sectionId = String(body.sectionId ?? '').trim();
    if (!sectionId) throw new Error('SECTION_ID_REQUIRED');

    const ctx = await requireOpsActorContext();
    const isActive = Boolean(body.isActive);
    const { error } = await adminOps()
      .from('menu_sections')
      .update({ is_active: isActive })
      .eq('cafe_id', ctx.cafeId)
      .eq('id', sectionId);
    if (error) throw error;

    publishOpsMutation(ctx, {
      type: 'menu.section_toggled',
      entityId: sectionId,
      data: { isActive },
    });

    return ok({ ok: true });
  } catch (error) {
    return jsonError(error, 400);
  }
}
