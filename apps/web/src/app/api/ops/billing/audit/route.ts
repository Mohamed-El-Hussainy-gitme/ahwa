import { buildReportsWorkspace } from '@/app/api/ops/_reports';
import { adminOps } from '@/app/api/ops/_server';
import { jsonError, ok, requireReportsAccess, requireOpsActorContext } from '@/app/api/ops/_helpers';

type PaymentRow = {
  id: string;
  service_session_id: string;
  payment_kind: string | null;
  total_amount: number | string | null;
  subtotal_amount: number | string | null;
  tax_amount: number | string | null;
  service_amount: number | string | null;
  created_at: string;
  debtor_name: string | null;
  notes: string | null;
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

type OrderItemAddonRow = {
  order_item_id: string;
  addon_name_snapshot: string | null;
  unit_price: number | string | null;
  quantity: number | string | null;
  line_total: number | string | null;
};

function normalizeMoney(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

export async function GET(request: Request) {
  try {
    const ctx = requireReportsAccess(await requireOpsActorContext());
    const url = new URL(request.url);
    const paymentId = String(url.searchParams.get('paymentId') ?? '').trim();
    if (!paymentId) {
      throw new Error('PAYMENT_ID_REQUIRED');
    }

    const admin = adminOps(ctx.databaseKey);

    const { data: paymentData, error: paymentError } = await admin
      .from('payments')
      .select('id, service_session_id, payment_kind, total_amount, subtotal_amount, tax_amount, service_amount, created_at, debtor_name, notes')
      .eq('cafe_id', ctx.cafeId)
      .eq('id', paymentId)
      .maybeSingle();
    if (paymentError) throw paymentError;
    if (!paymentData) throw new Error('PAYMENT_NOT_FOUND');

    const payment = paymentData as PaymentRow;

    const [{ data: allocationsData, error: allocationsError }, { data: sessionData, error: sessionError }] = await Promise.all([
      admin
        .from('payment_allocations')
        .select('order_item_id, quantity, amount')
        .eq('cafe_id', ctx.cafeId)
        .eq('payment_id', paymentId)
        .order('created_at', { ascending: true }),
      admin
        .from('service_sessions')
        .select('id, shift_id, session_label')
        .eq('cafe_id', ctx.cafeId)
        .eq('id', payment.service_session_id)
        .maybeSingle(),
    ]);
    if (allocationsError) throw allocationsError;
    if (sessionError) throw sessionError;
    if (!sessionData?.id || !sessionData.shift_id) throw new Error('SESSION_NOT_FOUND');

    const allocations = (allocationsData ?? []) as AllocationRow[];
    const orderItemIds = allocations.map((row) => String(row.order_item_id)).filter(Boolean);

    const [{ data: shiftData, error: shiftError }, { data: orderItemsData, error: orderItemsError }, { data: orderItemAddonsData, error: orderItemAddonsError }] = await Promise.all([
      admin
        .from('shifts')
        .select('id, business_date, status, opened_at, closed_at')
        .eq('cafe_id', ctx.cafeId)
        .eq('id', String(sessionData.shift_id))
        .maybeSingle(),
      admin
        .from('order_items')
        .select('id, unit_price, notes, menu_products!inner(product_name)')
        .eq('cafe_id', ctx.cafeId)
        .in('id', orderItemIds),
      admin
        .from('order_item_addons')
        .select('order_item_id, addon_name_snapshot, unit_price, quantity, line_total')
        .eq('cafe_id', ctx.cafeId)
        .in('order_item_id', orderItemIds)
        .order('created_at', { ascending: true }),
    ]);
    if (shiftError) throw shiftError;
    if (orderItemsError) throw orderItemsError;
    if (orderItemAddonsError) throw orderItemAddonsError;

    const orderItems = (orderItemsData ?? []) as OrderItemRow[];
    const orderItemMap = new Map(orderItems.map((row) => [String(row.id), row]));
    const orderItemAddons = (orderItemAddonsData ?? []) as OrderItemAddonRow[];
    const addonsByOrderItemId = new Map<string, OrderItemAddonRow[]>();
    for (const addon of orderItemAddons) {
      const orderItemId = String(addon.order_item_id ?? '');
      if (!orderItemId) continue;
      const current = addonsByOrderItemId.get(orderItemId) ?? [];
      current.push(addon);
      addonsByOrderItemId.set(orderItemId, current);
    }

    const billedItems = allocations.map((allocation) => {
      const orderItemId = String(allocation.order_item_id ?? '');
      const orderItem = orderItemMap.get(orderItemId);
      const relation = Array.isArray(orderItem?.menu_products) ? orderItem?.menu_products[0] : orderItem?.menu_products;
      const quantity = Number(allocation.quantity ?? 0);
      const unitPrice = normalizeMoney(orderItem?.unit_price);
      const addonRows = addonsByOrderItemId.get(orderItemId) ?? [];
      const addons = addonRows.map((addon) => ({
        addonName: String(addon.addon_name_snapshot ?? 'إضافة'),
        billedQuantity: quantity,
        unitPrice: normalizeMoney(addon.unit_price),
        billedLineAmount: normalizeMoney(addon.unit_price) * quantity,
      }));
      const addonUnitTotal = addons.reduce((sum, addon) => sum + addon.unitPrice, 0);
      const addonLineTotal = addons.reduce((sum, addon) => sum + addon.billedLineAmount, 0);
      const lineAmount = allocation.amount == null ? unitPrice * quantity : normalizeMoney(allocation.amount);
      return {
        orderItemId,
        productName: String(relation?.product_name ?? 'صنف'),
        billedQuantity: quantity,
        effectiveUnitPrice: unitPrice,
        baseUnitPrice: Math.max(unitPrice - addonUnitTotal, 0),
        baseLineAmount: Math.max(lineAmount - addonLineTotal, 0),
        addonLineAmount: addonLineTotal,
        lineAmount,
        notes: orderItem?.notes ? String(orderItem.notes) : null,
        addons,
      };
    });

    const addonsSubtotal = billedItems.reduce((sum, item) => sum + item.addonLineAmount, 0);
    const baseSubtotal = billedItems.reduce((sum, item) => sum + item.baseLineAmount, 0);
    const receiptSubtotal = normalizeMoney(payment.subtotal_amount || billedItems.reduce((sum, item) => sum + item.lineAmount, 0));
    const taxAmount = normalizeMoney(payment.tax_amount);
    const serviceAmount = normalizeMoney(payment.service_amount);
    const receiptTotal = normalizeMoney(payment.total_amount || receiptSubtotal + taxAmount + serviceAmount);

    const businessDate = shiftData?.business_date ? String(shiftData.business_date) : null;
    const reports = businessDate
      ? await buildReportsWorkspace(ctx.cafeId, ctx.databaseKey, { startDate: businessDate, endDate: businessDate })
      : await buildReportsWorkspace(ctx.cafeId, ctx.databaseKey);

    const dayReport = businessDate
      ? reports.customRange ?? null
      : reports.periods.day;

    return ok({
      paymentId,
      paymentKind: payment.payment_kind ? String(payment.payment_kind) : null,
      sessionId: String(payment.service_session_id),
      sessionLabel: String(sessionData.session_label ?? ''),
      shiftId: String(sessionData.shift_id),
      businessDate,
      createdAt: String(payment.created_at),
      debtorName: payment.debtor_name ? String(payment.debtor_name) : null,
      notes: payment.notes ? String(payment.notes) : null,
      receipt: {
        subtotal: receiptSubtotal,
        addonsSubtotal,
        baseSubtotal,
        taxAmount,
        serviceAmount,
        total: receiptTotal,
      },
      billedItems,
      reportCurrent: reports.currentShift
        ? {
            shiftId: reports.currentShift.shiftId,
            businessDate: reports.currentShift.businessDate,
            sameShiftAsSession: reports.currentShift.shiftId === String(sessionData.shift_id),
            totals: reports.currentShift,
          }
        : null,
      reportDay: dayReport
        ? {
            key: dayReport.key,
            label: dayReport.label,
            startDate: dayReport.startDate,
            endDate: dayReport.endDate,
            totals: dayReport.totals,
            addons: dayReport.addons,
            products: dayReport.products,
          }
        : null,
      auditChecks: {
        receiptMatchesItems: Math.abs(receiptSubtotal - billedItems.reduce((sum, item) => sum + item.lineAmount, 0)) < 0.01,
        addonSplitMatchesSubtotal: Math.abs(receiptSubtotal - (baseSubtotal + addonsSubtotal)) < 0.01,
      },
    });
  } catch (error) {
    return jsonError(error, 400);
  }
}
