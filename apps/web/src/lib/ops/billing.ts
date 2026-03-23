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

export function buildBillingReceiptUrl(paymentId: string) {
  const normalized = String(paymentId ?? '').trim();
  return normalized ? `/billing/receipt?paymentId=${encodeURIComponent(normalized)}` : '';
}
