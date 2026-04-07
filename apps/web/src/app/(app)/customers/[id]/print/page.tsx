'use client';

import Link from 'next/link';
import { useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useAuthz } from '@/lib/authz';
import { AccessDenied } from '@/ui/AccessState';
import { opsClient } from '@/lib/ops/client';
import type { DeferredCustomerLedgerWorkspace } from '@/lib/ops/types';
import { useOpsWorkspace } from '@/lib/ops/hooks';
import { PrintPageFrame } from '@/ui/print/PrintPageFrame';

function formatMoney(value: number) {
  return new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(value ?? 0);
}

function actorLabel(label: string | null) {
  if (label === 'owner') return 'المالك';
  if (label === 'staff') return 'فريق التشغيل';
  return 'غير محدد';
}

export default function CustomerLedgerPrintPage() {
  const params = useParams<{ id: string }>();
  const { can, shift } = useAuthz();
  const debtorName = useMemo(() => decodeURIComponent(String(params.id ?? '')), [params.id]);
  const loader = useCallback(() => opsClient.deferredCustomerLedger(debtorName), [debtorName]);
  const { data, error } = useOpsWorkspace<DeferredCustomerLedgerWorkspace>(loader, {
    cacheKey: `workspace:customer-ledger:print:${debtorName}`,
    staleTimeMs: 60_000,
    enabled: Boolean(debtorName) && (can.owner || can.billing),
    shouldReloadOnEvent: () => false,
  });

  if (!can.owner && !shift) {
    return <AccessDenied title="كشف العميل" message="النسخة القابلة للطباعة متاحة للمالك أو مشرف التشغيل النشط فقط." />;
  }

  if (!can.owner && !can.billing) {
    return <AccessDenied title="كشف العميل" />;
  }

  return (
    <PrintPageFrame title={data?.debtorName ?? debtorName} exportFilename={`كشف-${debtorName}`} subtitle={data ? `الرصيد الحالي ${formatMoney(data.balance)} ج` : 'جاري التحميل...'}>
      {error ? <div className="rounded-2xl border border-[#e6c7c2] bg-[#fff3f1] p-3 text-sm text-[#9a3e35]">{error}</div> : null}
      {!data && !error ? <div className="rounded-2xl border border-dashed p-4 text-sm text-[#8a7763]">جاري تجهيز الكشف...</div> : null}
      {data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-2xl border bg-[#f8f1e7] p-3 text-center"><div className="text-xs text-[#8a7763]">الرصيد</div><div className="mt-1 text-lg font-bold">{formatMoney(data.balance)} ج</div></div>
            <div className="rounded-2xl border bg-[#f8f1e7] p-3 text-center"><div className="text-xs text-[#8a7763]">إجمالي الترحيل</div><div className="mt-1 text-lg font-bold">{formatMoney(data.debtTotal)} ج</div></div>
            <div className="rounded-2xl border bg-[#f8f1e7] p-3 text-center"><div className="text-xs text-[#8a7763]">إجمالي السداد</div><div className="mt-1 text-lg font-bold">{formatMoney(data.repaymentTotal)} ج</div></div>
            <div className="rounded-2xl border bg-[#f8f1e7] p-3 text-center"><div className="text-xs text-[#8a7763]">عدد الحركات</div><div className="mt-1 text-lg font-bold">{data.entryCount}</div></div>
          </div>

          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b bg-[#f8f1e7] text-right">
                <th className="px-3 py-2">الوقت</th>
                <th className="px-3 py-2">النوع</th>
                <th className="px-3 py-2">المبلغ</th>
                <th className="px-3 py-2">سجّلها</th>
                <th className="px-3 py-2">ملاحظة</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((entry) => (
                <tr key={entry.id} className="border-b">
                  <td className="px-3 py-2">{new Date(entry.createdAt).toLocaleString('ar-EG')}</td>
                  <td className="px-3 py-2">{entry.entryKind === 'repayment' ? 'سداد' : entry.entryKind === 'debt' ? 'ترحيل' : 'تعديل'}</td>
                  <td className="px-3 py-2">{formatMoney(entry.amount)} ج</td>
                  <td className="px-3 py-2">{actorLabel(entry.actorLabel)}</td>
                  <td className="px-3 py-2">{entry.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className="mt-4 print:hidden">
        <Link href={`/customers/${encodeURIComponent(debtorName)}`} className="text-sm font-semibold text-[#5e4d3f] underline underline-offset-4">العودة إلى كشف العميل</Link>
      </div>
    </PrintPageFrame>
  );
}
