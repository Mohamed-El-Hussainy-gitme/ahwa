import { adminOps } from '@/app/api/ops/_server';
import { enqueueOpsMutation, jsonError, ok, requireOwnerRole, requireOpsActorContext } from '@/app/api/ops/_helpers';
import { finalizeMenuMutation, loadAddon } from '@/app/api/ops/menu/_utils';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { addonId?: string; isActive?: boolean };
    const addonId = String(body.addonId ?? '').trim();
    if (!addonId || typeof body.isActive !== 'boolean') {
      throw new Error('INVALID_INPUT');
    }
    const ctx = requireOwnerRole(await requireOpsActorContext());
    await loadAddon(ctx.cafeId, addonId, ctx.databaseKey);

    const { error } = await adminOps(ctx.databaseKey)
      .from('menu_addons')
      .update({ is_active: body.isActive })
      .eq('cafe_id', ctx.cafeId)
      .eq('id', addonId);
    if (error) throw error;

    await enqueueOpsMutation(ctx, { type: 'menu.addon_toggled', entityId: addonId, data: { isActive: body.isActive } });
    finalizeMenuMutation(ctx);
    return ok({ ok: true });
  } catch (error) {
    return jsonError(error, 400);
  }
}
