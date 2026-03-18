import { actorRpcParams, callOpsRpc, loadOrderItemMutationContext } from '@/app/api/ops/_rpc';
import {
  beginIdempotentMutation,
  type BegunIdempotentMutation,
  completeIdempotentMutation,
  jsonError,
  ok,
  publishOpsMutation,
  releaseIdempotentMutation,
  requireComplaintActionAccess,
  requireComplaintManagementAccess,
  requireOpsActorContext,
} from '@/app/api/ops/_helpers';

type RemakeRpcResult = {
  ok?: boolean;
};

export async function POST(req: Request) {
  let mutation: BegunIdempotentMutation | null = null;

  try {
    const { orderItemId, quantity } = (await req.json()) as { orderItemId?: string; quantity?: number };
    const normalizedOrderItemId = String(orderItemId ?? '').trim();
    const normalizedQuantity = Number(quantity ?? 0);
    if (!normalizedOrderItemId || !Number.isInteger(normalizedQuantity) || normalizedQuantity <= 0) {
      throw new Error('INVALID_INPUT');
    }

    const ctx = requireComplaintManagementAccess(await requireOpsActorContext());
    const item = await loadOrderItemMutationContext(ctx.cafeId, normalizedOrderItemId, ctx.databaseKey);
    requireComplaintActionAccess(ctx, item.stationCode as 'barista' | 'shisha' | 'service' | null);

    const started = await beginIdempotentMutation(req, ctx, 'ops.fulfillment.remake', {
      orderItemId: normalizedOrderItemId,
      quantity: normalizedQuantity,
    });
    if (started.replayResponse) {
      return started.replayResponse;
    }
    mutation = started.mutation;

    await callOpsRpc<RemakeRpcResult>('ops_request_remake', {
      p_cafe_id: ctx.cafeId,
      p_order_item_id: normalizedOrderItemId,
      p_quantity: normalizedQuantity,
      ...actorRpcParams(ctx, 'p_by_staff_id', 'p_by_owner_id'),
    }, ctx.databaseKey);

    publishOpsMutation(ctx, {
      type: 'station.remake_requested',
      entityId: item.id,
      shiftId: item.shiftId,
      data: { quantity: normalizedQuantity, stationCode: item.stationCode ?? '' },
    });

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
