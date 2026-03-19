import { adminOps } from '@/app/api/ops/_server';
import { actorRpcParams, callOpsRpc } from '@/app/api/ops/_rpc';
import {
  enqueueOpsMutation,
  jsonError,
  kickOpsOutboxDispatch,
  ok,
  publishOpsMutation,
  requireOpenOpsShift,
  requireOpsActorContext,
  requireScopedOrderSelectionAccess,
  requireSessionOrderAccess,
} from '@/app/api/ops/_helpers';
import { normalizeNullableStationCode } from '@/lib/ops/stations';
import type { StationCode } from '@/lib/ops/types';

type OpenAndCreateRequestBody = {
  label?: string;
  items?: Array<{ productId?: string; quantity?: number }>;
};

type MenuProductRow = {
  id?: string | null;
  station_code?: StationCode | null;
  is_active?: boolean | null;
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

    const items = body.items.map((item) => ({
      menu_product_id: String(item.productId ?? '').trim(),
      qty: Number(item.quantity ?? 0),
    }));
    if (items.some((item) => !item.menu_product_id || !Number.isInteger(item.qty) || item.qty <= 0)) {
      throw new Error('INVALID_INPUT');
    }

    const ctx = requireSessionOrderAccess(await requireOpsActorContext());
    const shift = await requireOpenOpsShift(ctx.cafeId, ctx.databaseKey);
    const uniqueProductIds = Array.from(new Set(items.map((item) => item.menu_product_id)));
    const { data: productRows, error: productError } = await adminOps(ctx.databaseKey)
      .from('menu_products')
      .select('id, station_code, is_active')
      .eq('cafe_id', ctx.cafeId)
      .in('id', uniqueProductIds);

    if (productError) throw productError;
    const products = (productRows ?? []) as MenuProductRow[];
    if (products.length !== uniqueProductIds.length) throw new Error('INVALID_INPUT');

    const productStationCodes = new Map<string, StationCode>();
    const stationCodes = products.map((product) => {
      const stationCode = normalizeNullableStationCode(product.station_code);
      if (!product.id || !stationCode || product.is_active !== true) {
        throw new Error('INVALID_INPUT');
      }
      productStationCodes.set(String(product.id), stationCode);
      return stationCode;
    });
    requireScopedOrderSelectionAccess(ctx, stationCodes);

    const stationQuantities = new Map<StationCode, number>();
    for (const item of items) {
      const stationCode = productStationCodes.get(item.menu_product_id);
      if (!stationCode) {
        throw new Error('INVALID_INPUT');
      }
      stationQuantities.set(stationCode, (stationQuantities.get(stationCode) ?? 0) + item.qty);
    }

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
      ...actorRpcParams(ctx, 'p_created_by_staff_id', 'p_created_by_owner_id'),
    }, ctx.databaseKey);

    const orderId = String(createRpc.order_id ?? '').trim();
    if (!orderId) throw new Error('INVALID_RPC_RESPONSE:ops_create_order_with_items');

    for (const [stationCode, quantity] of stationQuantities.entries()) {
      if (quantity <= 0) continue;
      const eventData = {
        serviceSessionId: sessionId,
        sessionLabel,
        stationCode,
        quantity,
        itemsCount: quantity,
      };
      const eventId = await enqueueOpsMutation(ctx, {
        type: 'station.order_submitted',
        entityId: orderId,
        shiftId: shift.id,
        data: eventData,
        scopes: [stationCode, 'dashboard', 'nav-summary'],
      });
      publishOpsMutation(ctx, {
        id: eventId,
        type: 'station.order_submitted',
        entityId: orderId,
        shiftId: shift.id,
        data: eventData,
        scopes: [stationCode, 'dashboard', 'nav-summary'],
      });
    }

    kickOpsOutboxDispatch(ctx);
    return ok({ ok: true, orderId, sessionId, label: sessionLabel });
  } catch (e) {
    return jsonError(e, 400);
  }
}
