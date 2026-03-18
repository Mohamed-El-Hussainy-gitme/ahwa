import { adminOps } from '@/app/api/ops/_server';
import { actorRpcParams, callOpsRpc } from '@/app/api/ops/_rpc';
import {
  beginIdempotentMutation,
  buildMutationPayload,
  type BegunIdempotentMutation,
  completeIdempotentMutation,
  jsonError,
  mutationOk,
  publishOpsMutation,
  releaseIdempotentMutation,
  requireOpenOpsShift,
  requireOpsActorContext,
  requireScopedOrderSelectionAccess,
  requireSessionOrderAccess,
} from '@/app/api/ops/_helpers';
import type { StationCode } from '@/lib/ops/types';
import {
  OPS_SCOPE_COMPLAINTS,
  OPS_SCOPE_DASHBOARD,
  OPS_SCOPE_MENU,
  OPS_SCOPE_NAV_SUMMARY,
  OPS_SCOPE_STATION_BARISTA,
  OPS_SCOPE_STATION_SHISHA,
  OPS_SCOPE_WAITER,
} from '@/lib/ops/workspaceScopes';
import { normalizeNullableStationCode } from '@/lib/ops/stations';

type OpenAndCreateOrderRequestBody = {
  serviceSessionId?: string;
  label?: string;
  items?: Array<{ productId?: string; quantity?: number }>;
};

type CreateOrderRpcResult = {
  order_id?: string;
  service_session_id?: string;
  session_label?: string;
  items_count?: number | string;
};

type MenuProductRow = {
  id?: string | null;
  station_code?: StationCode | null;
  is_active?: boolean | null;
};

const MUTATION_SCOPES = [
  OPS_SCOPE_WAITER,
  OPS_SCOPE_MENU,
  OPS_SCOPE_STATION_BARISTA,
  OPS_SCOPE_STATION_SHISHA,
  OPS_SCOPE_COMPLAINTS,
  OPS_SCOPE_DASHBOARD,
  OPS_SCOPE_NAV_SUMMARY,
] as const;

export async function POST(req: Request) {
  let mutation: BegunIdempotentMutation | null = null;

  try {
    const body = (await req.json().catch(() => ({}))) as OpenAndCreateOrderRequestBody;
    const normalizedServiceSessionId = String(body.serviceSessionId ?? '').trim();
    const normalizedLabel = String(body.label ?? '').trim();

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

    const started = await beginIdempotentMutation(req, ctx, 'ops.orders.open-and-create', {
      shiftId: String(shift.id),
      serviceSessionId: normalizedServiceSessionId || null,
      label: normalizedLabel || null,
      items,
    });
    if (started.replayResponse) {
      return started.replayResponse;
    }
    mutation = started.mutation;

    const rpc = await callOpsRpc<CreateOrderRpcResult>('ops_create_order_with_items', {
      p_cafe_id: ctx.cafeId,
      p_shift_id: shift.id,
      p_service_session_id: normalizedServiceSessionId || null,
      p_session_label: normalizedServiceSessionId ? null : normalizedLabel || null,
      p_items: items,
      ...actorRpcParams(ctx, 'p_created_by_staff_id', 'p_created_by_owner_id'),
    }, ctx.databaseKey);

    const orderId = String(rpc.order_id ?? '').trim();
    const serviceSessionId = String(rpc.service_session_id ?? normalizedServiceSessionId).trim();
    const sessionLabel = String(rpc.session_label ?? normalizedLabel).trim();
    const itemsCount = Number(rpc.items_count ?? items.length);
    if (!orderId || !serviceSessionId || !sessionLabel) {
      throw new Error('INVALID_RPC_RESPONSE:ops_create_order_with_items');
    }

    publishOpsMutation(ctx, {
      type: 'order.submitted',
      entityId: orderId,
      shiftId: String(shift.id),
      data: { serviceSessionId, sessionLabel, itemsCount },
    });

    const responseBody = buildMutationPayload({
      data: {
        orderId,
        sessionId: serviceSessionId,
        label: sessionLabel,
        itemsCount,
      },
      mutation: {
        type: 'order.submitted',
        scopes: [...MUTATION_SCOPES],
        entityId: orderId,
        shiftId: String(shift.id),
      },
    });
    await completeIdempotentMutation(ctx, mutation, responseBody);
    return mutationOk({
      data: {
        orderId,
        sessionId: serviceSessionId,
        label: sessionLabel,
        itemsCount,
      },
      mutation: {
        type: 'order.submitted',
        scopes: [...MUTATION_SCOPES],
        entityId: orderId,
        shiftId: String(shift.id),
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
