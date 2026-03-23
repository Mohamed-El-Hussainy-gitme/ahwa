import { adminOps } from '@/app/api/ops/_server';
import { jsonError, ok, requireBillingAccess, requireOpsActorContext } from '@/app/api/ops/_helpers';

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

export async function GET(req: Request) {
  try {
    const ctx = requireBillingAccess(await requireOpsActorContext());
    const paymentId = String(new URL(req.url).searchParams.get('paymentId') ?? '').trim();
    if (!paymentId) throw new Error('INVALID_INPUT');

    const admin = adminOps(ctx.databaseKey);
    const { data: payment, error: paymentError } = await admin
      .from('payments')
      .select('id, cafe_id, service_session_id, payment_kind, total_amount, subtotal_amount, tax_amount, tax_rate, service_amount, service_rate, debtor_name, notes, created_at, by_staff_id, by_owner_id')
      .eq('cafe_id', ctx.cafeId)
      .eq('id', paymentId)
      .maybeSingle();
    if (paymentError) throw paymentError;
    if (!payment) throw new Error('PAYMENT_NOT_FOUND');

    const paymentRow = payment as PaymentRow;

    const [{ data: allocations, error: allocationsError }, { data: sessionRow, error: sessionError }, { data: cafeRow, error: cafeError }] = await Promise.all([
      admin
        .from('payment_allocations')
        .select('order_item_id, quantity, amount')
        .eq('cafe_id', ctx.cafeId)
        .eq('payment_id', paymentId)
        .order('created_at', { ascending: true }),
      admin
        .from('service_sessions')
        .select('session_label')
        .eq('cafe_id', ctx.cafeId)
        .eq('id', paymentRow.service_session_id)
        .maybeSingle(),
      admin
        .from('cafes')
        .select('display_name')
        .eq('id', ctx.cafeId)
        .maybeSingle(),
    ]);

    if (allocationsError) throw allocationsError;
    if (sessionError) throw sessionError;
    if (cafeError) throw cafeError;

    const allocationRows = (allocations ?? []) as Array<{ order_item_id: string; quantity: number | string | null; amount: number | string | null }>;
    const orderItemIds = allocationRows.map((row) => String(row.order_item_id)).filter(Boolean);

    let orderItems: Array<{ id: string; unit_price: number | string | null; menu_products?: { product_name?: string | null } | Array<{ product_name?: string | null }> | null }> = [];
    if (orderItemIds.length) {
      const orderItemsRes = await admin
        .from('order_items')
        .select('id, unit_price, menu_products!inner(product_name)')
        .eq('cafe_id', ctx.cafeId)
        .in('id', orderItemIds);
      if (orderItemsRes.error) throw orderItemsRes.error;
      orderItems = (orderItemsRes.data ?? []) as typeof orderItems;
    }

    let actorLabel = 'غير معروف';
    if (paymentRow.by_owner_id) {
      const { data, error } = await admin
        .from('owner_users')
        .select('full_name')
        .eq('cafe_id', ctx.cafeId)
        .eq('id', paymentRow.by_owner_id)
        .maybeSingle();
      if (error) throw error;
      actorLabel = String(data?.full_name ?? actorLabel);
    } else if (paymentRow.by_staff_id) {
      const { data, error } = await admin
        .from('staff_members')
        .select('full_name')
        .eq('cafe_id', ctx.cafeId)
        .eq('id', paymentRow.by_staff_id)
        .maybeSingle();
      if (error) throw error;
      actorLabel = String(data?.full_name ?? actorLabel);
    }

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
      };
    });

    const subtotal = Number(paymentRow.subtotal_amount ?? lines.reduce((sum, line) => sum + line.lineAmount, 0));
    const taxAmount = Number(paymentRow.tax_amount ?? 0);
    const serviceAmount = Number(paymentRow.service_amount ?? 0);
    const total = Number(paymentRow.total_amount ?? subtotal + taxAmount + serviceAmount);

    return ok({
      paymentId,
      paymentKind: paymentRow.payment_kind,
      sessionId: paymentRow.service_session_id,
      sessionLabel: String(sessionRow?.session_label ?? ''),
      cafeName: String(cafeRow?.display_name ?? ''),
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
  } catch (error) {
    return jsonError(error, 400);
  }
}
