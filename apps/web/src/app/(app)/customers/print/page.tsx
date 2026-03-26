'use client';

import Link from 'next/link';
import { useCallback } from 'react';
import { useAuthz } from '@/lib/authz';
import { AccessDenied } from '@/ui/AccessState';
import { opsClient } from '@/lib/ops/client';
import type { DeferredCustomerSummary } from '@/lib/ops/types';
import { useOpsWorkspace } from '@/lib/ops/hooks';
import { PrintPageFrame } from '@/ui/print/PrintPageFrame';

function formatMoney(value: number) {
  return new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(value ?? 0);
}

export default function CustomersPrintPage() {
  const { can, shift } = useAuthz();
  const loader = useCallback(() => opsClient.deferredCustomersWorkspace(), []);
  const { data, error } = useOpsWorkspace<{ items: DeferredCustomerSummary[] }>(loader, {
    enabled: can.owner || can.billing,
    shouldReloadOnEvent: () => false,
  });

  if (!can.owner && !shift) {
    return <AccessDenied title="تصدير دفتر الآجل" message="النسخة القابلة للطباعة متاحة للمالك أو مشرف التشغيل النشط فقط." />;
  }

  if (!can.owner && !can.billing) {
    return <AccessDenied title="تصدير دفتر الآجل" />;
  }

  const items = data?.items ?? [];
  const totalDebt = items.reduce((sum, item) => sum + Math.max(item.balance, 0), 0);

  return (
    <PrintPageFrame title="دفتر الآجل" exportFilename="دفتر-الآجل" subtitle={data ? `إجمالي الرصيد المفتوح ${formatMoney(totalDebt)} ج` : 'جاري التحميل...'}>
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {!data && !error ? <div className="rounded-2xl border border-dashed p-4 text-sm text-neutral-500">جاري تجهيز النسخة القابلة للطباعة...</div> : null}
      {data ? (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-neutral-50 text-right">
              <th className="px-3 py-2">الاسم</th>
              <th className="px-3 py-2">الرصيد</th>
              <th className="px-3 py-2">الحالة</th>
              <th className="px-3 py-2">عمر الرصيد</th>
              <th className="px-3 py-2">آخر حركة</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b">
                <td className="px-3 py-2">{item.debtorName}</td>
                <td className="px-3 py-2">{formatMoney(item.balance)} ج</td>
                <td className="px-3 py-2">{item.status === 'late' ? 'متأخر' : item.status === 'settled' ? 'مسدد' : 'نشط'}</td>
                <td className="px-3 py-2">{item.agingBucket === 'older' ? 'أكثر من أسبوع' : item.agingBucket === 'week' ? 'حتى أسبوع' : item.agingBucket === 'three_days' ? 'حتى 3 أيام' : item.agingBucket === 'settled' ? 'مسدد' : 'اليوم'}</td>
                <td className="px-3 py-2">{item.lastEntryAt ? new Date(item.lastEntryAt).toLocaleString('ar-EG') : 'بدون حركة'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <div className="mt-4 print:hidden">
        <Link href="/customers" className="text-sm font-semibold text-neutral-700 underline underline-offset-4">العودة إلى دفتر الآجل</Link>
      </div>
    </PrintPageFrame>
  );
}
