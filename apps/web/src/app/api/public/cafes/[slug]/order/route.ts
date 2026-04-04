import { NextResponse } from 'next/server';
import { callOpsRpc } from '@/app/api/ops/_rpc';
import { enqueueOpsMutation, kickOpsOutboxDispatch, publishOpsMutation } from '@/app/api/ops/_helpers';
import { adminOps } from '@/app/api/ops/_server';
import { normalizeNullableStationCode } from '@/lib/ops/stations';
import type { StationCode } from '@/lib/ops/types';
import { requirePublicOrderingContext, resolveFallbackOwnerActor } from '@/lib/public-ordering';
import { z } from 'zod';

const publicOrderSchema = z.object({
  customerName: z.string().trim().min(2).max(60),
  tableLabel: z.string().trim().max(30).optional().default(''),
  notes: z.string().trim().max(240).optional().default(''),
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.coerce.number().int().min(1).max(20),
  })).min(1).max(30),
});

type MenuProductRow = {
  id?: string | null;
  product_name?: string | null;
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

function buildSessionLabel(customerName: string, tableLabel?: string) {
  const compactName = customerName.replace(/\s+/g, ' ').trim();
  const compactTable = String(tableLabel ?? '').replace(/\s+/g, ' ').trim();
  return compactTable ? `QR-${compactTable}-${compactName}` : `QR-${compactName}`;
}

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = publicOrderSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: { code: 'INVALID_INPUT', message: 'Invalid order payload.' } }, { status: 400 });
  }

  try {
    const { cafe, shift } = await requirePublicOrderingContext(slug);
    const owner = await resolveFallbackOwnerActor(cafe.cafeId, cafe.databaseKey);
    const items = parsed.data.items.map((item) => ({
      menu_product_id: item.productId,
      qty: item.quantity,
    }));

    const uniqueProductIds = Array.from(new Set(items.map((item) => item.menu_product_id)));
    const { data: productRows, error: productError } = await adminOps(cafe.databaseKey)
      .from('menu_products')
      .select('id, product_name, station_code, is_active')
      .eq('cafe_id', cafe.cafeId)
      .in('id', uniqueProductIds);

    if (productError) throw productError;

    const products = (productRows ?? []) as MenuProductRow[];
    if (products.length !== uniqueProductIds.length) {
      throw new Error('INVALID_INPUT');
    }

    const productStationCodes = new Map<string, StationCode>();
    for (const product of products) {
      const stationCode = normalizeNullableStationCode(product.station_code);
      if (!product.id || !stationCode || product.is_active !== true) {
        throw new Error('INVALID_INPUT');
      }
      productStationCodes.set(String(product.id), stationCode);
    }

    const sessionLabel = buildSessionLabel(parsed.data.customerName, parsed.data.tableLabel);
    const noteSegments = [
      `طلب QR`,
      `الاسم: ${parsed.data.customerName}`,
      parsed.data.tableLabel ? `الطاولة: ${parsed.data.tableLabel}` : null,
      parsed.data.notes ? `ملاحظة العميل: ${parsed.data.notes}` : null,
      `القناة: public_qr`,
    ].filter(Boolean);

    const openRpc = await callOpsRpc<OpenSessionRpcResult>('ops_open_or_resume_service_session_with_outbox', {
      p_cafe_id: cafe.cafeId,
      p_shift_id: shift.id,
      p_session_label: sessionLabel,
      p_staff_member_id: null,
      p_owner_user_id: owner.ownerId,
    }, cafe.databaseKey);

    const createdSessionId = String(openRpc.service_session_id ?? '').trim();
    const createdSessionLabel = String(openRpc.session_label ?? sessionLabel).trim();
    if (!createdSessionId) {
      throw new Error('INVALID_RPC_RESPONSE:ops_open_or_resume_service_session');
    }

    const createRpc = await callOpsRpc<CreateOrderRpcResult>('ops_create_order_with_items_with_outbox', {
      p_cafe_id: cafe.cafeId,
      p_shift_id: shift.id,
      p_service_session_id: createdSessionId,
      p_session_label: createdSessionLabel,
      p_created_by_staff_id: null,
      p_created_by_owner_id: owner.ownerId,
      p_items: items,
      p_notes: noteSegments.join(' | '),
    }, cafe.databaseKey);

    const orderId = String(createRpc.order_id ?? '').trim();
    if (!orderId) {
      throw new Error('INVALID_RPC_RESPONSE:ops_create_order_with_items');
    }

    const stationQuantities = new Map<StationCode, number>();
    for (const item of items) {
      const stationCode = productStationCodes.get(item.menu_product_id);
      if (!stationCode) continue;
      stationQuantities.set(stationCode, (stationQuantities.get(stationCode) ?? 0) + item.qty);
    }

    const publicCtx = {
      cafeId: cafe.cafeId,
      databaseKey: cafe.databaseKey,
      shiftId: String(shift.id),
    };

    for (const [stationCode, quantity] of stationQuantities.entries()) {
      const eventData = {
        serviceSessionId: createdSessionId,
        sessionLabel: createdSessionLabel,
        stationCode,
        quantity,
        itemsCount: quantity,
        source: 'public_qr',
      };
      const eventId = await enqueueOpsMutation(publicCtx, {
        type: 'station.order_submitted',
        entityId: orderId,
        shiftId: String(shift.id),
        data: eventData,
        scopes: [stationCode, 'dashboard', 'nav-summary'],
      });
      await publishOpsMutation({ cafeId: cafe.cafeId, shiftId: String(shift.id) }, {
        id: eventId,
        type: 'station.order_submitted',
        entityId: orderId,
        shiftId: String(shift.id),
        data: eventData,
        scopes: [stationCode, 'dashboard', 'nav-summary'],
      });
    }

    kickOpsOutboxDispatch({ cafeId: cafe.cafeId, databaseKey: cafe.databaseKey });

    return NextResponse.json({
      ok: true,
      orderId,
      sessionId: createdSessionId,
      sessionLabel: createdSessionLabel,
      cafe: {
        id: cafe.cafeId,
        slug: cafe.cafeSlug,
        name: cafe.cafeName,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PUBLIC_ORDER_CREATE_FAILED';
    const status = message === 'CAFE_NOT_FOUND' ? 404 : message === 'NO_OPEN_SHIFT' ? 409 : 400;
    return NextResponse.json({ ok: false, error: { code: message, message } }, { status });
  }
}
