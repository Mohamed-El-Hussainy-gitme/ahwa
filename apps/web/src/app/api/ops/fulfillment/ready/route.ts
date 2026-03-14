import { actorRpcParams, callOpsRpc, loadOrderItemMutationContext } from '@/app/api/ops/_rpc';
import { jsonError, ok, publishOpsMutation, requireOpsActorContext, requireStationAccess } from '@/app/api/ops/_helpers';

type MarkReadyRpcResult = {
  ok?: boolean;
};

export async function POST(req: Request) {
  try {
    const { orderItemId, quantity } = (await req.json()) as { orderItemId?: string; quantity?: number };
    const normalizedOrderItemId = String(orderItemId ?? '').trim();
    const normalizedQuantity = Number(quantity ?? 0);
    if (!normalizedOrderItemId || !Number.isInteger(normalizedQuantity) || normalizedQuantity <= 0) {
      throw new Error('INVALID_INPUT');
    }

    const ctx = await requireOpsActorContext();
    const item = await loadOrderItemMutationContext(ctx.cafeId, normalizedOrderItemId);
    const stationCode = item.stationCode === 'shisha' ? 'shisha' : 'barista';
    requireStationAccess(ctx, stationCode);

    await callOpsRpc<MarkReadyRpcResult>('ops_mark_ready', {
      p_cafe_id: ctx.cafeId,
      p_order_item_id: normalizedOrderItemId,
      p_quantity: normalizedQuantity,
      ...actorRpcParams(ctx, 'p_by_staff_id', 'p_by_owner_id'),
    });

    publishOpsMutation(ctx, {
      type: 'station.ready',
      entityId: item.id,
      shiftId: item.shiftId,
      data: { quantity: normalizedQuantity, stationCode: item.stationCode ?? '' },
    });

    return ok({ ok: true });
  } catch (e) {
    return jsonError(e, 400);
  }
}
