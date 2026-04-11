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
import { persistOrderItemAddons } from '../_addons';
import { triggerCafeRuntimeStatusSync } from '@/lib/control-plane/runtime-status-trigger';

type CreateOrderRequestBody = {
  serviceSessionId?: string;
  notes?: string;
  items?: Array<{ productId?: string; quantity?: number; notes?: string; addonIds?: string[] }>;
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

    const requestedItems = body.items.map((item) => ({
      productId: String(item.productId ?? '').trim(),
      quantity: Number(item.quantity ?? 0),
      notes: String(item.notes ?? '').trim() || null,
      addonIds: Array.isArray(item.addonIds)
        ? item.addonIds.map((addonId) => String(addonId ?? '').trim()).filter(Boolean)
        : [],
    }));

    if (requestedItems.some((item) => !item.productId || !Number.isInteger(item.quantity) || item.quantity <= 0)) {
      throw new Error('INVALID_INPUT');
    }

    const uniqueProductIds = new Set(requestedItems.map((item) => item.productId));
    if (uniqueProductIds.size !== requestedItems.length) {
      throw new Error('DUPLICATE_PRODUCT_SELECTION_NOT_SUPPORTED');
    }

    const items = requestedItems.map((item) => ({
      menu_product_id: item.productId,
      qty: item.quantity,
      notes: item.notes,
    }));

    const ctx = requireSessionOrderAccess(await requireOpsActorContext());
    const shift = await requireOpenOpsShift(ctx.cafeId, ctx.databaseKey);

    const { stationCodes, productStationCodes } = await requireOrderSelectionStationCodes(
      ctx,
      items.map((item) => item.menu_product_id),
    );

    const rpc = await callOpsRpc<CreateOrderRpcResult>('ops_create_order_with_items_with_outbox', {
      p_cafe_id: ctx.cafeId,
      p_shift_id: shift.id,
      p_service_session_id: String(body.serviceSessionId),
      p_items: items,
      p_notes: String(body.notes ?? '').trim() || null,
      ...actorRpcParams(ctx, 'p_created_by_staff_id', 'p_created_by_owner_id'),
    }, ctx.databaseKey);

    const orderId = String(rpc.order_id ?? '').trim();
    if (!orderId) {
      throw new Error('INVALID_RPC_RESPONSE:ops_create_order_with_items');
    }

    await persistOrderItemAddons({
      cafeId: ctx.cafeId,
      orderId,
      databaseKey: ctx.databaseKey,
      items: requestedItems.map((item) => ({ productId: item.productId, quantity: item.quantity, addonIds: item.addonIds })),
    });

    await persistOrderNotePreset({
      cafeId: ctx.cafeId,
      databaseKey: ctx.databaseKey,
      note: body.notes,
      productStationCodes: stationCodes,
    });
    const serviceSessionId = String(rpc.service_session_id ?? body.serviceSessionId).trim();
    if (!serviceSessionId) {
      throw new Error('INVALID_RPC_RESPONSE:ops_create_order_with_items');
    }

    dispatchStationOrderSubmittedInBackground(ctx, {
      orderId,
      serviceSessionId,
      items: requestedItems.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
      productStationCodes,
    });

    triggerCafeRuntimeStatusSync(
      { cafeId: ctx.cafeId, databaseKey: ctx.databaseKey },
      { source: 'api/ops/orders/create-with-items' },
    );

    return ok({ ok: true, orderId, serviceSessionId });
  } catch (e) {
    return jsonError(e, 400);
  }
}
