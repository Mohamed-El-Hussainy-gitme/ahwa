'use client';

import type { BillingAllocationInput } from './billing';

type BillingReceiptPreviewDraft = {
  sessionId: string;
  allocations: BillingAllocationInput[];
  debtorName: string | null;
  savedAt: number;
};

const STORAGE_PREFIX = 'ahwa.billing.preview';
const MAX_AGE_MS = 30 * 60 * 1000;

function storageKey(sessionId: string) {
  return `${STORAGE_PREFIX}:${sessionId}`;
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function saveBillingReceiptPreviewDraft(input: {
  sessionId: string;
  allocations: BillingAllocationInput[];
  debtorName?: string | null;
}) {
  const sessionId = String(input.sessionId ?? '').trim();
  if (!sessionId || !canUseStorage()) {
    return;
  }

  const payload: BillingReceiptPreviewDraft = {
    sessionId,
    allocations: Array.isArray(input.allocations) ? input.allocations.filter((item) => item.orderItemId && item.quantity > 0) : [],
    debtorName: input.debtorName ? String(input.debtorName).trim() : null,
    savedAt: Date.now(),
  };

  try {
    window.localStorage.setItem(storageKey(sessionId), JSON.stringify(payload));
  } catch {
    // Ignore storage failures.
  }
}

export function loadBillingReceiptPreviewDraft(sessionId: string): BillingReceiptPreviewDraft | null {
  const normalizedSessionId = String(sessionId ?? '').trim();
  if (!normalizedSessionId || !canUseStorage()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(storageKey(normalizedSessionId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as BillingReceiptPreviewDraft | null;
    if (!parsed || parsed.sessionId !== normalizedSessionId) {
      return null;
    }
    if (!Array.isArray(parsed.allocations) || parsed.allocations.length === 0) {
      return null;
    }
    if (Date.now() - Number(parsed.savedAt ?? 0) > MAX_AGE_MS) {
      window.localStorage.removeItem(storageKey(normalizedSessionId));
      return null;
    }
    return {
      sessionId: normalizedSessionId,
      allocations: parsed.allocations,
      debtorName: parsed.debtorName ? String(parsed.debtorName).trim() : null,
      savedAt: Number(parsed.savedAt ?? Date.now()),
    };
  } catch {
    return null;
  }
}
