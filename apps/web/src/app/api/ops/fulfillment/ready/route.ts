import { actorRpcParams, callOpsRpc, loadOrderItemMutationContext } from '@/app/api/ops/_rpc';
import {
  beginIdempotentMutation,
  type BegunIdempotentMutation,
  completeIdempotentMutation,
  jsonError,
  ok,
  publishOpsMutation,
  kickOpsOutboxDispatch,
  releaseIdempotentMutation,
  requireOpsActorContext,
  requireStationAccess,
} from '@/app/api/ops/_helpers';
import { sendOpsPushToRoles } from '@/lib/pwa/push-server';

type MarkReadyRpcResult = {
  ok?: boolean;
  outbox_event_id?: string;
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

    const rpc = await callOpsRpc<MarkReadyRpcResult>('ops_mark_ready_with_outbox', {
      p_cafe_id: ctx.cafeId,
      p_order_item_id: normalizedOrderItemId,
      p_quantity: normalizedQuantity,
      ...actorRpcParams(ctx, 'p_by_staff_id', 'p_by_owner_id'),
    }, ctx.databaseKey);

    const outboxEventId = String(rpc.outbox_event_id ?? '').trim() || null;
    if (outboxEventId) {
      await publishOpsMutation(ctx, {
        id: outboxEventId,
        type: 'station.ready',
        entityId: normalizedOrderItemId,
        shiftId: item.shiftId,
        data: {
          quantity: normalizedQuantity,
          stationCode,
          serviceSessionId: item.serviceSessionId,
        },
        scopes: ['waiter', 'barista', 'shisha', 'dashboard', 'nav-summary'],
      });
    }

    void sendOpsPushToRoles({
      cafeId: ctx.cafeId,
      databaseKey: ctx.databaseKey,
      shiftId: item.shiftId,
      roles: ['waiter', 'american_waiter'],
      payload: {
        title: 'جاهز للتسليم',
        body: 'تم تجهيز طلب جديد ويحتاج الاستلام والتسليم الآن.',
        tag: `ops:ready:${normalizedOrderItemId}`,
        url: '/ready',
        signal: 'waiter-ready',
        requireInteraction: true,
      },
    });

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
