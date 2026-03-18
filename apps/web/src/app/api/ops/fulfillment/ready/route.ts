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
  requireOpsActorContext,
  requireStationAccess,
} from '@/app/api/ops/_helpers';
import {
  OPS_SCOPE_DASHBOARD,
  OPS_SCOPE_NAV_SUMMARY,
  OPS_SCOPE_STATION_BARISTA,
  OPS_SCOPE_STATION_SHISHA,
  OPS_SCOPE_WAITER,
} from '@/lib/ops/workspaceScopes';

type MarkReadyRpcResult = {
  ok?: boolean;
};

const MUTATION_SCOPES = [
  OPS_SCOPE_STATION_BARISTA,
  OPS_SCOPE_STATION_SHISHA,
  OPS_SCOPE_WAITER,
  OPS_SCOPE_DASHBOARD,
  OPS_SCOPE_NAV_SUMMARY,
] as const;

export async function POST(req: Request) {
  let mutation: BegunIdempotentMutation | null = null;

  try {
    const { orderItemId, quantity } = (await req.json()) as { orderItemId?: string; quantity?: number };
    const normalizedOrderItemId = String(orderItemId ?? '').trim();
    const normalizedQuantity = Number(quantity ?? 0);
    if (!normalizedOrderItemId || !Number.isInteger(normalizedQuantity) || normalizedQuantity <= 0) {
      throw new Error('INVALID_INPUT');
    }

    const ctx = await requireOpsActorContext();
    const item = await loadOrderItemMutationContext(ctx.cafeId, normalizedOrderItemId, ctx.databaseKey);
    const stationCode = item.stationCode === 'shisha' ? 'shisha' : 'barista';
    requireStationAccess(ctx, stationCode);

    const started = await beginIdempotentMutation(req, ctx, 'ops.fulfillment.ready', {
      orderItemId: normalizedOrderItemId,
      quantity: normalizedQuantity,
      stationCode,
    });
    if (started.replayResponse) {
      return started.replayResponse;
    }
    mutation = started.mutation;

    await callOpsRpc<MarkReadyRpcResult>('ops_mark_ready', {
      p_cafe_id: ctx.cafeId,
      p_order_item_id: normalizedOrderItemId,
      p_quantity: normalizedQuantity,
      ...actorRpcParams(ctx, 'p_by_staff_id', 'p_by_owner_id'),
    }, ctx.databaseKey);

    publishOpsMutation(ctx, {
      type: 'station.ready',
      entityId: item.id,
      shiftId: item.shiftId,
      data: { quantity: normalizedQuantity, stationCode: item.stationCode ?? '' },
    });

    const responseBody = buildMutationPayload({
      data: {
        orderItemId: item.id,
        quantity: normalizedQuantity,
        stationCode: item.stationCode ?? stationCode,
      },
      mutation: {
        type: 'station.ready',
        scopes: [...MUTATION_SCOPES],
        entityId: item.id,
        shiftId: item.shiftId,
      },
    });
    await completeIdempotentMutation(ctx, mutation, responseBody);
    return mutationOk({
      data: {
        orderItemId: item.id,
        quantity: normalizedQuantity,
        stationCode: item.stationCode ?? stationCode,
      },
      mutation: {
        type: 'station.ready',
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
