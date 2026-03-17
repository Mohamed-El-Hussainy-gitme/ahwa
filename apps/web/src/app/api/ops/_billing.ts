import { adminOpsForCafeId } from '@/app/api/ops/_server';

type AllocationInput = {
  orderItemId: string;
  quantity: number;
};

type OrderItemBillingRow = {
  id: string;
  shift_id: string;
  service_session_id: string | null;
  unit_price: number | string | null;
  qty_delivered: number | string | null;
  qty_paid: number | string | null;
  qty_deferred: number | string | null;
  qty_waived: number | string | null;
};

type BillingContext = {
  shiftId: string;
  serviceSessionId: string;
  lines: Array<{ order_item_id: string; quantity: number }>;
};

export function normalizeAllocations(allocations: AllocationInput[] | undefined): AllocationInput[] {
  if (!Array.isArray(allocations) || allocations.length === 0) {
    throw new Error('INVALID_INPUT');
  }

  const byOrderItemId = new Map<string, number>();

  for (const allocation of allocations) {
    const orderItemId = String(allocation.orderItemId ?? '').trim();
    const quantity = Number(allocation.quantity ?? 0);
    if (!orderItemId || !Number.isFinite(quantity) || quantity <= 0 || !Number.isInteger(quantity)) {
      throw new Error('INVALID_QUANTITY');
    }

    byOrderItemId.set(orderItemId, (byOrderItemId.get(orderItemId) ?? 0) + quantity);
  }

  return Array.from(byOrderItemId.entries()).map(([orderItemId, quantity]) => ({ orderItemId, quantity }));
}

export async function resolveBillingContext(
  cafeId: string,
  allocations: AllocationInput[] | undefined,
): Promise<BillingContext> {
  const normalized = normalizeAllocations(allocations);
  const orderItemIds = normalized.map((allocation) => allocation.orderItemId);

  const admin = await adminOpsForCafeId(cafeId);
  const { data, error } = await admin
    .from('order_items')
    .select('id, shift_id, service_session_id, unit_price, qty_delivered, qty_paid, qty_deferred, qty_waived')
    .eq('cafe_id', cafeId)
    .in('id', orderItemIds);

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as OrderItemBillingRow[];
  const rowById = new Map(rows.map((row) => [String(row.id), row]));

  let shiftId: string | null = null;
  let serviceSessionId: string | null = null;

  for (const allocation of normalized) {
    const row = rowById.get(allocation.orderItemId);
    if (!row?.id || !row.shift_id || !row.service_session_id) {
      throw new Error('ORDER_ITEM_NOT_FOUND');
    }

    const currentShiftId = String(row.shift_id);
    const currentSessionId = String(row.service_session_id);

    if (shiftId && shiftId !== currentShiftId) {
      throw new Error('BILLING_ALLOCATIONS_MUST_SHARE_SHIFT');
    }
    if (serviceSessionId && serviceSessionId !== currentSessionId) {
      throw new Error('BILLING_ALLOCATIONS_MUST_SHARE_SESSION');
    }

    shiftId = currentShiftId;
    serviceSessionId = currentSessionId;

    const delivered = Number(row.qty_delivered ?? 0);
    const paid = Number(row.qty_paid ?? 0);
    const deferred = Number(row.qty_deferred ?? 0);
    const waived = Number(row.qty_waived ?? 0);
    const billable = Math.max(delivered - paid - deferred - waived, 0);
    if (allocation.quantity > billable) {
      throw new Error('INVALID_QUANTITY');
    }
  }

  if (!shiftId || !serviceSessionId) {
    throw new Error('INVALID_SHIFT_CONTEXT');
  }

  return {
    shiftId,
    serviceSessionId,
    lines: normalized.map((allocation) => ({
      order_item_id: allocation.orderItemId,
      quantity: allocation.quantity,
    })),
  };
}
