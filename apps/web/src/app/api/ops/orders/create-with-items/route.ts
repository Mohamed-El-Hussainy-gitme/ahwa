import { actorRpcParams, callOpsRpc } from '@/app/api/ops/_rpc';
import {
  jsonError,
  ok,
  requireOpenOpsShift,
  requireOpsActorContext,
  requireSessionOrderAccess,
} from '@/app/api/ops/_helpers';
import { dispatchStationOrderSubmittedInBackground, requireOrderSelectionStationCodes } from '../_station-events';

type CreateOrderRequestBody = {
  serviceSessionId?: string;
  items?: Array<{ productId?: string; quantity?: number }>;
};

type CreateOrderRpcResult = {
  order_id?: string;
  service_session_id?: string;
};


export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as CreateOrderRequestBody;

    if (!body.serviceSessionId || !Array.isArray(body.items) || body.items.length === 0) {
      throw new Error('INVALID_INPUT');
    }

    const items = body.items.map((item) => ({
      menu_product_id: String(item.productId ?? '').trim(),
      qty: Number(item.quantity ?? 0),
    }));

    if (items.some((item) => !item.menu_product_id || !Number.isInteger(item.qty) || item.qty <= 0)) {
      throw new Error('INVALID_INPUT');
    }

    const startedAt = Date.now();
    const ctx = requireSessionOrderAccess(await requireOpsActorContext());
    const [shift, { productStationCodes }] = await Promise.all([
      requireOpenOpsShift(ctx.cafeId, ctx.databaseKey),
      requireOrderSelectionStationCodes(
        ctx,
        items.map((item) => item.menu_product_id),
      ),
    ]);

    const rpc = await callOpsRpc<CreateOrderRpcResult>('ops_create_order_with_items_with_outbox', {
      p_cafe_id: ctx.cafeId,
      p_shift_id: shift.id,
      p_service_session_id: String(body.serviceSessionId),
      p_items: items,
      ...actorRpcParams(ctx, 'p_created_by_staff_id', 'p_created_by_owner_id'),
    }, ctx.databaseKey);

    const orderId = String(rpc.order_id ?? '').trim();
    const serviceSessionId = String(rpc.service_session_id ?? body.serviceSessionId).trim();
    if (!orderId || !serviceSessionId) {
      throw new Error('INVALID_RPC_RESPONSE:ops_create_order_with_items');
    }

    dispatchStationOrderSubmittedInBackground(ctx, {
      orderId,
      serviceSessionId,
      items: body.items.map((item) => ({
        productId: String(item.productId ?? ''),
        quantity: Number(item.quantity ?? 0),
      })),
      productStationCodes,
    });

    console.info('[ops.orders.create-with-items]', {
      cafeId: ctx.cafeId,
      serviceSessionId,
      itemsCount: items.length,
      durationMs: Date.now() - startedAt,
    });

    return ok({ ok: true, orderId, serviceSessionId });
  } catch (e) {
    return jsonError(e, 400);
  }
}
