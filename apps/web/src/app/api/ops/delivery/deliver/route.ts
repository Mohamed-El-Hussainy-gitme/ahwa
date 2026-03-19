import { actorRpcParams, callOpsRpc, loadOrderItemMutationContext } from '@/app/api/ops/_rpc';
import {
  beginIdempotentMutation,
  type BegunIdempotentMutation,
  completeIdempotentMutation,
  jsonError,
  ok,
  kickOpsOutboxDispatch,
  releaseIdempotentMutation,
  requireDeliveryAccess,
  requireDeliveryItemAccess,
  requireOpsActorContext,
} from '@/app/api/ops/_helpers';

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
  let mutation: BegunIdempotentMutation | null = null;

  try {
    const { orderItemId, quantity } = (await req.json()) as DeliverRequestBody;
    const normalizedOrderItemId = String(orderItemId ?? '').trim();
    const normalizedQuantity = Number(quantity ?? 0);
    if (!normalizedOrderItemId || !Number.isInteger(normalizedQuantity) || normalizedQuantity <= 0) {
      throw new Error('INVALID_INPUT');
    }

    const ctx = requireDeliveryAccess(await requireOpsActorContext());
    const item = await loadOrderItemMutationContext(ctx.cafeId, normalizedOrderItemId, ctx.databaseKey);
    requireDeliveryItemAccess(ctx, item.stationCode as 'barista' | 'shisha' | null);

    const started = await beginIdempotentMutation(req, ctx, 'ops.delivery.deliver', {
      orderItemId: normalizedOrderItemId,
      quantity: normalizedQuantity,
    });
    if (started.replayResponse) {
      return started.replayResponse;
    }
    mutation = started.mutation;

    const rpc = await callOpsRpc<DeliverRpcResult>('ops_deliver_available_quantities_with_outbox', {
      p_cafe_id: ctx.cafeId,
      p_order_item_id: normalizedOrderItemId,
      p_quantity: normalizedQuantity,
      ...actorRpcParams(ctx, 'p_by_staff_id', 'p_by_owner_id'),
    }, ctx.databaseKey);

    kickOpsOutboxDispatch(ctx);

    const responseBody = { ok: true };
    await completeIdempotentMutation(ctx, mutation, responseBody);
    return ok(responseBody);
  } catch (e) {
    if (mutation) {
      try {
        const ctx = await requireOpsActorContext();
        await releaseIdempotentMutation(ctx, mutation);
      } catch {}
    }
    return jsonError(e, 400);
  }
}
