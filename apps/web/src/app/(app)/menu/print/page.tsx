'use client';

import Link from 'next/link';
import { useCallback, useMemo } from 'react';
import { useAuthz } from '@/lib/authz';
import { AccessDenied } from '@/ui/AccessState';
import { opsClient } from '@/lib/ops/client';
import type { MenuWorkspace } from '@/lib/ops/types';
import { useOpsWorkspace } from '@/lib/ops/hooks';
import { PrintPageFrame } from '@/ui/print/PrintPageFrame';

function formatMoney(value: number) {
  return new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(value ?? 0);
}

export default function MenuPrintPage() {
  const { can } = useAuthz();
  const loader = useCallback(() => opsClient.menuWorkspace(), []);
  const { data, error } = useOpsWorkspace<MenuWorkspace>(loader, {
    enabled: can.manageMenu,
    shouldReloadOnEvent: () => false,
  });

  const sections = useMemo(() => (data?.sections ?? []).filter((section) => section.isActive !== false), [data?.sections]);
  const products = data?.products ?? [];

  if (!can.manageMenu) {
    return <AccessDenied title="تصدير المنيو" />;
  }

  return (
    <PrintPageFrame title="المنيو" subtitle={data ? `عدد الأقسام ${sections.length} • عدد الأصناف ${products.filter((product) => product.isActive !== false).length}` : 'جاري التحميل...'}>
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {!data && !error ? <div className="rounded-2xl border border-dashed p-4 text-sm text-neutral-500">جاري تجهيز المنيو للطباعة...</div> : null}
      {data ? (
        <div className="space-y-4">
          {sections.map((section) => {
            const rows = products.filter((product) => product.sectionId === section.id && product.isActive !== false);
            return (
              <section key={section.id} className="rounded-2xl border p-3">
                <div className="flex items-center justify-between gap-3 border-b pb-2">
                  <div className="text-lg font-bold">{section.title}</div>
                  <div className="text-xs text-neutral-500">{section.stationCode}</div>
                </div>
                <table className="mt-3 w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b bg-neutral-50 text-right">
                      <th className="px-3 py-2">الصنف</th>
                      <th className="px-3 py-2">المحطة</th>
                      <th className="px-3 py-2">السعر</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-b last:border-b-0">
                        <td className="px-3 py-2">{row.name}</td>
                        <td className="px-3 py-2">{row.stationCode}</td>
                        <td className="px-3 py-2">{formatMoney(row.unitPrice)} ج</td>
                      </tr>
                    ))}
                    {!rows.length ? (
                      <tr>
                        <td colSpan={3} className="px-3 py-4 text-center text-neutral-500">لا توجد أصناف نشطة في هذا القسم.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </section>
            );
          })}
        </div>
      ) : null}
      <div className="mt-4 print:hidden">
        <Link href="/menu" className="text-sm font-semibold text-neutral-700 underline underline-offset-4">العودة إلى المنيو</Link>
      </div>
    </PrintPageFrame>
  );
}
