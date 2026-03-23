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
  return new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(value ?? 0);
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
    <PrintPageFrame
      title="بون الفاتورة"
      exportFilename={data ? `receipt-${data.paymentId}` : 'receipt'}
      subtitle={data ? `${data.cafeName} • ${data.sessionLabel} • ${new Date(data.createdAt).toLocaleString('ar-EG')}` : 'جاري تحميل البون...'}
    >
      {!paymentId ? <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">رقم الفاتورة غير موجود.</div> : null}
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {!data && !error && paymentId ? <div className="rounded-2xl border border-dashed p-4 text-sm text-neutral-500">جاري تجهيز البون القابل للطباعة...</div> : null}
      {data ? (
        <div className="space-y-4 text-sm">
          <section className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border p-3">
              <div className="text-xs text-neutral-500">رقم الفاتورة</div>
              <div className="mt-1 font-semibold">{data.paymentId}</div>
              <div className="mt-3 text-xs text-neutral-500">نوع العملية</div>
              <div className="mt-1 font-semibold">{data.paymentKind === 'deferred' ? 'آجل' : 'كاش'}</div>
            </div>
            <div className="rounded-2xl border p-3">
              <div className="text-xs text-neutral-500">الجلسة</div>
              <div className="mt-1 font-semibold">{data.sessionLabel}</div>
              <div className="mt-3 text-xs text-neutral-500">المستخدم</div>
              <div className="mt-1 font-semibold">{data.actorLabel}</div>
            </div>
          </section>

          {data.debtorName ? (
            <section className="rounded-2xl border p-3">
              <div className="text-xs text-neutral-500">اسم الآجل</div>
              <div className="mt-1 font-semibold">{data.debtorName}</div>
            </section>
          ) : null}

          <section>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-neutral-50 text-right">
                  <th className="px-3 py-2">الصنف</th>
                  <th className="px-3 py-2">الكمية</th>
                  <th className="px-3 py-2">سعر الوحدة</th>
                  <th className="px-3 py-2">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {data.lines.map((line) => (
                  <tr key={`${line.orderItemId}-${line.quantity}`} className="border-b">
                    <td className="px-3 py-2">{line.productName}</td>
                    <td className="px-3 py-2">{line.quantity}</td>
                    <td className="px-3 py-2">{formatMoney(line.unitPrice)} ج</td>
                    <td className="px-3 py-2">{formatMoney(line.lineAmount)} ج</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="mr-auto w-full max-w-sm rounded-2xl border p-3">
            <div className="flex items-center justify-between py-1"><span>الإجمالي قبل الإضافات</span><span>{formatMoney(data.totals.subtotal)} ج</span></div>
            {data.settings.taxEnabled || data.totals.taxAmount > 0 ? <div className="flex items-center justify-between py-1"><span>ضريبة ({formatMoney(data.settings.taxRate)}%)</span><span>{formatMoney(data.totals.taxAmount)} ج</span></div> : null}
            {data.settings.serviceEnabled || data.totals.serviceAmount > 0 ? <div className="flex items-center justify-between py-1"><span>خدمة ({formatMoney(data.settings.serviceRate)}%)</span><span>{formatMoney(data.totals.serviceAmount)} ج</span></div> : null}
            <div className="mt-2 flex items-center justify-between border-t pt-2 text-base font-bold"><span>الإجمالي النهائي</span><span>{formatMoney(data.totals.total)} ج</span></div>
          </section>

          {data.notes ? <section className="rounded-2xl border p-3"><div className="text-xs text-neutral-500">ملاحظات</div><div className="mt-1">{data.notes}</div></section> : null}
        </div>
      ) : null}
      <div className="mt-4 print:hidden">
        <Link href="/billing" className="text-sm font-semibold text-neutral-700 underline underline-offset-4">العودة إلى الحساب</Link>
      </div>
    </PrintPageFrame>
  );
}
