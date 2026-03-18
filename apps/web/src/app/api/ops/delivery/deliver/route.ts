import { actorRpcParams, callOpsRpc, loadOrderItemMutationContext } from '@/app/api/ops/_rpc';
import {
  beginIdempotentMutation,
  buildMutationPayload,
  type BegunIdempotentMutation,
  completeIdempotentMutation,
  jsonError,
  mutationOk,
  publishOpsMutation,
  releaseIdempotentMutation,
  requireDeliveryAccess,
  requireDeliveryItemAccess,
  requireOpsActorContext,
} from '@/app/api/ops/_helpers';
import {
  OPS_SCOPE_BILLING,
  OPS_SCOPE_COMPLAINTS,
  OPS_SCOPE_DASHBOARD,
  OPS_SCOPE_NAV_SUMMARY,
  OPS_SCOPE_WAITER,
} from '@/lib/ops/workspaceScopes';

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

const MUTATION_SCOPES = [
  OPS_SCOPE_WAITER,
  OPS_SCOPE_BILLING,
  OPS_SCOPE_COMPLAINTS,
  OPS_SCOPE_DASHBOARD,
  OPS_SCOPE_NAV_SUMMARY,
] as const;

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

    const rpc = await callOpsRpc<DeliverRpcResult>('ops_deliver_available_quantities', {
      p_cafe_id: ctx.cafeId,
      p_order_item_id: normalizedOrderItemId,
      p_quantity: normalizedQuantity,
      ...actorRpcParams(ctx, 'p_by_staff_id', 'p_by_owner_id'),
    }, ctx.databaseKey);

    const appliedQuantity = Number(rpc.quantity ?? normalizedQuantity);
    const deliveredQty = Number(rpc.delivered_qty ?? 0);
    const replacementDeliveredQty = Number(rpc.replacement_delivered_qty ?? 0);

    publishOpsMutation(ctx, {
      type: 'delivery.delivered',
      entityId: item.id,
      shiftId: item.shiftId,
      data: {
        quantity: appliedQuantity,
        deliveredQty,
        replacementDeliveredQty,
        serviceSessionId: item.serviceSessionId ?? '',
      },
    });

    const responseBody = buildMutationPayload({
      data: {
        orderItemId: item.id,
        quantity: appliedQuantity,
        deliveredQty,
        replacementDeliveredQty,
        serviceSessionId: item.serviceSessionId,
      },
      mutation: {
        type: 'delivery.delivered',
        scopes: [...MUTATION_SCOPES],
        entityId: item.id,
        shiftId: item.shiftId,
      },
    });
    await completeIdempotentMutation(ctx, mutation, responseBody);
    return mutationOk({
      data: {
        orderItemId: item.id,
        quantity: appliedQuantity,
        deliveredQty,
        replacementDeliveredQty,
        serviceSessionId: item.serviceSessionId,
      },
      mutation: {
        type: 'delivery.delivered',
        scopes: [...MUTATION_SCOPES],
        entityId: item.id,
        shiftId: item.shiftId,
      },
    });
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
