import { adminOps } from '@/app/api/ops/_server';
import { actorRpcParams, callOpsRpc } from '@/app/api/ops/_rpc';
import {
  jsonError,
  ok,
  publishOpsMutation,
  requireOpenOpsShift,
  requireOpsActorContext,
  requireScopedOrderSelectionAccess,
  requireSessionOrderAccess,
} from '@/app/api/ops/_helpers';
import type { StationCode } from '@/lib/ops/types';
import { normalizeNullableStationCode } from '@/lib/ops/stations';

type CreateOrderRequestBody = {
  serviceSessionId?: string;
  items?: Array<{ productId?: string; quantity?: number }>;
};

type CreateOrderRpcResult = {
  order_id?: string;
  service_session_id?: string;
};

type MenuProductRow = {
  id?: string | null;
  station_code?: StationCode | null;
  is_active?: boolean | null;
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

    const ctx = requireSessionOrderAccess(await requireOpsActorContext());
    const shift = await requireOpenOpsShift(ctx.cafeId, ctx.databaseKey);

    const uniqueProductIds = Array.from(new Set(items.map((item) => item.menu_product_id)));
    const { data: productRows, error: productError } = await adminOps(ctx.databaseKey)
      .from('menu_products')
      .select('id, station_code, is_active')
      .eq('cafe_id', ctx.cafeId)
      .in('id', uniqueProductIds);

    if (productError) {
      throw productError;
    }

    const products = (productRows ?? []) as MenuProductRow[];
    if (products.length !== uniqueProductIds.length) {
      throw new Error('INVALID_INPUT');
    }

    const stationCodes = products.map((product) => {
      const stationCode = normalizeNullableStationCode(product.station_code);
      if (!product.id || !stationCode || product.is_active !== true) {
        throw new Error('INVALID_INPUT');
      }
      return stationCode;
    });

    requireScopedOrderSelectionAccess(ctx, stationCodes);

    const rpc = await callOpsRpc<CreateOrderRpcResult>('ops_create_order_with_items', {
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

    publishOpsMutation(ctx, {
      type: 'order.submitted',
      entityId: orderId,
      shiftId: String(shift.id),
      data: { serviceSessionId },
    });

    return ok({ ok: true, orderId });
  } catch (e) {
    return jsonError(e, 400);
  }
}
