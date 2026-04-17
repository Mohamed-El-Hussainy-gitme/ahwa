'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuthz } from '@/lib/authz';
import { opsClient } from '@/lib/ops/client';
import type { AddonReportRow, CustomRangeReport, DeferredCustomerSummary, ProductReportRow, ReportsWorkspace, StaffPerformanceRow, ReportTotals, ReportComplaintEntry, ReportItemIssueEntry } from '@/lib/ops/types';
import { useOpsWorkspace } from '@/lib/ops/hooks';
import { AccessDenied } from '@/ui/AccessState';
import { PrintPageFrame } from '@/ui/print/PrintPageFrame';

function formatMoney(value: number) {
  return new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(value ?? 0);
}

function shiftKindLabel(kind: string) {
  return kind === 'morning' ? 'صباحي' : kind === 'evening' ? 'مسائي' : kind;
}

function periodLabel(key: string) {
  return key === 'day' ? 'اليوم' : key === 'week' ? 'الأسبوع' : key === 'month' ? 'الشهر' : key === 'year' ? 'السنة' : key === 'range' ? 'فترة مخصصة' : 'الوردية الحالية';
}

function sortProducts(items: ProductReportRow[]) {
  return [...items].sort((a, b) => (b.netSales - a.netSales) || (b.qtyDelivered - a.qtyDelivered));
}

function sortAddons(items: AddonReportRow[]) {
  return [...items].sort((a, b) => (b.netSales - a.netSales) || (b.usageCount - a.usageCount));
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
  addons: AddonReportRow[];
  staff: StaffPerformanceRow[];
  complaints: ReportComplaintEntry[];
  itemIssues: ReportItemIssueEntry[];
};

function ReportView({ period, title }: { period: PrintableReport | null; title: string }) {
  if (!period) {
    return <div className="rounded-2xl border border-dashed p-4 text-sm text-neutral-500">لا توجد بيانات لهذه الفترة.</div>;
  }

  const topProducts = sortProducts(period.products).slice(0, 12);
  const topAddons = sortAddons(period.addons).slice(0, 12);
  const topStaff = sortStaff(period.staff).slice(0, 12);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Card label="إجمالي البيع" value={`${formatMoney(period.totals.netSales)} ج`} />
        <Card label="الضريبة" value={`${formatMoney(period.totals.taxTotal)} ج`} />
        <Card label="الخدمة" value={`${formatMoney(period.totals.serviceTotal)} ج`} />
        <Card label="الإضافات" value={`${formatMoney(period.totals.addonSales)} ج`} />
        <Card label="الكاش" value={`${formatMoney(period.totals.cashSales)} ج`} />
        <Card label="الآجل" value={`${formatMoney(period.totals.deferredSales)} ج`} />
        <Card label="سداد الآجل" value={`${formatMoney(period.totals.repaymentTotal)} ج`} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
        <Card label="الجلسات التشغيلية" value={String(period.totals.totalSessions)} />
        <Card label="طلبات تم تسليمها" value={String(period.totals.deliveredQty)} />
        <Card label="طلبات أُعيد تجهيزها" value={String(period.totals.remadeQty)} />
        <Card label="الإلغاء/الإسقاط" value={`${period.totals.cancelledQty}/${period.totals.waivedQty}`} />
        <Card label="فجوة المطابقة" value={`${formatMoney(period.totals.salesReconciliationGap)} ج`} />
      </div>

      <section>
        <div className="mb-2 text-sm font-bold">تفصيل {title}</div>
        <div className="rounded-2xl border p-3 text-sm text-neutral-700">
          من {period.startDate} إلى {period.endDate}
          <div className="mt-2 text-xs text-neutral-600">الضريبة {formatMoney(period.totals.taxTotal)} ج • الخدمة {formatMoney(period.totals.serviceTotal)} ج • الإضافات {formatMoney(period.totals.addonSales)} ج</div>
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
        <div className="mb-2 text-sm font-bold">أعلى الإضافات</div>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-neutral-50 text-right">
              <th className="px-3 py-2">الإضافة</th>
              <th className="px-3 py-2">المحطة</th>
              <th className="px-3 py-2">الاستخدام</th>
              <th className="px-3 py-2">الصافي</th>
            </tr>
          </thead>
          <tbody>
            {topAddons.map((row) => (
              <tr key={row.addonId} className="border-b">
                <td className="px-3 py-2">{row.addonName}</td>
                <td className="px-3 py-2">{row.stationCode}</td>
                <td className="px-3 py-2">{row.usageCount}</td>
                <td className="px-3 py-2">{formatMoney(row.netSales)} ج</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <div className="mb-2 text-sm font-bold">تقرير العاملين التشغيلي</div>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-neutral-50 text-right">
              <th className="px-3 py-2">العامل</th>
              <th className="px-3 py-2">أخذ أوردرات</th>
              <th className="px-3 py-2">جهز طلبات</th>
              <th className="px-3 py-2">سلّم طلبات</th>
              <th className="px-3 py-2">حاسب العملاء</th>
              <th className="px-3 py-2">كاش/آجل/سداد</th>
              <th className="px-3 py-2">الملاحظات والجودة</th>
            </tr>
          </thead>
          <tbody>
            {topStaff.map((row) => (
              <tr key={row.actorKey} className="border-b">
                <td className="px-3 py-2">{row.actorLabel}</td>
                <td className="px-3 py-2">{row.submittedQty}</td>
                <td className="px-3 py-2">{row.readyQty}</td>
                <td className="px-3 py-2">{row.deliveredQty}</td>
                <td className="px-3 py-2">{formatMoney(row.paymentTotal)} ج</td>
                <td className="px-3 py-2">{formatMoney(row.cashSales)} / {formatMoney(row.deferredSales)} / {formatMoney(row.repaymentTotal)}</td>
                <td className="px-3 py-2">{row.complaintCount + row.itemIssueCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <div className="mb-2 text-sm font-bold">الملاحظات والجودة</div>
        <div className="grid gap-2 md:grid-cols-2">
          <div className="rounded-2xl border p-3 text-sm">
            <div className="font-semibold">الملاحظات العامة على الجلسات</div>
            <div className="mt-2 text-neutral-700">{period.complaints.length ? `إجمالي ${period.complaints.length}` : 'لا توجد ملاحظات عامة.'}</div>
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

function ReportsPrintPageContent() {
  const { user } = useAuthz();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get('tab') ?? 'current';
  const startDate = searchParams.get('startDate') ?? '';
  const endDate = searchParams.get('endDate') ?? '';
  const isBranchManager = user?.ownerLabel === 'branch_manager';
  const tab = isBranchManager && rawTab === 'deferred' ? 'current' : rawTab;
  const loader = useCallback(() => opsClient.reportsWorkspace(startDate && endDate ? { startDate, endDate } : undefined), [endDate, startDate]);
  const { data, error } = useOpsWorkspace<ReportsWorkspace>(loader, {
    cacheKey: `workspace:reports:print:${startDate}:${endDate}:${tab}`,
    staleTimeMs: 60_000,
    enabled: user?.baseRole === 'owner',
    shouldReloadOnEvent: () => false,
  });

  const selectedPeriod = useMemo<PrintableReport | CustomRangeReport | null>(() => {
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
            addons: data.currentAddons,
            staff: data.currentStaff,
            complaints: data.currentComplaints,
            itemIssues: data.currentItemIssues,
          } as PrintableReport
        : null;
    }
    if (tab === 'day' || tab === 'week' || tab === 'month' || tab === 'year') {
      return data.periods[tab] as PrintableReport;
    }
    if (tab === 'range') {
      return data.customRange as PrintableReport | null;
    }
    return null;
  }, [data, tab]);

  if (user?.baseRole !== 'owner') {
    return <AccessDenied title="تصدير التقارير" message="هذه الصفحة للإدارة فقط." />;
  }

  return (
    <PrintPageFrame
      title={tab === 'deferred' ? 'تصدير دفتر الآجل' : `تقرير ${periodLabel(tab)}`}
      exportFilename={tab === 'deferred' ? 'دفتر-الآجل' : `تقرير-${periodLabel(tab)}`}
      subtitle={data ? `مرجع البيانات: ${data.referenceDate}` : 'جاري التحميل...'}
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

export default function ReportsPrintPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-white" />}>
      <ReportsPrintPageContent />
    </Suspense>
  );
}
