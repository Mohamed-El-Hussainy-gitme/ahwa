import { actorRpcParams, callOpsRpc, loadOrderItemMutationContext } from '@/app/api/ops/_rpc';
import { jsonError, ok, publishOpsMutation, requireOpsActorContext, requireStationAccess, type OpsActorContext } from '@/app/api/ops/_helpers';

type MarkReadyRpcResult = {
  ok?: boolean;
};

async function mark(
  orderItemId: string,
  quantity: number,
  rpcName: 'ops_mark_partial_ready' | 'ops_mark_ready',
  eventType: 'station.partial_ready' | 'station.ready',
  ctx: OpsActorContext,
) {
  if (!orderItemId || !Number.isInteger(quantity) || quantity <= 0) {
    throw new Error('INVALID_INPUT');
  }

  const item = await loadOrderItemMutationContext(ctx.cafeId, orderItemId);
  const stationCode = item.stationCode === 'shisha' ? 'shisha' : 'barista';
  requireStationAccess(ctx, stationCode);

  await callOpsRpc<MarkReadyRpcResult>(rpcName, {
    p_cafe_id: ctx.cafeId,
    p_order_item_id: orderItemId,
    p_quantity: quantity,
    ...actorRpcParams(ctx, 'p_by_staff_id', 'p_by_owner_id'),
  });

  publishOpsMutation(ctx, {
    type: eventType,
    entityId: item.id,
    shiftId: item.shiftId,
    data: { quantity, stationCode: item.stationCode ?? '' },
  });
}

export async function POST(req: Request) {
  try {
    const { orderItemId, quantity } = (await req.json()) as { orderItemId?: string; quantity?: number };
    const ctx = await requireOpsActorContext();
    await mark(String(orderItemId ?? '').trim(), Number(quantity ?? 0), 'ops_mark_partial_ready', 'station.partial_ready', ctx);
    return ok({ ok: true });
  } catch (e) {
    return jsonError(e, 400);
  }
}
