'use client';

import Link from 'next/link';
import { useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuthz } from '@/lib/authz';
import { opsClient } from '@/lib/ops/client';
import type { BillingReceipt } from '@/lib/ops/types';
import { useOpsWorkspace } from '@/lib/ops/hooks';
import { AccessDenied } from '@/ui/AccessState';
import { PrintPageFrame } from '@/ui/print/PrintPageFrame';

function formatMoney(value: number) {
  return new Intl.NumberFormat('ar-EG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value ?? 0);
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('ar-EG', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function paymentKindLabel(kind: BillingReceipt['paymentKind']) {
  switch (kind) {
    case 'deferred':
      return 'آجل';
    case 'mixed':
      return 'مختلط';
    case 'repayment':
      return 'سداد';
    case 'adjustment':
      return 'تسوية';
    case 'cash':
    default:
      return 'كاش';
  }
}

export default function BillingReceiptPage() {
  const { can, shift } = useAuthz();
  const searchParams = useSearchParams();
  const paymentId = String(searchParams.get('paymentId') ?? '').trim();
  const loader = useCallback(() => opsClient.billingReceipt(paymentId), [paymentId]);
  const { data, error } = useOpsWorkspace<BillingReceipt>(loader, {
    enabled: Boolean(paymentId) && (can.owner || can.billing),
    shouldReloadOnEvent: () => false,
  });

  if (!can.owner && !shift) {
    return <AccessDenied title="بون الفاتورة" message="هذه الصفحة للمعلم أو المشرف النشط فقط." />;
  }

  if (!can.owner && !can.billing) {
    return <AccessDenied title="بون الفاتورة" />;
  }

  return (
    <>
      <style jsx global>{`
        @media print {
          @page {
            size: 80mm auto;
            margin: 4mm;
          }

          html,
          body {
            background: #ffffff !important;
          }

          .receipt-print-shell {
            width: 72mm !important;
            max-width: 72mm !important;
            padding: 0 !important;
            margin: 0 auto !important;
          }

          .receipt-print-root {
            width: 72mm !important;
            max-width: 72mm !important;
            border: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 auto !important;
          }
        }
      `}</style>

      <PrintPageFrame
        title="بون الفاتورة"
        exportFilename={data ? `receipt-${data.paymentId}` : 'receipt'}
        subtitle={data ? `${data.cafeName} • ${data.sessionLabel}` : 'جاري تحميل البون...'}
        shellClassName="receipt-print-shell w-full max-w-[26rem]"
        contentClassName="receipt-print-root rounded-[28px] px-5 py-5"
        titleClassName="text-center"
        subtitleClassName="text-center"
      >
        {!paymentId ? <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">رقم الفاتورة غير موجود.</div> : null}
        {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
        {!data && !error && paymentId ? <div className="rounded-2xl border border-dashed p-4 text-center text-sm text-neutral-500">جاري تجهيز البون القابل للطباعة...</div> : null}
        {data ? (
          <div className="space-y-4 text-[13px] leading-6 text-neutral-900">
            <section className="border-b border-dashed pb-3 text-center">
              <div className="text-xl font-black tracking-tight">{data.cafeName}</div>
              <div className="mt-1 text-[12px] text-neutral-500">فاتورة / Receipt</div>
            </section>

            <section className="space-y-1 border-b border-dashed pb-3 text-[12px]">
              <div className="flex items-center justify-between gap-2"><span className="text-neutral-500">رقم الفاتورة</span><span className="font-semibold">{data.paymentId}</span></div>
              <div className="flex items-center justify-between gap-2"><span className="text-neutral-500">التاريخ</span><span className="font-semibold">{formatDateTime(data.createdAt)}</span></div>
              <div className="flex items-center justify-between gap-2"><span className="text-neutral-500">نوع العملية</span><span className="font-semibold">{paymentKindLabel(data.paymentKind)}</span></div>
              <div className="flex items-center justify-between gap-2"><span className="text-neutral-500">الجلسة</span><span className="font-semibold">{data.sessionLabel}</span></div>
              <div className="flex items-center justify-between gap-2"><span className="text-neutral-500">المستخدم</span><span className="font-semibold">{data.actorLabel}</span></div>
              {data.debtorName ? <div className="flex items-center justify-between gap-2"><span className="text-neutral-500">اسم الآجل</span><span className="font-semibold">{data.debtorName}</span></div> : null}
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-500">
                <span>البيان</span>
                <span>الإجمالي</span>
              </div>
              <div className="border-y border-dashed">
                {data.lines.map((line) => (
                  <div key={`${line.orderItemId}-${line.quantity}`} className="flex items-start justify-between gap-3 border-b border-dashed py-2 last:border-b-0">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{line.productName}</div>
                      <div className="text-[11px] text-neutral-500">
                        {line.quantity} × {formatMoney(line.unitPrice)} ج
                      </div>
                    </div>
                    <div className="shrink-0 whitespace-nowrap font-semibold tabular-nums">{formatMoney(line.lineAmount)} ج</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-1 border-t border-dashed pt-3 text-[12px]">
              <div className="flex items-center justify-between gap-2"><span>الإجمالي قبل الإضافات</span><span className="font-semibold tabular-nums">{formatMoney(data.totals.subtotal)} ج</span></div>
              {data.settings.taxEnabled || data.totals.taxAmount > 0 ? <div className="flex items-center justify-between gap-2"><span>ضريبة ({formatMoney(data.settings.taxRate)}%)</span><span className="font-semibold tabular-nums">{formatMoney(data.totals.taxAmount)} ج</span></div> : null}
              {data.settings.serviceEnabled || data.totals.serviceAmount > 0 ? <div className="flex items-center justify-between gap-2"><span>خدمة ({formatMoney(data.settings.serviceRate)}%)</span><span className="font-semibold tabular-nums">{formatMoney(data.totals.serviceAmount)} ج</span></div> : null}
              <div className="mt-2 flex items-center justify-between border-t border-dashed pt-2 text-base font-black"><span>الإجمالي النهائي</span><span className="tabular-nums">{formatMoney(data.totals.total)} ج</span></div>
            </section>

            {data.notes ? (
              <section className="border-t border-dashed pt-3 text-[12px]">
                <div className="mb-1 text-neutral-500">ملاحظات</div>
                <div>{data.notes}</div>
              </section>
            ) : null}

            <section className="border-t border-dashed pt-3 text-center text-[11px] text-neutral-500">
              <div>شكراً لزيارتكم</div>
              <div>نتمنى لكم وقتاً سعيداً</div>
            </section>
          </div>
        ) : null}
        <div className="mt-4 text-center print:hidden">
          <Link href="/billing" className="text-sm font-semibold text-neutral-700 underline underline-offset-4">العودة إلى الحساب</Link>
        </div>
      </PrintPageFrame>
    </>
  );
}
