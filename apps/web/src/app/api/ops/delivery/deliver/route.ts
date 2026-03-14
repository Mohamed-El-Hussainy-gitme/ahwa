import { actorRpcParams, callOpsRpc, loadOrderItemMutationContext } from '@/app/api/ops/_rpc';
import { jsonError, ok, publishOpsMutation, requireDeliveryAccess, requireOpsActorContext } from '@/app/api/ops/_helpers';

type DeliverRequestBody = {
  orderItemId?: string;
  quantity?: number;
};

type DeliverRpcResult = {
  ok?: boolean;
  delivered_qty?: number;
  replacement_delivered_qty?: number;
  quantity?: number;
};

export async function POST(req: Request) {
  try {
    const { orderItemId, quantity } = (await req.json()) as DeliverRequestBody;
    const normalizedOrderItemId = String(orderItemId ?? '').trim();
    const normalizedQuantity = Number(quantity ?? 0);
    if (!normalizedOrderItemId || !Number.isInteger(normalizedQuantity) || normalizedQuantity <= 0) {
      throw new Error('INVALID_INPUT');
    }

    const ctx = requireDeliveryAccess(await requireOpsActorContext());
    const rpc = await callOpsRpc<DeliverRpcResult>('ops_deliver_available_quantities', {
      p_cafe_id: ctx.cafeId,
      p_order_item_id: normalizedOrderItemId,
      p_quantity: normalizedQuantity,
      ...actorRpcParams(ctx, 'p_by_staff_id', 'p_by_owner_id'),
    });

    const item = await loadOrderItemMutationContext(ctx.cafeId, normalizedOrderItemId);
    publishOpsMutation(ctx, {
      type: 'delivery.delivered',
      entityId: item.id,
      shiftId: item.shiftId,
      data: {
        quantity: Number(rpc.quantity ?? normalizedQuantity),
        deliveredQty: Number(rpc.delivered_qty ?? 0),
        replacementDeliveredQty: Number(rpc.replacement_delivered_qty ?? 0),
        serviceSessionId: item.serviceSessionId ?? '',
      },
    });

    return ok({ ok: true });
  } catch (e) {
    return jsonError(e, 400);
  }
}
