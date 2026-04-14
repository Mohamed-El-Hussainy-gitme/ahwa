export type BillingExtrasSettings = {
  taxEnabled: boolean;
  taxRate: number;
  serviceEnabled: boolean;
  serviceRate: number;
};

export type BillingTotals = {
  subtotal: number;
  taxAmount: number;
  serviceAmount: number;
  total: number;
};

export type BillingAllocationInput = {
  orderItemId: string;
  quantity: number;
};

function roundMoney(value: number) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

export function clampBillingRate(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 100);
}

export function normalizeBillingSettings(input: Partial<BillingExtrasSettings> | null | undefined): BillingExtrasSettings {
  return {
    taxEnabled: Boolean(input?.taxEnabled),
    taxRate: clampBillingRate(Number(input?.taxRate ?? 0)),
    serviceEnabled: Boolean(input?.serviceEnabled),
    serviceRate: clampBillingRate(Number(input?.serviceRate ?? 0)),
  };
}

export function computeBillingTotals(subtotal: number, settings: Partial<BillingExtrasSettings> | null | undefined): BillingTotals {
  const normalized = normalizeBillingSettings(settings);
  const baseSubtotal = roundMoney(Number(subtotal ?? 0));
  const taxAmount = normalized.taxEnabled ? roundMoney(baseSubtotal * (normalized.taxRate / 100)) : 0;
  const serviceAmount = normalized.serviceEnabled ? roundMoney(baseSubtotal * (normalized.serviceRate / 100)) : 0;
  return {
    subtotal: baseSubtotal,
    taxAmount,
    serviceAmount,
    total: roundMoney(baseSubtotal + taxAmount + serviceAmount),
  };
}

export function serializeBillingAllocations(allocations: BillingAllocationInput[]): string {
  return allocations
    .map((allocation) => ({
      orderItemId: String(allocation.orderItemId ?? '').trim(),
      quantity: Number(allocation.quantity ?? 0),
    }))
    .filter((allocation) => allocation.orderItemId && Number.isInteger(allocation.quantity) && allocation.quantity > 0)
    .map((allocation) => `${allocation.orderItemId}:${allocation.quantity}`)
    .join(',');
}

export function parseBillingAllocations(serialized: string | null | undefined): BillingAllocationInput[] {
  const normalized = String(serialized ?? '').trim();
  if (!normalized) return [];

  const byOrderItemId = new Map<string, number>();

  for (const entry of normalized.split(',')) {
    const [rawOrderItemId, rawQuantity] = entry.split(':');
    const orderItemId = String(rawOrderItemId ?? '').trim();
    const quantity = Number(rawQuantity ?? 0);
    if (!orderItemId || !Number.isInteger(quantity) || quantity <= 0) {
      throw new Error('INVALID_RECEIPT_ALLOCATIONS');
    }
    byOrderItemId.set(orderItemId, (byOrderItemId.get(orderItemId) ?? 0) + quantity);
  }

  return Array.from(byOrderItemId.entries()).map(([orderItemId, quantity]) => ({ orderItemId, quantity }));
}

export function buildBillingReceiptUrl(paymentId: string) {
  const normalized = String(paymentId ?? '').trim();
  return normalized ? `/billing/receipt?paymentId=${encodeURIComponent(normalized)}` : '';
}

export function buildBillingPageUrl(sessionId?: string | null) {
  const normalized = String(sessionId ?? '').trim();
  return normalized ? `/billing?sessionId=${encodeURIComponent(normalized)}` : '/billing';
}

export function appendBillingReturnSessionId(url: string, sessionId?: string | null) {
  const normalizedUrl = String(url ?? '').trim();
  const normalizedSessionId = String(sessionId ?? '').trim();

  if (!normalizedUrl || !normalizedSessionId) {
    return normalizedUrl;
  }

  const separator = normalizedUrl.includes('?') ? '&' : '?';
  return `${normalizedUrl}${separator}returnSessionId=${encodeURIComponent(normalizedSessionId)}`;
}

export function buildBillingReceiptApiUrl(input: {
  paymentId?: string | null;
  sessionId?: string | null;
  allocations?: BillingAllocationInput[];
  debtorName?: string | null;
}) {
  const params = new URLSearchParams();
  const paymentId = String(input.paymentId ?? '').trim();
  if (paymentId) {
    params.set('paymentId', paymentId);
  } else {
    const sessionId = String(input.sessionId ?? '').trim();
    const allocations = serializeBillingAllocations(input.allocations ?? []);
    if (sessionId) params.set('sessionId', sessionId);
    if (allocations) params.set('allocations', allocations);
    const debtorName = String(input.debtorName ?? '').trim();
    if (debtorName) params.set('debtorName', debtorName);
    params.set('preview', '1');
  }
  return `/api/ops/billing/receipt?${params.toString()}`;
}

export function buildBillingPreviewUrl(sessionId: string, allocations: BillingAllocationInput[], debtorName?: string | null, returnSessionId?: string | null) {
  const normalizedSessionId = String(sessionId ?? '').trim();
  const serializedAllocations = serializeBillingAllocations(allocations);
  if (!normalizedSessionId || !serializedAllocations) return '';

  const params = new URLSearchParams({
    preview: '1',
    sessionId: normalizedSessionId,
    allocations: serializedAllocations,
  });

  const normalizedDebtorName = String(debtorName ?? '').trim();
  if (normalizedDebtorName) {
    params.set('debtorName', normalizedDebtorName);
  }

  const normalizedReturnSessionId = String(returnSessionId ?? '').trim();
  if (normalizedReturnSessionId) {
    params.set('returnSessionId', normalizedReturnSessionId);
  }

  return `/billing/receipt?${params.toString()}`;
}
