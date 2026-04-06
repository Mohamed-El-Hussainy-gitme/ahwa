import { NextResponse } from 'next/server';
import { callOpsRpc } from '@/app/api/ops/_rpc';
import { dispatchStationOrderSubmittedInBackground, requireOrderSelectionStationCodes } from '@/app/api/ops/orders/_station-events';
import { requirePublicOrderingContext } from '@/lib/public-ordering';
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

type StageMark = {
  label: string;
  elapsedMs: number;
};

function captureStage(startedAt: number, label: string, marks: StageMark[]) {
  marks.push({
    label,
    elapsedMs: Math.round(performance.now() - startedAt),
  });
}

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const requestStartedAt = performance.now();
  const stageMarks: StageMark[] = [];
  const { slug } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = publicOrderSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: { code: 'INVALID_INPUT', message: 'Invalid order payload.' } }, { status: 400 });
  }

  try {
    const orderingContextStartedAt = performance.now();
    const { cafe, shift, owner } = await requirePublicOrderingContext(slug);
    captureStage(orderingContextStartedAt, 'ordering_context', stageMarks);

    const items = parsed.data.items.map((item) => ({
      menu_product_id: item.productId,
      qty: item.quantity,
    }));

    const stationLookupStartedAt = performance.now();
    const { productStationCodes } = await requireOrderSelectionStationCodes(
      {
        cafeId: cafe.cafeId,
        tenantSlug: cafe.cafeSlug,
        databaseKey: cafe.databaseKey,
        runtimeUserId: owner.ownerId,
        fullName: owner.fullName,
        accountKind: 'owner',
        shiftId: String(shift.id),
        shiftRole: null,
        actorOwnerId: owner.ownerId,
        actorStaffId: null,
      },
      items.map((item) => item.menu_product_id),
    );
    captureStage(stationLookupStartedAt, 'station_lookup', stageMarks);

    const sessionLabel = buildSessionLabel(parsed.data.customerName, parsed.data.tableLabel);
    const noteSegments = [
      `طلب QR`,
      `الاسم: ${parsed.data.customerName}`,
      parsed.data.tableLabel ? `الطاولة: ${parsed.data.tableLabel}` : null,
      parsed.data.notes ? `ملاحظة العميل: ${parsed.data.notes}` : null,
      `القناة: public_qr`,
    ].filter(Boolean);

    const openSessionStartedAt = performance.now();
    const openRpc = await callOpsRpc<OpenSessionRpcResult>('ops_open_or_resume_service_session_with_outbox', {
      p_cafe_id: cafe.cafeId,
      p_shift_id: shift.id,
      p_session_label: sessionLabel,
      p_staff_member_id: null,
      p_owner_user_id: owner.ownerId,
    }, cafe.databaseKey);
    captureStage(openSessionStartedAt, 'open_session_rpc', stageMarks);

    const createdSessionId = String(openRpc.service_session_id ?? '').trim();
    const createdSessionLabel = String(openRpc.session_label ?? sessionLabel).trim();
    if (!createdSessionId) {
      throw new Error('INVALID_RPC_RESPONSE:ops_open_or_resume_service_session');
    }

    const createOrderStartedAt = performance.now();
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
    captureStage(createOrderStartedAt, 'create_order_rpc', stageMarks);

    const orderId = String(createRpc.order_id ?? '').trim();
    if (!orderId) {
      throw new Error('INVALID_RPC_RESPONSE:ops_create_order_with_items');
    }

    dispatchStationOrderSubmittedInBackground(
      { cafeId: cafe.cafeId, databaseKey: cafe.databaseKey, shiftId: String(shift.id) },
      {
        orderId,
        serviceSessionId: createdSessionId,
        sessionLabel: createdSessionLabel,
        items: parsed.data.items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
        productStationCodes,
        source: 'public_qr',
      },
    );

    console.info('[public-order] success', {
      slug,
      cafeId: cafe.cafeId,
      orderId,
      totalMs: Math.round(performance.now() - requestStartedAt),
      stages: stageMarks,
    });

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
    console.error('[public-order] failed', {
      slug,
      totalMs: Math.round(performance.now() - requestStartedAt),
      stages: stageMarks,
      error: message,
    });
    const status = message === 'CAFE_NOT_FOUND' ? 404 : message === 'NO_OPEN_SHIFT' ? 409 : 400;
    return NextResponse.json({ ok: false, error: { code: message, message } }, { status });
  }
}
