'use client';

import { useCallback, useMemo, useState } from 'react';
import { MobileShell } from '@/ui/MobileShell';
import { useAuthz } from '@/lib/authz';
import { AccessDenied } from '@/ui/AccessState';
import { opsClient } from '@/lib/ops/client';
import type {
  DeferredCustomerSummary,
  PeriodReport,
  ProductReportRow,
  ReportComplaintEntry,
  ReportItemIssueEntry,
  ReportsWorkspace,
  ReportShiftRow,
  ReportTotals,
  StaffPerformanceRow,
} from '@/lib/ops/types';
import { useOpsWorkspace } from '@/lib/ops/hooks';

type ReportTab = 'current' | 'day' | 'week' | 'month' | 'year' | 'deferred';
type DetailTab = 'overview' | 'products' | 'staff' | 'issues';

function formatMoney(value: number) {
  return new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(value ?? 0);
}
function shiftKindLabel(kind: string) {
  return kind === 'morning' ? 'صباحي' : kind === 'evening' ? 'مسائي' : kind;
}
function periodLabel(key: PeriodReport['key']) {
  return key === 'day' ? 'اليوم' : key === 'week' ? 'الأسبوع' : key === 'month' ? 'الشهر' : 'السنة';
}
function complaintKindLabel(kind: ReportComplaintEntry['complaintKind'] | ReportItemIssueEntry['issueKind']) {
  switch (kind) {
    case 'quality_issue':
      return 'جودة';
    case 'wrong_item':
      return 'صنف خطأ';
    case 'delay':
      return 'تأخير';
    case 'billing_issue':
      return 'حساب';
    default:
      return 'أخرى';
  }
}
function itemIssueActionLabel(kind: ReportItemIssueEntry['actionKind']) {
  switch (kind) {
    case 'note':
      return 'ملاحظة';
    case 'remake':
      return 'إعادة مجانية';
    case 'cancel_undelivered':
      return 'إلغاء';
    case 'waive_delivered':
      return 'إسقاط';
    default:
      return kind;
  }
}
function formatIssueTime(value: string) {
  return new Date(value).toLocaleString('ar-EG', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
}

function sortProducts(items: ProductReportRow[]) {
  return [...items].sort((a, b) => (b.netSales - a.netSales) || (b.qtyDelivered - a.qtyDelivered) || a.productName.localeCompare(b.productName, 'ar'));
}
function sortStaff(items: StaffPerformanceRow[]) {
  return [...items].sort((a, b) => (b.paymentTotal - a.paymentTotal) || (b.deliveredQty - a.deliveredQty) || a.actorLabel.localeCompare(b.actorLabel, 'ar'));
}

function MetricCard({
  label,
  value,
  tone = 'default',
  hint,
}: {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'warning';
  hint?: string;
}) {
  const toneClass =
    tone === 'success'
      ? 'border-emerald-200 bg-emerald-50'
      : tone === 'warning'
        ? 'border-amber-200 bg-amber-50'
        : 'border-neutral-200 bg-neutral-50';
  return (
    <div className={`rounded-2xl border px-3 py-3 text-center ${toneClass}`}>
      <div className="text-[11px] text-neutral-500">{label}</div>
      <div className="mt-1 text-lg font-bold text-neutral-900">{value}</div>
      {hint ? <div className="mt-1 text-[11px] text-neutral-500">{hint}</div> : null}
    </div>
  );
}

function TotalsHero({
  title,
  subtitle,
  totals,
  leadStatus,
}: {
  title: string;
  subtitle: string;
  totals: ReportTotals;
  leadStatus?: string;
}) {
  return (
    <div className="rounded-3xl border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-bold">{title}</div>
          <div className="mt-1 text-xs text-neutral-500">{subtitle}</div>
        </div>
        {leadStatus ? <div className="rounded-full border bg-neutral-50 px-3 py-1 text-[11px] font-semibold text-neutral-700">{leadStatus}</div> : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <MetricCard label="صافي المبيعات" value={`${formatMoney(totals.netSales)} ج`} tone="success" />
        <MetricCard label="الكاش" value={`${formatMoney(totals.cashSales)} ج`} />
        <MetricCard label="الآجل المرحل" value={`${formatMoney(totals.deferredSales)} ج`} />
        <MetricCard label="سداد الآجل" value={`${formatMoney(totals.repaymentTotal)} ج`} />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-5">
        <MetricCard label="الجلسات" value={String(totals.totalSessions)} hint={`مفتوحة ${totals.openSessions} • مغلقة ${totals.closedSessions}`} />
        <MetricCard label="البنود المسلّمة" value={String(totals.deliveredQty)} hint={`بديل مجاني ${totals.replacementDeliveredQty}`} />
        <MetricCard label="الجاهز" value={String(totals.readyQty)} hint={`المدفوع ${totals.paidQty} • الآجل ${totals.deferredQty}`} />
        <MetricCard label="إعادة مجانية" value={String(totals.remadeQty)} tone={totals.remadeQty > 0 ? 'warning' : 'default'} hint={`إلغاء ${totals.cancelledQty} • إسقاط ${totals.waivedQty}`} />
        <MetricCard label="الملاحظات والشكاوى" value={String(totals.complaintTotal + totals.itemIssueTotal)} hint={`شكاوى ${totals.complaintTotal} • أصناف ${totals.itemIssueTotal}`} />
      </div>
    </div>
  );
}

function InsightStrip({
  topProduct,
  topStaff,
  totals,
}: {
  topProduct: ProductReportRow | null;
  topStaff: StaffPerformanceRow | null;
  totals: ReportTotals;
}) {
  const chips = [
    topProduct ? `الأعلى بيعًا: ${topProduct.productName} (${formatMoney(topProduct.netSales)} ج)` : 'لا يوجد منتج متصدر بعد',
    topStaff ? `الأعلى تحصيلًا: ${topStaff.actorLabel} (${formatMoney(topStaff.paymentTotal)} ج)` : 'لا يوجد تحصيل مسجل بعد',
    `الملاحظات: ${totals.itemIssueNote} • إعادة مجانية: ${totals.itemIssueRemake} • شكاوى عامة مفتوحة: ${totals.complaintOpen}`,
  ];

  return (
    <div className="rounded-2xl border bg-white p-3 shadow-sm">
      <div className="mb-2 text-sm font-semibold">ملخص سريع</div>
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <div key={chip} className="rounded-full border bg-neutral-50 px-3 py-2 text-xs text-neutral-700">
            {chip}
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailTabs({ value, onChange }: { value: DetailTab; onChange: (value: DetailTab) => void }) {
  const items: { key: DetailTab; label: string }[] = [
    { key: 'overview', label: 'الملخص' },
    { key: 'products', label: 'المنتجات' },
    { key: 'staff', label: 'العاملون' },
    { key: 'issues', label: 'الملاحظات' },
  ];
  return (
    <div className="grid grid-cols-4 gap-2 rounded-2xl border bg-white p-2 shadow-sm">
      {items.map((item) => (
        <button
          key={item.key}
          onClick={() => onChange(item.key)}
          className={[
            'rounded-2xl px-2 py-2 text-xs font-semibold transition',
            value === item.key ? 'bg-neutral-900 text-white' : 'bg-neutral-50 text-neutral-700',
          ].join(' ')}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed bg-neutral-50 p-4 text-sm text-neutral-500">{text}</div>;
}

function ProductList({ items }: { items: ProductReportRow[] }) {
  if (!items.length) return <EmptyState text="لا توجد بيانات منتجات في هذه الفترة." />;
  const ranked = sortProducts(items);
  return (
    <div className="space-y-2">
      {ranked.map((row, index) => (
        <div key={row.productId} className="rounded-2xl border bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="text-right">
              <div className="flex items-center gap-2">
                <span className="rounded-full border bg-neutral-50 px-2 py-1 text-[11px] font-semibold text-neutral-600">#{index + 1}</span>
                <div className="font-semibold">{row.productName}</div>
              </div>
              <div className="mt-1 text-xs text-neutral-500">{row.stationCode} • مسلّم {row.qtyDelivered} • بديل مجاني {row.qtyReplacementDelivered}</div>
              <div className="mt-1 text-xs text-neutral-500">إعادة مجانية {row.qtyRemade} • إلغاء {row.qtyCancelled} • إسقاط {row.qtyWaived}</div>
            </div>
            <div className="text-left">
              <div className="text-base font-bold">{formatMoney(row.netSales)} ج</div>
              <div className="mt-1 text-xs text-neutral-500">إجمالي البيع {formatMoney(row.grossSales)} ج</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function StaffList({ items }: { items: StaffPerformanceRow[] }) {
  if (!items.length) return <EmptyState text="لا توجد بيانات أداء عاملين في هذه الفترة." />;
  const ranked = sortStaff(items);
  return (
    <div className="space-y-2">
      {ranked.map((row, index) => (
        <div key={row.actorLabel} className="rounded-2xl border bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="text-right">
              <div className="flex items-center gap-2">
                <span className="rounded-full border bg-neutral-50 px-2 py-1 text-[11px] font-semibold text-neutral-600">#{index + 1}</span>
                <div className="font-semibold">{row.actorLabel}</div>
              </div>
              <div className="mt-1 text-xs text-neutral-500">تسليم {row.deliveredQty} • بدائل مجانية {row.replacementDeliveredQty} • تجهيز {row.readyQty}</div>
              <div className="mt-1 text-xs text-neutral-500">إعادة مجانية {row.remadeQty} • إلغاء {row.cancelledQty} • شكاوى {row.complaintCount} • ملاحظات أصناف {row.itemIssueCount}</div>
            </div>
            <div className="text-left">
              <div className="text-base font-bold">{formatMoney(row.paymentTotal)} ج</div>
              <div className="mt-1 text-xs text-neutral-500">كاش {formatMoney(row.cashSales)} • آجل {formatMoney(row.deferredSales)}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ShiftList({ items }: { items: ReportShiftRow[] }) {
  if (!items.length) return <EmptyState text="لا توجد ورديات في هذه الفترة." />;
  return (
    <div className="space-y-2">
      {items.map((row) => (
        <div key={row.shiftId} className="rounded-2xl border bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="text-right">
              <div className="font-semibold">{shiftKindLabel(row.kind)}</div>
              <div className="mt-1 text-xs text-neutral-500">{row.businessDate ?? ''}</div>
              <div className="mt-1 text-xs text-neutral-500">{row.status === 'open' ? 'مفتوحة' : 'مقفولة'} • جلسات {row.totalSessions} • شكاوى {row.complaintTotal} • ملاحظات أصناف {row.itemIssueTotal}</div>
            </div>
            <div className="text-left">
              <div className="text-base font-bold">{formatMoney(row.netSales)} ج</div>
              <div className="mt-1 text-xs text-neutral-500">مسلّم {row.deliveredQty} • بدائل مجانية {row.replacementDeliveredQty}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function DayBreakdown({ period }: { period: PeriodReport }) {
  if (!period.days.length) return <EmptyState text="لا يوجد تجميع يومي في هذه الفترة." />;
  return (
    <div className="space-y-2">
      {period.days.map((row) => (
        <div key={row.businessDate} className="rounded-2xl border bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="text-right">
              <div className="font-semibold">{row.businessDate}</div>
              <div className="mt-1 text-xs text-neutral-500">ورديات {row.shiftCount} • جلسات {row.totalSessions} • شكاوى {row.complaintTotal} • ملاحظات أصناف {row.itemIssueTotal}</div>
            </div>
            <div className="text-left">
              <div className="text-base font-bold">{formatMoney(row.netSales)} ج</div>
              <div className="mt-1 text-xs text-neutral-500">مسلّم {row.deliveredQty} • إعادات مجانية {row.remadeQty} • بدائل مجانية {row.replacementDeliveredQty}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function DeferredList({ items }: { items: DeferredCustomerSummary[] }) {
  if (!items.length) return <EmptyState text="لا توجد أرصدة آجل حتى الآن." />;
  const ranked = [...items].sort((a, b) => b.balance - a.balance || a.debtorName.localeCompare(b.debtorName, 'ar'));
  return (
    <div className="space-y-2">
      {ranked.map((row) => (
        <div key={row.id} className="rounded-2xl border bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="text-right">
              <div className="font-semibold">{row.debtorName}</div>
              <div className="mt-1 text-xs text-neutral-500">دين {formatMoney(row.debtTotal)} • سداد {formatMoney(row.repaymentTotal)}</div>
              <div className="mt-1 text-xs text-neutral-500">آخر حركة: {row.lastEntryAt ? formatIssueTime(row.lastEntryAt) : '—'}</div>
            </div>
            <div className="text-left">
              <div className="text-base font-bold">{formatMoney(row.balance)} ج</div>
              <div className="mt-1 text-xs text-neutral-500">{row.entryCount} حركة</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ComplaintTimeline({ items }: { items: ReportComplaintEntry[] }) {
  if (!items.length) return <EmptyState text="لا توجد شكاوى عامة محفوظة في هذه الفترة." />;
  return (
    <div className="space-y-2">
      {items.map((row) => (
        <div key={row.id} className="rounded-2xl border bg-white p-3 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="text-right">
              <div className="font-semibold">{row.sessionLabel}</div>
              <div className="mt-1 text-xs text-neutral-500">{complaintKindLabel(row.complaintKind)} • {row.businessDate ?? '--'} • {shiftKindLabel(row.shiftKind)}</div>
              {row.notes ? <div className="mt-2 rounded-xl bg-neutral-50 p-2 text-sm text-neutral-700 whitespace-pre-wrap">{row.notes}</div> : null}
              <div className="mt-2 text-[11px] text-neutral-500">{row.createdByLabel ?? 'غير محدد'} • {formatIssueTime(row.createdAt)}</div>
            </div>
            <div className="shrink-0 rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600">
              {row.status === 'open' ? 'مفتوحة' : row.status === 'resolved' ? 'تمت المعالجة' : 'مغلقة'}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ItemIssueTimeline({ items }: { items: ReportItemIssueEntry[] }) {
  if (!items.length) return <EmptyState text="لا توجد ملاحظات أو إجراءات أصناف محفوظة في هذه الفترة." />;
  return (
    <div className="space-y-2">
      {items.map((row) => (
        <div key={row.id} className="rounded-2xl border bg-white p-3 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="text-right">
              <div className="font-semibold">{row.sessionLabel} • {row.productName}</div>
              <div className="mt-1 text-xs text-neutral-500">{itemIssueActionLabel(row.actionKind)} • {complaintKindLabel(row.issueKind)} • {row.businessDate ?? '--'} • {shiftKindLabel(row.shiftKind)}</div>
              {row.notes ? <div className="mt-2 rounded-xl bg-neutral-50 p-2 text-sm text-neutral-700 whitespace-pre-wrap">{row.notes}</div> : null}
              <div className="mt-2 text-[11px] text-neutral-500">{row.createdByLabel ?? 'غير محدد'} • {formatIssueTime(row.createdAt)}</div>
            </div>
            <div className="shrink-0 rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600">
              {row.status === 'applied' ? 'تم التنفيذ' : row.status === 'dismissed' ? 'مرفوضة' : 'مسجلة'}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function OverviewPanel({
  currentShift,
  period,
  products,
  staff,
}: {
  currentShift?: ReportShiftRow | null;
  period?: PeriodReport | null;
  products: ProductReportRow[];
  staff: StaffPerformanceRow[];
}) {
  const totals = currentShift ?? period?.totals ?? null;
  if (!totals) return <EmptyState text="لا توجد بيانات لهذا العرض." />;
  const topProducts = sortProducts(products).slice(0, 5);
  const topStaff = sortStaff(staff).slice(0, 5);

  return (
    <div className="space-y-3">
      {period ? (
        <div className="rounded-2xl border bg-white p-3 shadow-sm">
          <div className="font-semibold">التجميع اليومي</div>
          <div className="mt-3"><DayBreakdown period={period} /></div>
        </div>
      ) : null}

      {period ? (
        <div className="rounded-2xl border bg-white p-3 shadow-sm">
          <div className="font-semibold">تفصيل الورديات</div>
          <div className="mt-3"><ShiftList items={period.shifts} /></div>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border bg-white p-3 shadow-sm">
          <div className="font-semibold">أعلى المنتجات</div>
          <div className="mt-3">
            <ProductList items={topProducts} />
          </div>
        </div>
        <div className="rounded-2xl border bg-white p-3 shadow-sm">
          <div className="font-semibold">أعلى العاملين</div>
          <div className="mt-3">
            <StaffList items={topStaff} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const session = useAuthz();
  const [tab, setTab] = useState<ReportTab>('current');
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  const loader = useCallback(() => opsClient.reportsWorkspace(), []);
  const { data, loading, error, reload } = useOpsWorkspace<ReportsWorkspace>(loader, { enabled: session.user?.baseRole === 'owner' });
  const selectedPeriod = useMemo(
    () => data && (tab === 'day' || tab === 'week' || tab === 'month' || tab === 'year') ? data.periods[tab] : null,
    [data, tab],
  );

  if (session.user?.baseRole !== 'owner') {
    return <AccessDenied title="التقارير" message="هذه الصفحة للمعلم فقط." />;
  }

  const currentShift = data?.currentShift ?? null;
  const currentProducts = data?.currentProducts ?? [];
  const currentStaff = data?.currentStaff ?? [];
  const currentComplaints = data?.currentComplaints ?? [];
  const currentItemIssues = data?.currentItemIssues ?? [];
  const deferredCustomers = data?.deferredCustomers ?? [];

  const currentTopProduct = currentProducts.length ? (sortProducts(currentProducts)[0] ?? null) : null;
  const currentTopStaff = currentStaff.length ? (sortStaff(currentStaff)[0] ?? null) : null;
  const periodTopProduct = selectedPeriod?.products.length ? (sortProducts(selectedPeriod.products)[0] ?? null) : null;
  const periodTopStaff = selectedPeriod?.staff.length ? (sortStaff(selectedPeriod.staff)[0] ?? null) : null;

  return (
    <MobileShell title="التقارير" backHref="/dashboard">
      {error ? (
        <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="rounded-3xl border bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-semibold">التقارير</div>
            <div className="mt-1 text-xs text-neutral-500">مرجع التقرير: {data?.referenceDate ?? '--'}</div>
          </div>
          <button onClick={() => void reload()} disabled={loading} className="rounded-xl border bg-white px-3 py-2 text-xs disabled:opacity-60">
            {loading ? '...' : 'تحديث'}
          </button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 md:grid-cols-6">
          {[
            { key: 'current', label: 'الوردية الحالية' },
            { key: 'day', label: 'اليوم' },
            { key: 'week', label: 'الأسبوع' },
            { key: 'month', label: 'الشهر' },
            { key: 'year', label: 'السنة' },
            { key: 'deferred', label: 'الآجل' },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => {
                setTab(item.key as ReportTab);
                if (item.key === 'deferred') setDetailTab('overview');
              }}
              className={[
                'rounded-2xl border px-2 py-2 text-xs font-semibold',
                tab === item.key ? 'border-neutral-900 bg-neutral-900 text-white' : 'bg-neutral-50',
              ].join(' ')}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'current' ? (
        <section className="mt-3 space-y-3">
          <TotalsHero
            title="الوردية الحالية"
            subtitle={currentShift ? `${shiftKindLabel(currentShift.kind)} • ${currentShift.businessDate ?? ''}` : 'لا توجد وردية مفتوحة الآن'}
            totals={currentShift ?? {
              shiftCount: 0, submittedQty: 0, readyQty: 0, deliveredQty: 0, replacementDeliveredQty: 0, paidQty: 0, deferredQty: 0,
              remadeQty: 0, cancelledQty: 0, waivedQty: 0, netSales: 0, cashSales: 0, deferredSales: 0, repaymentTotal: 0,
              complaintTotal: 0, complaintOpen: 0, complaintResolved: 0, complaintDismissed: 0, complaintRemake: 0, complaintCancel: 0,
              complaintWaive: 0, itemIssueTotal: 0, itemIssueNote: 0, itemIssueRemake: 0, itemIssueCancel: 0, itemIssueWaive: 0,
              openSessions: 0, closedSessions: 0, totalSessions: 0,
            }}
            leadStatus={currentShift ? (currentShift.status === 'open' ? 'مفتوحة الآن' : 'مقفولة') : 'بدون وردية'}
          />
          <InsightStrip topProduct={currentTopProduct} topStaff={currentTopStaff} totals={currentShift ?? {
            shiftCount: 0, submittedQty: 0, readyQty: 0, deliveredQty: 0, replacementDeliveredQty: 0, paidQty: 0, deferredQty: 0,
            remadeQty: 0, cancelledQty: 0, waivedQty: 0, netSales: 0, cashSales: 0, deferredSales: 0, repaymentTotal: 0,
            complaintTotal: 0, complaintOpen: 0, complaintResolved: 0, complaintDismissed: 0, complaintRemake: 0, complaintCancel: 0,
            complaintWaive: 0, itemIssueTotal: 0, itemIssueNote: 0, itemIssueRemake: 0, itemIssueCancel: 0, itemIssueWaive: 0,
            openSessions: 0, closedSessions: 0, totalSessions: 0,
          }} />
          <DetailTabs value={detailTab} onChange={setDetailTab} />

          {detailTab === 'overview' ? <OverviewPanel currentShift={currentShift} products={currentProducts} staff={currentStaff} /> : null}
          {detailTab === 'products' ? <div className="rounded-2xl border bg-white p-3 shadow-sm"><div className="font-semibold">كل المنتجات</div><div className="mt-3"><ProductList items={currentProducts} /></div></div> : null}
          {detailTab === 'staff' ? <div className="rounded-2xl border bg-white p-3 shadow-sm"><div className="font-semibold">كل العاملين</div><div className="mt-3"><StaffList items={currentStaff} /></div></div> : null}
          {detailTab === 'issues' ? (
            <div className="space-y-3">
              <div className="rounded-2xl border bg-white p-3 shadow-sm"><div className="font-semibold">الشكاوى العامة</div><div className="mt-3"><ComplaintTimeline items={currentComplaints} /></div></div>
              <div className="rounded-2xl border bg-white p-3 shadow-sm"><div className="font-semibold">ملاحظات وإجراءات الأصناف</div><div className="mt-3"><ItemIssueTimeline items={currentItemIssues} /></div></div>
            </div>
          ) : null}
        </section>
      ) : null}

      {selectedPeriod ? (
        <section className="mt-3 space-y-3">
          <TotalsHero
            title={periodLabel(selectedPeriod.key)}
            subtitle={`${selectedPeriod.startDate} ← ${selectedPeriod.endDate}`}
            totals={selectedPeriod.totals}
          />
          <InsightStrip topProduct={periodTopProduct} topStaff={periodTopStaff} totals={selectedPeriod.totals} />
          <DetailTabs value={detailTab} onChange={setDetailTab} />

          {detailTab === 'overview' ? <OverviewPanel period={selectedPeriod} products={selectedPeriod.products} staff={selectedPeriod.staff} /> : null}
          {detailTab === 'products' ? <div className="rounded-2xl border bg-white p-3 shadow-sm"><div className="font-semibold">كل المنتجات في {periodLabel(selectedPeriod.key)}</div><div className="mt-3"><ProductList items={selectedPeriod.products} /></div></div> : null}
          {detailTab === 'staff' ? <div className="rounded-2xl border bg-white p-3 shadow-sm"><div className="font-semibold">كل العاملين في {periodLabel(selectedPeriod.key)}</div><div className="mt-3"><StaffList items={selectedPeriod.staff} /></div></div> : null}
          {detailTab === 'issues' ? (
            <div className="space-y-3">
              <div className="rounded-2xl border bg-white p-3 shadow-sm"><div className="font-semibold">الشكاوى العامة في {periodLabel(selectedPeriod.key)}</div><div className="mt-3"><ComplaintTimeline items={selectedPeriod.complaints} /></div></div>
              <div className="rounded-2xl border bg-white p-3 shadow-sm"><div className="font-semibold">ملاحظات وإجراءات الأصناف في {periodLabel(selectedPeriod.key)}</div><div className="mt-3"><ItemIssueTimeline items={selectedPeriod.itemIssues} /></div></div>
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === 'deferred' ? (
        <section className="mt-3 space-y-3">
          <div className="rounded-3xl border bg-white p-4 shadow-sm">
            <div className="text-lg font-bold">الآجل</div>
            <div className="mt-1 text-xs text-neutral-500">قراءة سريعة لأرصدة العملاء الحالية مرتبة من الأعلى للأقل.</div>
          </div>
          <div className="rounded-2xl border bg-white p-3 shadow-sm"><div className="font-semibold">أرصدة الآجل</div><div className="mt-3"><DeferredList items={deferredCustomers} /></div></div>
        </section>
      ) : null}
    </MobileShell>
  );
}
