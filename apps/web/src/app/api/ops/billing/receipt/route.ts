import { adminOps, loadBillingSettings } from '@/app/api/ops/_server';
import { jsonError, ok, requireBillingAccess, requireOpsActorContext } from '@/app/api/ops/_helpers';
import { computeBillingTotals, parseBillingAllocations } from '@/lib/ops/billing';
import { resolveBillingContext } from '@/app/api/ops/_billing';

type PaymentRow = {
  id: string;
  cafe_id: string;
  service_session_id: string;
  payment_kind: 'cash' | 'deferred' | 'mixed' | 'repayment' | 'adjustment';
  total_amount: number | string | null;
  subtotal_amount: number | string | null;
  tax_amount: number | string | null;
  tax_rate: number | string | null;
  service_amount: number | string | null;
  service_rate: number | string | null;
  debtor_name: string | null;
  notes: string | null;
  created_at: string;
  by_staff_id: string | null;
  by_owner_id: string | null;
};

type AllocationRow = {
  order_item_id: string;
  quantity: number | string | null;
  amount: number | string | null;
};

type OrderItemRow = {
  id: string;
  unit_price: number | string | null;
  notes: string | null;
  menu_products?: { product_name?: string | null } | Array<{ product_name?: string | null }> | null;
};

async function resolveActorLabel(
  admin: ReturnType<typeof adminOps>,
  cafeId: string,
  staffId: string | null | undefined,
  ownerId: string | null | undefined,
) {
  let actorLabel = 'غير معروف';

  if (ownerId) {
    const { data, error } = await admin
      .from('owner_users')
      .select('full_name')
      .eq('cafe_id', cafeId)
      .eq('id', ownerId)
      .maybeSingle();
    if (error) throw error;
    actorLabel = String(data?.full_name ?? actorLabel);
  } else if (staffId) {
    const { data, error } = await admin
      .from('staff_members')
      .select('full_name')
      .eq('cafe_id', cafeId)
      .eq('id', staffId)
      .maybeSingle();
    if (error) throw error;
    actorLabel = String(data?.full_name ?? actorLabel);
  }

  return actorLabel;
}

async function loadSessionAndCafeMeta(admin: ReturnType<typeof adminOps>, cafeId: string, sessionId: string) {
  const [{ data: sessionRow, error: sessionError }, { data: cafeRow, error: cafeError }] = await Promise.all([
    admin
      .from('service_sessions')
      .select('session_label')
      .eq('cafe_id', cafeId)
      .eq('id', sessionId)
      .maybeSingle(),
    admin
      .from('cafes')
      .select('display_name')
      .eq('id', cafeId)
      .maybeSingle(),
  ]);

  if (sessionError) throw sessionError;
  if (cafeError) throw cafeError;

  return {
    sessionLabel: String(sessionRow?.session_label ?? ''),
    cafeName: String(cafeRow?.display_name ?? ''),
  };
}

async function loadOrderItems(admin: ReturnType<typeof adminOps>, cafeId: string, orderItemIds: string[]) {
  if (!orderItemIds.length) return [] as OrderItemRow[];

  const result = await admin
    .from('order_items')
    .select('id, unit_price, notes, menu_products!inner(product_name)')
    .eq('cafe_id', cafeId)
    .in('id', orderItemIds);

  if (result.error) throw result.error;
  return (result.data ?? []) as OrderItemRow[];
}

export async function GET(req: Request) {
  try {
    const ctx = requireBillingAccess(await requireOpsActorContext());
    const url = new URL(req.url);
    const paymentId = String(url.searchParams.get('paymentId') ?? '').trim();
    const previewSessionId = String(url.searchParams.get('sessionId') ?? '').trim();
    const previewDebtorName = String(url.searchParams.get('debtorName') ?? '').trim() || null;
    const admin = adminOps(ctx.databaseKey);

    if (paymentId) {
      const { data: payment, error: paymentError } = await admin
        .from('payments')
        .select('id, cafe_id, service_session_id, payment_kind, total_amount, subtotal_amount, tax_amount, tax_rate, service_amount, service_rate, debtor_name, notes, created_at, by_staff_id, by_owner_id')
        .eq('cafe_id', ctx.cafeId)
        .eq('id', paymentId)
        .maybeSingle();
      if (paymentError) throw paymentError;
      if (!payment) throw new Error('PAYMENT_NOT_FOUND');

      const paymentRow = payment as PaymentRow;

      const [{ data: allocations, error: allocationsError }, sessionMeta, actorLabel] = await Promise.all([
        admin
          .from('payment_allocations')
          .select('order_item_id, quantity, amount')
          .eq('cafe_id', ctx.cafeId)
          .eq('payment_id', paymentId)
          .order('created_at', { ascending: true }),
        loadSessionAndCafeMeta(admin, ctx.cafeId, paymentRow.service_session_id),
        resolveActorLabel(admin, ctx.cafeId, paymentRow.by_staff_id, paymentRow.by_owner_id),
      ]);

      if (allocationsError) throw allocationsError;

      const allocationRows = (allocations ?? []) as AllocationRow[];
      const orderItems = await loadOrderItems(admin, ctx.cafeId, allocationRows.map((row) => String(row.order_item_id)).filter(Boolean));
      const itemMap = new Map(orderItems.map((row) => [String(row.id), row]));
      const lines = allocationRows.map((row) => {
        const item = itemMap.get(String(row.order_item_id));
        const relation = Array.isArray(item?.menu_products) ? item?.menu_products[0] : item?.menu_products;
        return {
          orderItemId: String(row.order_item_id),
          productName: String(relation?.product_name ?? 'صنف'),
          quantity: Number(row.quantity ?? 0),
          unitPrice: Number(item?.unit_price ?? 0),
          lineAmount: Number(row.amount ?? 0),
          notes: item?.notes ? String(item.notes) : null,
        };
      });

      const subtotal = Number(paymentRow.subtotal_amount ?? lines.reduce((sum, line) => sum + line.lineAmount, 0));
      const taxAmount = Number(paymentRow.tax_amount ?? 0);
      const serviceAmount = Number(paymentRow.service_amount ?? 0);
      const total = Number(paymentRow.total_amount ?? subtotal + taxAmount + serviceAmount);

      return ok({
        mode: 'final',
        paymentId,
        paymentKind: paymentRow.payment_kind,
        sessionId: paymentRow.service_session_id,
        sessionLabel: sessionMeta.sessionLabel,
        cafeName: sessionMeta.cafeName,
        debtorName: paymentRow.debtor_name ? String(paymentRow.debtor_name) : null,
        notes: paymentRow.notes ? String(paymentRow.notes) : null,
        createdAt: String(paymentRow.created_at),
        actorLabel,
        totals: {
          subtotal,
          taxAmount,
          serviceAmount,
          total,
        },
        settings: {
          taxEnabled: taxAmount > 0,
          taxRate: Number(paymentRow.tax_rate ?? 0),
          serviceEnabled: serviceAmount > 0,
          serviceRate: Number(paymentRow.service_rate ?? 0),
        },
        lines,
      });
    }

    const allocations = parseBillingAllocations(url.searchParams.get('allocations'));
    if (!previewSessionId || allocations.length === 0) {
      throw new Error('INVALID_INPUT');
    }

    const billing = await resolveBillingContext(ctx.cafeId, ctx.databaseKey, allocations);
    if (billing.serviceSessionId !== previewSessionId) {
      throw new Error('BILLING_ALLOCATIONS_MUST_SHARE_SESSION');
    }

    const [sessionMeta, settings, actorLabel, orderItems] = await Promise.all([
      loadSessionAndCafeMeta(admin, ctx.cafeId, billing.serviceSessionId),
      loadBillingSettings(ctx.cafeId, ctx.databaseKey),
      resolveActorLabel(admin, ctx.cafeId, ctx.actorStaffId, ctx.actorOwnerId),
      loadOrderItems(admin, ctx.cafeId, allocations.map((allocation) => allocation.orderItemId)),
    ]);

    const orderItemMap = new Map(orderItems.map((row) => [String(row.id), row]));
    const lines = allocations.map((allocation) => {
      const item = orderItemMap.get(allocation.orderItemId);
      if (!item?.id) {
        throw new Error('ORDER_ITEM_NOT_FOUND');
      }
      const relation = Array.isArray(item.menu_products) ? item.menu_products[0] : item.menu_products;
      const unitPrice = Number(item.unit_price ?? 0);
      return {
        orderItemId: allocation.orderItemId,
        productName: String(relation?.product_name ?? 'صنف'),
        quantity: allocation.quantity,
        unitPrice,
        lineAmount: unitPrice * allocation.quantity,
        notes: item.notes ? String(item.notes) : null,
      };
    });

    const totals = computeBillingTotals(
      lines.reduce((sum, line) => sum + line.lineAmount, 0),
      settings,
    );

    return ok({
      mode: 'preview',
      paymentId: null,
      paymentKind: 'preview',
      sessionId: billing.serviceSessionId,
      sessionLabel: sessionMeta.sessionLabel,
      cafeName: sessionMeta.cafeName,
      debtorName: previewDebtorName,
      notes: null,
      createdAt: new Date().toISOString(),
      actorLabel,
      totals,
      settings,
      lines,
    });
  } catch (error) {
    return jsonError(error, 400);
  }
}
