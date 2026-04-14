'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuthz } from '@/lib/authz';
import { opsClient } from '@/lib/ops/client';
import { buildBillingPageUrl, parseBillingAllocations } from '@/lib/ops/billing';
import { loadBillingReceiptPreviewDraft } from '@/lib/ops/receipt-preview';
import type { BillingReceipt } from '@/lib/ops/types';
import { useOpsWorkspace } from '@/lib/ops/hooks';
import { AccessDenied } from '@/ui/AccessState';
import { PrintPageFrame } from '@/ui/print/PrintPageFrame';
import { parseOrderItemNotes } from '@/lib/ops/orderItemNotes';

function formatMoney(value: number) {
  return new Intl.NumberFormat('ar-EG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value ?? 0);
}

function formatReceiptDate(value: string) {
  return new Date(value).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function formatReceiptTime(value: string) {
  return new Date(value).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function paymentKindLabel(kind: BillingReceipt['paymentKind']) {
  switch (kind) {
    case 'deferred':
      return 'Deferred';
    case 'mixed':
      return 'Mixed';
    case 'repayment':
      return 'Repayment';
    case 'adjustment':
      return 'Adjustment';
    case 'preview':
      return 'Check';
    case 'cash':
    default:
      return 'Cash';
  }
}

function BillingReceiptPageContent() {
  const { can, shift } = useAuthz();
  const searchParams = useSearchParams();
  const paymentId = String(searchParams.get('paymentId') ?? '').trim();
  const previewSessionId = String(searchParams.get('sessionId') ?? '').trim();
  const previewDebtorName = String(searchParams.get('debtorName') ?? '').trim();
  const previewAllocationsParam = String(searchParams.get('allocations') ?? '').trim();
  const returnSessionId = String(searchParams.get('returnSessionId') ?? '').trim();

  const [storageDraftLoaded, setStorageDraftLoaded] = useState(false);
  const [storedPreview, setStoredPreview] = useState<{ allocations: ReturnType<typeof parseBillingAllocations>; debtorName: string | null } | null>(null);

  const previewAllocations = useMemo(() => {
    try {
      return parseBillingAllocations(previewAllocationsParam);
    } catch {
      return [];
    }
  }, [previewAllocationsParam]);

  useEffect(() => {
    if (paymentId || !previewSessionId) {
      setStoredPreview(null);
      setStorageDraftLoaded(true);
      return;
    }

    const draft = loadBillingReceiptPreviewDraft(previewSessionId);
    setStoredPreview(draft ? { allocations: draft.allocations, debtorName: draft.debtorName } : null);
    setStorageDraftLoaded(true);
  }, [paymentId, previewSessionId]);

  const effectivePreviewAllocations = previewAllocations.length > 0 ? previewAllocations : storedPreview?.allocations ?? [];
  const effectivePreviewDebtorName = previewDebtorName || storedPreview?.debtorName || '';

  const loader = useCallback(
    () =>
      opsClient.billingReceipt({
        paymentId: paymentId || undefined,
        sessionId: paymentId ? undefined : previewSessionId,
        allocations: paymentId ? undefined : effectivePreviewAllocations,
        debtorName: paymentId ? undefined : effectivePreviewDebtorName || undefined,
      }),
    [paymentId, previewSessionId, effectivePreviewAllocations, effectivePreviewDebtorName],
  );
  const { data, error } = useOpsWorkspace<BillingReceipt>(loader, {
    cacheKey: `workspace:billing:receipt:${paymentId || previewSessionId || 'preview'}`,
    staleTimeMs: 60_000,
    enabled: Boolean(paymentId) || (Boolean(previewSessionId) && effectivePreviewAllocations.length > 0 && (can.owner || can.billing)),
    shouldReloadOnEvent: () => false,
  });

  if (!can.owner && !shift) {
    return <AccessDenied title="بون الفاتورة" message="هذه الصفحة للمالك أو مشرف التشغيل النشط فقط." />;
  }

  if (!can.owner && !can.billing) {
    return <AccessDenied title="بون الفاتورة" />;
  }

  const isPreview = data?.mode === 'preview' || (!paymentId && Boolean(previewSessionId));
  const backHref = buildBillingPageUrl(returnSessionId || data?.sessionId || previewSessionId);

  if (!paymentId && previewSessionId && !storageDraftLoaded) {
    return null;
  }

  return (
    <>
      <style jsx global>{`
        @media print {
          @page {
            size: 72mm auto;
            margin: 4mm;
          }

          html,
          body {
            background: #ffffff !important;
          }

          .receipt-print-shell {
            width: 64mm !important;
            max-width: 64mm !important;
            padding: 0 !important;
            margin: 0 auto !important;
          }

          .receipt-print-root {
            width: 64mm !important;
            max-width: 64mm !important;
            border: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 auto !important;
          }
        }
      `}</style>

      <PrintPageFrame
        title={isPreview ? 'Guest Check' : 'Sales Receipt'}
        exportFilename={data ? `${data.mode === 'preview' ? 'guest-check' : 'sales-receipt'}-${data.paymentId ?? data.sessionId}` : isPreview ? 'guest-check' : 'sales-receipt'}
        subtitle={data ? `${data.cafeName} • ${data.sessionLabel}` : isPreview ? 'Loading guest check...' : 'Loading sales receipt...'}
        shellClassName="receipt-print-shell w-full max-w-[22rem]"
        contentClassName="receipt-print-root rounded-[28px] px-4 py-4"
        titleClassName="text-center"
        subtitleClassName="text-center"
        backHref={backHref}
      >
        {!paymentId && (!previewSessionId || effectivePreviewAllocations.length === 0) ? <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">بيانات الشيك غير مكتملة.</div> : null}
        {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
        {!data && !error && (paymentId || previewSessionId) ? <div className="rounded-2xl border border-dashed p-4 text-center text-sm text-neutral-500">{isPreview ? 'Loading guest check...' : 'Loading sales receipt...'}</div> : null}
        {data ? (
          <div className="space-y-4 text-[13px] leading-6 text-neutral-900">
            <section className="border-b border-dashed pb-3 text-center">
              <div className="text-[18px] font-black tracking-[0.03em] text-[#1e1712]">{data.cafeName}</div>
              <div className="mt-1 text-[12px] font-semibold uppercase tracking-[0.16em] text-neutral-500">{data.mode === 'preview' ? 'Guest Check' : 'Sales Receipt'}</div>
            </section>

            <section className="space-y-1 border-b border-dashed pb-3 text-[12px]">
              {data.paymentId ? <div className="flex items-center justify-between gap-2"><span className="text-neutral-500">Receipt No.</span><span className="font-semibold">{data.paymentId}</span></div> : <div className="flex items-center justify-between gap-2"><span className="text-neutral-500">Document</span><span className="font-semibold">Check</span></div>}
              <div className="flex items-center justify-between gap-2"><span className="text-neutral-500">Date</span><span className="font-semibold">{formatReceiptDate(data.createdAt)}</span></div>
              <div className="flex items-center justify-between gap-2"><span className="text-neutral-500">Time</span><span className="font-semibold">{formatReceiptTime(data.createdAt)}</span></div>
              <div className="flex items-center justify-between gap-2"><span className="text-neutral-500">Session</span><span className="font-semibold">{data.sessionLabel}</span></div>
              <div className="flex items-center justify-between gap-2"><span className="text-neutral-500">Type</span><span className="font-semibold">{paymentKindLabel(data.paymentKind)}</span></div>
              <div className="flex items-center justify-between gap-2"><span className="text-neutral-500">Cashier</span><span className="font-semibold">{data.actorLabel}</span></div>
              {data.debtorName ? <div className="flex items-center justify-between gap-2"><span className="text-neutral-500">Debtor</span><span className="font-semibold">{data.debtorName}</span></div> : null}
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-500">
                <span>Items</span>
                <span>Total</span>
              </div>
              <div className="border-y border-dashed">
                {data.lines.map((line) => {
                  const parsedNotes = parseOrderItemNotes(line.notes);
                  return (
                    <div key={`${line.orderItemId}-${line.quantity}`} className="flex items-start justify-between gap-3 border-b border-dashed py-2 last:border-b-0">
                      <div className="min-w-0 flex-1 text-right">
                        <div className="font-semibold leading-5 break-words">{line.productName}</div>
                        <div className="text-[11px] text-neutral-500">
                          {line.quantity} x {formatMoney(line.unitPrice)}
                        </div>
                        {parsedNotes.addonSummary ? <div className="mt-1 text-[11px] font-semibold text-neutral-700">إضافات: {parsedNotes.addonSummary}</div> : null}
                        {parsedNotes.freeformNotes ? <div className="mt-1 text-[11px] text-neutral-500">{parsedNotes.freeformNotes}</div> : null}
                      </div>
                      <div className="shrink-0 whitespace-nowrap font-semibold tabular-nums">{formatMoney(line.lineAmount)}</div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="space-y-1 border-t border-dashed pt-3 text-[12px]">
              <div className="flex items-center justify-between gap-2"><span>Subtotal</span><span className="font-semibold tabular-nums">{formatMoney(data.totals.subtotal)}</span></div>
              {data.settings.taxEnabled || data.totals.taxAmount > 0 ? <div className="flex items-center justify-between gap-2"><span>Tax + ({formatMoney(data.settings.taxRate)}%)</span><span className="font-semibold tabular-nums">{formatMoney(data.totals.taxAmount)}</span></div> : null}
              {data.settings.serviceEnabled || data.totals.serviceAmount > 0 ? <div className="flex items-center justify-between gap-2"><span>Service + ({formatMoney(data.settings.serviceRate)}%)</span><span className="font-semibold tabular-nums">{formatMoney(data.totals.serviceAmount)}</span></div> : null}
              <div className="mt-2 flex items-center justify-between border-t border-dashed pt-2 text-base font-black"><span>Total</span><span className="tabular-nums">{formatMoney(data.totals.total)}</span></div>
            </section>

            {data.notes ? (
              <section className="border-t border-dashed pt-3 text-[12px]">
                <div className="mb-1 text-neutral-500">Notes</div>
                <div>{data.notes}</div>
              </section>
            ) : null}

            <section className="border-t border-dashed pt-3 text-center text-[11px] text-neutral-500">
              <div>شكرا لزيارتكم</div>
              <div>نتمنى لكم وقتا سعيدا</div>
            </section>
          </div>
        ) : null}
        <div className="mt-4 text-center print:hidden">
          <Link href={backHref} className="text-sm font-semibold text-neutral-700 underline underline-offset-4">العودة إلى الحساب</Link>
        </div>
      </PrintPageFrame>
    </>
  );
}

export default function BillingReceiptPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-white" />}>
      <BillingReceiptPageContent />
    </Suspense>
  );
}
