import { actorRpcParams, callOpsRpc } from '@/app/api/ops/_rpc';
import {
  jsonError,
  ok,
  requireOpenOpsShift,
  requireOpsActorContext,
  requireSessionOrderAccess,
} from '@/app/api/ops/_helpers';
import { dispatchStationOrderSubmittedInBackground, requireOrderSelectionStationCodes } from '../_station-events';
import { persistOrderNotePreset } from '../../_order-note-presets';

type CreateOrderRequestBody = {
  serviceSessionId?: string;
  notes?: string;
  items?: Array<{ productId?: string; quantity?: number; notes?: string }>;
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
      notes: String(item.notes ?? '').trim() || null,
    }));

    if (items.some((item) => !item.menu_product_id || !Number.isInteger(item.qty) || item.qty <= 0)) {
      throw new Error('INVALID_INPUT');
    }

    const ctx = requireSessionOrderAccess(await requireOpsActorContext());
    const shift = await requireOpenOpsShift(ctx.cafeId, ctx.databaseKey);

    const { productStationCodes } = await requireOrderSelectionStationCodes(
      ctx,
      items.map((item) => item.menu_product_id),
    );

    const { stationCodes, productStationCodes } = await requireOrderSelectionStationCodes({
  databaseKey: ctx.databaseKey,
  items: body.items,
});

void persistOrderNotePreset({
  cafeId: ctx.cafeId,
  databaseKey: ctx.databaseKey,
  note: body.notes,
  productStationCodes: stationCodes,
});
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

    return ok({ ok: true, orderId, serviceSessionId });
  } catch (e) {
    return jsonError(e, 400);
  }
}
