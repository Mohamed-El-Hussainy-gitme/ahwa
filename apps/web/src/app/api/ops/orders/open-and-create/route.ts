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

type OpenAndCreateRequestBody = {
  label?: string;
  notes?: string;
  items?: Array<{ productId?: string; quantity?: number; notes?: string; addonIds?: string[] }>;
};


type OpenSessionRpcResult = {
  service_session_id?: string;
  session_label?: string;
};

type CreateOrderRpcResult = {
  order_id?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as OpenAndCreateRequestBody;
    if (!Array.isArray(body.items) || body.items.length === 0) {
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

    const openRpc = await callOpsRpc<OpenSessionRpcResult>('ops_open_or_resume_service_session_with_outbox', {
      p_cafe_id: ctx.cafeId,
      p_shift_id: shift.id,
      p_session_label: String(body.label ?? '').trim() || null,
      ...actorRpcParams(ctx, 'p_staff_member_id', 'p_owner_user_id'),
    }, ctx.databaseKey);

    const sessionId = String(openRpc.service_session_id ?? '').trim();
    const sessionLabel = String(openRpc.session_label ?? '').trim();
    if (!sessionId || !sessionLabel) {
      throw new Error('INVALID_RPC_RESPONSE:ops_open_or_resume_service_session');
    }

    const createRpc = await callOpsRpc<CreateOrderRpcResult>('ops_create_order_with_items_with_outbox', {
      p_cafe_id: ctx.cafeId,
      p_shift_id: shift.id,
      p_service_session_id: sessionId,
      p_items: items,
      p_notes: String(body.notes ?? '').trim() || null,
      ...actorRpcParams(ctx, 'p_created_by_staff_id', 'p_created_by_owner_id'),
    }, ctx.databaseKey);

    const orderId = String(createRpc.order_id ?? '').trim();
    if (!orderId) throw new Error('INVALID_RPC_RESPONSE:ops_create_order_with_items');

    await Promise.all([
      persistOrderItemAddons({
        cafeId: ctx.cafeId,
        orderId,
        databaseKey: ctx.databaseKey,
        items: requestedItems.map((item) => ({ productId: item.productId, quantity: item.quantity, addonIds: item.addonIds })),
      }),
      persistOrderNotePreset({
        cafeId: ctx.cafeId,
        databaseKey: ctx.databaseKey,
        note: body.notes,
        productStationCodes: stationCodes,
      }),
    ]);
    dispatchStationOrderSubmittedInBackground(ctx, {
      orderId,
      serviceSessionId: sessionId,
      sessionLabel,
      items: requestedItems.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
      productStationCodes,
    });
    return ok({ ok: true, orderId, sessionId, label: sessionLabel });
  } catch (e) {
    return jsonError(e, 400);
  }
}
