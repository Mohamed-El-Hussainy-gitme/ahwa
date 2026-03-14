import { actorRpcParams, callOpsRpc, loadOrderItemMutationContext } from '@/app/api/ops/_rpc';
import { jsonError, ok, publishOpsMutation, requireOpsActorContext } from '@/app/api/ops/_helpers';

type RemakeRpcResult = {
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
    await callOpsRpc<RemakeRpcResult>('ops_request_remake', {
      p_cafe_id: ctx.cafeId,
      p_order_item_id: normalizedOrderItemId,
      p_quantity: normalizedQuantity,
      ...actorRpcParams(ctx, 'p_by_staff_id', 'p_by_owner_id'),
    });

    const item = await loadOrderItemMutationContext(ctx.cafeId, normalizedOrderItemId);

    publishOpsMutation(ctx, {
      type: 'station.remake_requested',
      entityId: item.id,
      shiftId: item.shiftId,
      data: { quantity: normalizedQuantity, stationCode: item.stationCode ?? '' },
    });

    return ok({ ok: true });
  } catch (e) {
    return jsonError(e, 400);
  }
}
