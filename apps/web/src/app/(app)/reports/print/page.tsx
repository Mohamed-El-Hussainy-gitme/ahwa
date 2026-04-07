'use client';

import Link from 'next/link';
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuthz } from '@/lib/authz';
import { opsClient } from '@/lib/ops/client';
import type { DeferredCustomerSummary, ProductReportRow, ReportsWorkspace, ReportsWorkspaceRequest, StaffPerformanceRow, ReportTotals, ReportComplaintEntry, ReportItemIssueEntry } from '@/lib/ops/types';
import { useOpsWorkspace } from '@/lib/ops/hooks';
import { AccessDenied } from '@/ui/AccessState';
import { PrintPageFrame } from '@/ui/print/PrintPageFrame';

function formatMoney(value: number) {
  return new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(value ?? 0);
}

function salesHint(totals: ReportTotals) {
  return totals.extrasTotal > 0 ? `+${formatMoney(totals.extrasTotal)} ج ضريبة + خدمة` : null;
}

function shiftKindLabel(kind: string) {
  return kind === 'morning' ? 'صباحي' : kind === 'evening' ? 'مسائي' : kind;
}

function periodLabel(key: string) {
  return key === 'day' ? 'اليوم' : key === 'week' ? 'الأسبوع' : key === 'month' ? 'الشهر' : key === 'year' ? 'السنة' : 'الوردية الحالية';
}

function sortProducts(items: ProductReportRow[]) {
  return [...items].sort((a, b) => (b.netSales - a.netSales) || (b.qtyDelivered - a.qtyDelivered));
}

function sortStaff(items: StaffPerformanceRow[]) {
  return [...items].sort((a, b) => (b.paymentTotal - a.paymentTotal) || (b.deliveredQty - a.deliveredQty));
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-neutral-50 p-3 text-center">
      <div className="text-[11px] text-neutral-500">{label}</div>
      <div className="mt-1 text-lg font-bold text-neutral-900">{value}</div>
    </div>
  );
}

function DeferredTable({ items }: { items: DeferredCustomerSummary[] }) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b bg-neutral-50 text-right">
          <th className="px-3 py-2">الاسم</th>
          <th className="px-3 py-2">الرصيد</th>
          <th className="px-3 py-2">الحالة</th>
          <th className="px-3 py-2">آخر حركة</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id} className="border-b">
            <td className="px-3 py-2">{item.debtorName}</td>
            <td className="px-3 py-2">{formatMoney(item.balance)} ج</td>
            <td className="px-3 py-2">{item.status === 'late' ? 'متأخر' : item.status === 'settled' ? 'مسدد' : 'نشط'}</td>
            <td className="px-3 py-2">{item.lastEntryAt ? new Date(item.lastEntryAt).toLocaleString('ar-EG') : 'بدون حركة'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type PrintableReport = {
  startDate: string;
  endDate: string;
  totals: ReportTotals;
  products: ProductReportRow[];
  staff: StaffPerformanceRow[];
  complaints: ReportComplaintEntry[];
  itemIssues: ReportItemIssueEntry[];
};

function ReportView({ period, title }: { period: PrintableReport | null; title: string }) {
  if (!period) {
    return <div className="rounded-2xl border border-dashed p-4 text-sm text-neutral-500">لا توجد بيانات لهذه الفترة.</div>;
  }

  const topProducts = sortProducts(period.products).slice(0, 12);
  const topStaff = sortStaff(period.staff).slice(0, 12);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card label="إجمالي البيع" value={`${formatMoney(period.totals.netSales)} ج`} />
        <Card label="الكاش" value={`${formatMoney(period.totals.cashSales)} ج`} />
        <Card label="الآجل" value={`${formatMoney(period.totals.deferredSales)} ج`} />
        <Card label="عدد الجلسات" value={String(period.totals.totalSessions)} />
        <Card label="البنود المسلمة" value={String(period.totals.deliveredQty)} />
        <Card label="إعادة مجانية" value={String(period.totals.remadeQty)} />
        <Card label="الإلغاء/الإسقاط" value={`${period.totals.cancelledQty}/${period.totals.waivedQty}`} />
        <Card label="الشكاوى والملاحظات" value={String(period.totals.complaintTotal + period.totals.itemIssueTotal)} />
      </div>

      <section>
        <div className="mb-2 text-sm font-bold">تفصيل {title}</div>
        <div className="rounded-2xl border p-3 text-sm text-neutral-700">
          من {period.startDate} إلى {period.endDate}
          {salesHint(period.totals) ? <div className="mt-2 text-xs text-amber-700">{salesHint(period.totals)}</div> : null}
        </div>
      </section>

      <section>
        <div className="mb-2 text-sm font-bold">أعلى المنتجات</div>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-neutral-50 text-right">
              <th className="px-3 py-2">المنتج</th>
              <th className="px-3 py-2">المحطة</th>
              <th className="px-3 py-2">المسلّم</th>
              <th className="px-3 py-2">الصافي</th>
            </tr>
          </thead>
          <tbody>
            {topProducts.map((row) => (
              <tr key={row.productId} className="border-b">
                <td className="px-3 py-2">{row.productName}</td>
                <td className="px-3 py-2">{row.stationCode}</td>
                <td className="px-3 py-2">{row.qtyDelivered}</td>
                <td className="px-3 py-2">{formatMoney(row.netSales)} ج</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <div className="mb-2 text-sm font-bold">العاملون</div>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-neutral-50 text-right">
              <th className="px-3 py-2">العامل</th>
              <th className="px-3 py-2">التسليم</th>
              <th className="px-3 py-2">البيع</th>
              <th className="px-3 py-2">الشكاوى/الملاحظات</th>
            </tr>
          </thead>
          <tbody>
            {topStaff.map((row) => (
              <tr key={row.actorKey} className="border-b">
                <td className="px-3 py-2">{row.actorLabel}</td>
                <td className="px-3 py-2">{row.deliveredQty}</td>
                <td className="px-3 py-2">{formatMoney(row.paymentTotal)} ج</td>
                <td className="px-3 py-2">{row.complaintCount + row.itemIssueCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <div className="mb-2 text-sm font-bold">الملاحظات والشكاوى</div>
        <div className="grid gap-2 md:grid-cols-2">
          <div className="rounded-2xl border p-3 text-sm">
            <div className="font-semibold">الشكاوى العامة</div>
            <div className="mt-2 text-neutral-700">{period.complaints.length ? `إجمالي ${period.complaints.length}` : 'لا توجد شكاوى عامة.'}</div>
          </div>
          <div className="rounded-2xl border p-3 text-sm">
            <div className="font-semibold">ملاحظات الأصناف</div>
            <div className="mt-2 text-neutral-700">{period.itemIssues.length ? `إجمالي ${period.itemIssues.length}` : 'لا توجد ملاحظات أصناف.'}</div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function ReportsPrintPage() {
  const { user } = useAuthz();
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') ?? 'current';
  const reportsRequest = useMemo<ReportsWorkspaceRequest>(() => ({
    weekAnchorDate: searchParams.get('weekAnchorDate') ?? undefined,
    monthAnchorDate: searchParams.get('monthAnchorDate') ?? undefined,
  }), [searchParams]);
  const loader = useCallback(() => opsClient.reportsWorkspace(reportsRequest), [reportsRequest]);
  const { data, error } = useOpsWorkspace<ReportsWorkspace>(loader, {
    cacheKey: `workspace:reports:print:${reportsRequest.weekAnchorDate ?? '-'}:${reportsRequest.monthAnchorDate ?? '-'}` ,
    staleTimeMs: 60_000,
    enabled: user?.baseRole === 'owner',
    shouldReloadOnEvent: () => false,
  });

  const selectedPeriod = useMemo(() => {
    if (!data) return null;
    if (tab === 'current') {
      return data.currentShift
        ? {
            key: 'current',
            label: 'الوردية الحالية',
            startDate: data.referenceDate,
            endDate: data.referenceDate,
            totals: data.currentShift,
            days: [],
            shifts: [data.currentShift],
            products: data.currentProducts,
            staff: data.currentStaff,
            complaints: data.currentComplaints,
            itemIssues: data.currentItemIssues,
          } as PrintableReport
        : null;
    }
    if (tab === 'day' || tab === 'week' || tab === 'month' || tab === 'year') {
      return data.periods[tab] as PrintableReport;
    }
    return null;
  }, [data, tab]);

  if (user?.baseRole !== 'owner') {
    return <AccessDenied title="تصدير التقارير" message="هذه الصفحة للمالك فقط." />;
  }

  return (
    <PrintPageFrame
      title={tab === 'deferred' ? 'تصدير دفتر الآجل' : `تقرير ${periodLabel(tab)}`}
      exportFilename={tab === 'deferred' ? 'دفتر-الآجل' : `تقرير-${periodLabel(tab)}`}
      subtitle={data ? `مرجع البيانات: ${data.referenceDate}${selectedPeriod ? ` • ${selectedPeriod.startDate} ← ${selectedPeriod.endDate}` : ''}` : 'جاري التحميل...'}
    >
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {!data && !error ? <div className="rounded-2xl border border-dashed p-4 text-sm text-neutral-500">جاري تجهيز النسخة القابلة للطباعة...</div> : null}
      {data ? (
        tab === 'deferred' ? (
          <DeferredTable items={data.deferredCustomers} />
        ) : (
          <ReportView period={selectedPeriod} title={tab === 'current' && data.currentShift ? shiftKindLabel(data.currentShift.kind) : periodLabel(tab)} />
        )
      ) : null}
      <div className="mt-4 print:hidden">
        <Link href="/reports" className="text-sm font-semibold text-neutral-700 underline underline-offset-4">العودة إلى التقارير</Link>
      </div>
    </PrintPageFrame>
  );
}
