'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { MobileShell } from '@/ui/MobileShell';
import { useAuthz } from '@/lib/authz';
import { AccessDenied } from '@/ui/AccessState';
import { opsClient } from '@/lib/ops/client';
import type {
  AddonReportRow,
  DeferredCustomerSummary,
  CustomRangeReport,
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

type ReportTab = 'current' | 'range' | 'deferred';
type RangePreset = 'day' | 'yesterday' | 'last7' | 'month' | 'year' | 'custom';
type DetailTab = 'overview' | 'products' | 'staff' | 'issues';

function formatMoney(value: number) {
  return new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(value ?? 0);
}

function salesHint(totals: ReportTotals) {
  return totals.extrasTotal > 0 ? `+${formatMoney(totals.extrasTotal)} ج ضريبة + خدمة` : undefined;
}

function shiftKindLabel(kind: string) {
  return kind === 'morning' ? 'صباحي' : kind === 'evening' ? 'مسائي' : kind;
}

function periodLabel(key: PeriodReport['key']) {
  return key === 'day' ? 'اليوم' : key === 'week' ? 'الأسبوع' : key === 'month' ? 'الشهر' : 'السنة';
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function shiftIsoDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function rangePresetLabel(value: RangePreset) {
  switch (value) {
    case 'day':
      return 'اليوم';
    case 'yesterday':
      return 'أمس';
    case 'last7':
      return 'آخر 7 أيام';
    case 'month':
      return 'هذا الشهر';
    case 'year':
      return 'هذه السنة';
    default:
      return 'فترة مخصصة';
  }
}

function buildRangeRequest(preset: RangePreset, referenceDate: string, rangeStart: string, rangeEnd: string) {
  switch (preset) {
    case 'day':
    case 'month':
    case 'year':
      return null;
    case 'yesterday':
      return { startDate: shiftIsoDate(referenceDate, -1), endDate: shiftIsoDate(referenceDate, -1) };
    case 'last7':
      return { startDate: shiftIsoDate(referenceDate, -6), endDate: referenceDate };
    case 'custom':
      return rangeStart && rangeEnd ? { startDate: rangeStart, endDate: rangeEnd } : null;
    default:
      return null;
  }
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
  return new Date(value).toLocaleString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });
}

function sortProducts(items: ProductReportRow[]) {
  return [...items].sort(
    (a, b) => (b.netSales - a.netSales) || (b.qtyDelivered - a.qtyDelivered) || a.productName.localeCompare(b.productName, 'ar'),
  );
}

function sortAddons(items: AddonReportRow[]) {
  return [...items].sort(
    (a, b) => (b.netSales - a.netSales) || (b.usageCount - a.usageCount) || a.addonName.localeCompare(b.addonName, 'ar'),
  );
}

function sortStaff(items: StaffPerformanceRow[]) {
  return [...items].sort(
    (a, b) => (b.paymentTotal - a.paymentTotal) || (b.deliveredQty - a.deliveredQty) || a.actorLabel.localeCompare(b.actorLabel, 'ar'),
  );
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
      ? 'border-[#cfe0d7] bg-[#eff7f1]'
      : tone === 'warning'
        ? 'border-[#ecd9bd] bg-[#fcf3e7]'
        : 'border-[#decdb9] bg-[#f8f1e7]';

  return (
    <div className={`rounded-2xl border px-3 py-3 text-center ${toneClass}`}>
      <div className="text-[11px] text-[#8a7763]">{label}</div>
      <div className="mt-1 text-lg font-bold text-[#1e1712]">{value}</div>
      {hint ? <div className="mt-1 text-[11px] text-[#8a7763]">{hint}</div> : null}
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
    <div className="ahwa-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-lg font-bold">{title}</div>
          <div className="mt-1 break-words text-xs text-[#8a7763]">{subtitle}</div>
        </div>
        {leadStatus ? <div className="ahwa-pill-neutral shrink-0">{leadStatus}</div> : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4 2xl:grid-cols-7">
        <MetricCard label="إجمالي البيع" value={`${formatMoney(totals.netSales)} ج`} tone="success" />
        <MetricCard label="الضريبة" value={`${formatMoney(totals.taxTotal)} ج`} />
        <MetricCard label="الخدمة" value={`${formatMoney(totals.serviceTotal)} ج`} />
        <MetricCard label="الإضافات" value={`${formatMoney(totals.addonSales)} ج`} />
        <MetricCard label="الكاش" value={`${formatMoney(totals.cashSales)} ج`} />
        <MetricCard label="الآجل" value={`${formatMoney(totals.deferredSales)} ج`} />
        <MetricCard label="سداد الآجل" value={`${formatMoney(totals.repaymentTotal)} ج`} />
      </div>

      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="الجلسات التشغيلية" value={String(totals.totalSessions)} hint={`مفتوحة ${totals.openSessions} • مغلقة ${totals.closedSessions}`} />
        <MetricCard label="طلبات تم تسليمها" value={String(totals.deliveredQty)} hint={`بدائل مجانية ${totals.replacementDeliveredQty}`} />
        <MetricCard label="طلبات تم تجهيزها" value={String(totals.readyQty)} hint={`بنود محصلة ${totals.paidQty} • بنود آجل ${totals.deferredQty}`} />
        <MetricCard
          label="طلبات أُعيد تجهيزها"
          value={String(totals.remadeQty)}
          tone={totals.remadeQty > 0 ? 'warning' : 'default'}
          hint={`إلغاء ${totals.cancelledQty} • إسقاط ${totals.waivedQty}`}
        />
        <MetricCard
          label="فجوة المطابقة"
          value={`${formatMoney(totals.salesReconciliationGap)} ج`}
          tone={totals.salesReconciliationGap > 0 ? 'warning' : 'default'}
          hint={`شكاوى ${totals.complaintTotal} • أصناف ${totals.itemIssueTotal}`}
        />
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
    topStaff ? `الأعلى تحصيلًا: ${topStaff.actorLabel} (${formatMoney(topStaff.paymentTotal)} ج)` : 'لا يوجد بيع مسجل بعد',
    `الجودة والملاحظات: ${totals.itemIssueNote} • إعادة مجانية: ${totals.remadeQty} • شكاوى عامة مفتوحة: ${totals.complaintOpen}`,
  ];

  return (
    <div className="ahwa-card p-3">
      <div className="mb-2 text-sm font-semibold">قراءة سريعة</div>
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <div key={chip} className="ahwa-pill-neutral max-w-full break-words px-3 py-2 [overflow-wrap:anywhere]">
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
    { key: 'issues', label: 'الجودة والملاحظات' },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 rounded-2xl border bg-[#fffdf9] p-2 shadow-sm md:grid-cols-4">
      {items.map((item) => (
        <button
          key={item.key}
          onClick={() => onChange(item.key)}
          className={[
            'rounded-2xl px-2 py-2 text-xs font-semibold transition whitespace-normal break-words [overflow-wrap:anywhere]',
            value === item.key ? 'bg-[#1e1712] text-white' : 'bg-[#f8f1e7] text-[#5e4d3f]',
          ].join(' ')}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="ahwa-card-dashed p-4 text-sm text-[#8a7763]">{text}</div>;
}

function ProductList({ items }: { items: ProductReportRow[] }) {
  if (!items.length) return <EmptyState text="لا توجد بيانات منتجات ضمن هذه الفترة." />;
  const ranked = sortProducts(items);

  return (
    <div className="space-y-2">
      {ranked.map((row, index) => (
        <div key={row.productId} className="ahwa-card p-3">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0 flex-1 text-right">
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 rounded-full border bg-[#f8f1e7] px-2 py-1 text-[11px] font-semibold text-[#746353]">
                  #{index + 1}
                </span>
                <div className="min-w-0 break-words font-semibold [overflow-wrap:anywhere]">{row.productName}</div>
              </div>
              <div className="mt-1 break-words text-xs text-[#8a7763] [overflow-wrap:anywhere]">
                {row.stationCode} • مسلّم {row.qtyDelivered} • بديل مجاني {row.qtyReplacementDelivered}
              </div>
              <div className="mt-1 break-words text-xs text-[#8a7763] [overflow-wrap:anywhere]">
                إعادة مجانية {row.qtyRemade} • إلغاء {row.qtyCancelled} • إسقاط {row.qtyWaived}
              </div>
            </div>
            <div className="shrink-0 text-left">
              <div className="text-base font-bold">{formatMoney(row.netSales)} ج</div>
              <div className="mt-1 text-xs text-[#8a7763]">إجمالي البيع {formatMoney(row.grossSales)} ج</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function AddonList({ items }: { items: AddonReportRow[] }) {
  if (!items.length) return <EmptyState text="لا توجد إضافات مستخدمة ضمن هذه الفترة." />;
  const ranked = sortAddons(items);

  return (
    <div className="space-y-2">
      {ranked.map((row, index) => (
        <div key={row.addonId} className="ahwa-card p-3">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0 flex-1 text-right">
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 rounded-full border bg-[#f8f1e7] px-2 py-1 text-[11px] font-semibold text-[#746353]">
                  #{index + 1}
                </span>
                <div className="min-w-0 break-words font-semibold [overflow-wrap:anywhere]">{row.addonName}</div>
              </div>
              <div className="mt-1 break-words text-xs text-[#8a7763] [overflow-wrap:anywhere]">
                {row.stationCode} • الاستخدام {row.usageCount} • البنود المرتبطة {row.linkedOrderItems}
              </div>
            </div>
            <div className="shrink-0 text-left">
              <div className="text-base font-bold">{formatMoney(row.netSales)} ج</div>
              <div className="mt-1 text-xs text-[#8a7763]">إجمالي الإضافة {formatMoney(row.grossSales)} ج</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function StaffList({ items }: { items: StaffPerformanceRow[] }) {
  if (!items.length) return <EmptyState text="لا توجد بيانات أداء للفريق ضمن هذه الفترة." />;
  const ranked = sortStaff(items);

  return (
    <div className="space-y-2">
      {ranked.map((row, index) => (
        <div key={row.actorKey} className="ahwa-card p-3">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0 flex-1 text-right">
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 rounded-full border bg-[#f8f1e7] px-2 py-1 text-[11px] font-semibold text-[#746353]">
                  #{index + 1}
                </span>
                <div className="min-w-0 break-words font-semibold [overflow-wrap:anywhere]">{row.actorLabel}</div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-4">
                <MetricCard label="أخذ أوردرات" value={String(row.submittedQty)} />
                <MetricCard label="جهز طلبات" value={String(row.readyQty)} />
                <MetricCard label="سلّم طلبات" value={String(row.deliveredQty)} />
                <MetricCard label="حاسب العملاء" value={`${formatMoney(row.paymentTotal)} ج`} tone="success" />
              </div>

              <div className="mt-2 break-words text-xs text-[#8a7763] [overflow-wrap:anywhere]">
                كاش {formatMoney(row.cashSales)} • آجل {formatMoney(row.deferredSales)} • سداد آجل {formatMoney(row.repaymentTotal)}
              </div>
              <div className="mt-1 break-words text-xs text-[#8a7763] [overflow-wrap:anywhere]">
                بدائل مجانية {row.replacementDeliveredQty} • أُعيد تجهيزها {row.remadeQty} • إلغاء {row.cancelledQty} • إسقاط {row.waivedQty}
              </div>
              <div className="mt-1 break-words text-xs text-[#8a7763] [overflow-wrap:anywhere]">
                شكاوى {row.complaintCount} • ملاحظات أصناف {row.itemIssueCount}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ShiftList({ items }: { items: ReportShiftRow[] }) {
  if (!items.length) return <EmptyState text="لا توجد ورديات مسجلة ضمن هذه الفترة." />;

  return (
    <div className="space-y-2">
      {items.map((row) => (
        <div key={row.shiftId} className="ahwa-card p-3">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0 flex-1 text-right">
              <div className="font-semibold">{shiftKindLabel(row.kind)}</div>
              <div className="mt-1 break-words text-xs text-[#8a7763] [overflow-wrap:anywhere]">{row.businessDate ?? ''}</div>
              <div className="mt-1 break-words text-xs text-[#8a7763] [overflow-wrap:anywhere]">
                {row.status === 'open' ? 'مفتوحة' : 'مقفولة'} • جلسات {row.totalSessions} • شكاوى {row.complaintTotal} • ملاحظات أصناف {row.itemIssueTotal}
              </div>
            </div>
            <div className="shrink-0 text-left">
              <div className="text-base font-bold">{formatMoney(row.netSales)} ج</div>
              <div className="mt-1 text-xs text-[#8a7763]">طلبات سُلّمت {row.deliveredQty} • بدائل مجانية {row.replacementDeliveredQty}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function DayBreakdown({ period }: { period: PeriodReport | CustomRangeReport }) {
  if (!period.days.length) return <EmptyState text="لا يوجد تجميع يومي في هذه الفترة." />;

  return (
    <div className="space-y-2">
      {period.days.map((row) => (
        <div key={row.businessDate} className="ahwa-card p-3">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0 flex-1 text-right">
              <div className="font-semibold">{row.businessDate}</div>
              <div className="mt-1 break-words text-xs text-[#8a7763] [overflow-wrap:anywhere]">
                ورديات {row.shiftCount} • جلسات {row.totalSessions} • شكاوى {row.complaintTotal} • ملاحظات أصناف {row.itemIssueTotal}
              </div>
            </div>
            <div className="shrink-0 text-left">
              <div className="text-base font-bold">{formatMoney(row.netSales)} ج</div>
              <div className="mt-1 text-xs text-[#8a7763]">
                طلبات سُلّمت {row.deliveredQty} • أُعيد تجهيزها {row.remadeQty} • بدائل مجانية {row.replacementDeliveredQty}
              </div>
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
        <div key={row.id} className="ahwa-card p-3">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0 flex-1 text-right">
              <div className="min-w-0 break-words font-semibold [overflow-wrap:anywhere]">{row.debtorName}</div>
              <div className="mt-1 break-words text-xs text-[#8a7763] [overflow-wrap:anywhere]">
                دين {formatMoney(row.debtTotal)} • سداد {formatMoney(row.repaymentTotal)}
              </div>
              <div className="mt-1 break-words text-xs text-[#8a7763] [overflow-wrap:anywhere]">
                آخر حركة: {row.lastEntryAt ? formatIssueTime(row.lastEntryAt) : '—'}
              </div>
            </div>
            <div className="shrink-0 text-left">
              <div className="text-base font-bold">{formatMoney(row.balance)} ج</div>
              <div className="mt-1 text-xs text-[#8a7763]">{row.entryCount} حركة</div>
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
        <div key={row.id} className="ahwa-card p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 text-right">
              <div className="min-w-0 break-words font-semibold [overflow-wrap:anywhere]">{row.sessionLabel}</div>
              <div className="mt-1 break-words text-xs text-[#8a7763] [overflow-wrap:anywhere]">
                {complaintKindLabel(row.complaintKind)} • {row.businessDate ?? '--'} • {shiftKindLabel(row.shiftKind)}
              </div>
              {row.notes ? (
                <div className="mt-2 whitespace-pre-wrap break-words rounded-xl bg-[#f8f1e7] p-2 text-sm text-[#5e4d3f] [overflow-wrap:anywhere]">
                  {row.notes}
                </div>
              ) : null}
              <div className="mt-2 break-words text-[11px] text-[#8a7763] [overflow-wrap:anywhere]">
                {row.createdByLabel ?? 'غير محدد'} • {formatIssueTime(row.createdAt)}
              </div>
            </div>
            <div className="shrink-0 rounded-full border border-[#decdb9] bg-[#fffdf9] px-2 py-1 text-[11px] font-semibold text-[#746353]">
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
        <div key={row.id} className="ahwa-card p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 text-right">
              <div className="min-w-0 break-words font-semibold [overflow-wrap:anywhere]">
                {row.sessionLabel} • {row.productName}
              </div>
              <div className="mt-1 break-words text-xs text-[#8a7763] [overflow-wrap:anywhere]">
                {itemIssueActionLabel(row.actionKind)} • {complaintKindLabel(row.issueKind)} • {row.businessDate ?? '--'} • {shiftKindLabel(row.shiftKind)}
              </div>
              {row.notes ? (
                <div className="mt-2 whitespace-pre-wrap break-words rounded-xl bg-[#f8f1e7] p-2 text-sm text-[#5e4d3f] [overflow-wrap:anywhere]">
                  {row.notes}
                </div>
              ) : null}
              <div className="mt-2 break-words text-[11px] text-[#8a7763] [overflow-wrap:anywhere]">
                {row.createdByLabel ?? 'غير محدد'} • {formatIssueTime(row.createdAt)}
              </div>
            </div>
            <div className="shrink-0 rounded-full border border-[#decdb9] bg-[#fffdf9] px-2 py-1 text-[11px] font-semibold text-[#746353]">
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
  addons,
  staff,
}: {
  currentShift?: ReportShiftRow | null;
  period?: PeriodReport | CustomRangeReport | null;
  products: ProductReportRow[];
  addons: AddonReportRow[];
  staff: StaffPerformanceRow[];
}) {
  const totals = currentShift ?? period?.totals ?? null;
  if (!totals) return <EmptyState text="لا توجد بيانات لهذا العرض." />;

  const topProducts = sortProducts(products).slice(0, 5);
  const topAddons = sortAddons(addons).slice(0, 5);
  const topStaff = sortStaff(staff).slice(0, 5);

  return (
    <div className="space-y-3">
      {period ? (
        <div className="ahwa-card p-3">
          <div className="font-semibold">التجميع اليومي</div>
          <div className="mt-3">
            <DayBreakdown period={period} />
          </div>
        </div>
      ) : null}

      {period ? (
        <div className="ahwa-card p-3">
          <div className="font-semibold">تفصيل الورديات</div>
          <div className="mt-3">
            <ShiftList items={period.shifts} />
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-3">
        <div className="ahwa-card p-3">
          <div className="font-semibold">أعلى المنتجات</div>
          <div className="mt-3">
            <ProductList items={topProducts} />
          </div>
        </div>
        <div className="ahwa-card p-3">
          <div className="font-semibold">أعلى الإضافات</div>
          <div className="mt-3">
            <AddonList items={topAddons} />
          </div>
        </div>
        <div className="ahwa-card p-3 xl:col-span-2 2xl:col-span-1">
          <div className="font-semibold">أعلى العاملين</div>
          <div className="mt-3">
            <StaffList items={topStaff} />
          </div>
        </div>
      </div>
    </div>
  );
}

const EMPTY_TOTALS: ReportTotals = {
  shiftCount: 0,
  submittedQty: 0,
  readyQty: 0,
  deliveredQty: 0,
  replacementDeliveredQty: 0,
  paidQty: 0,
  deferredQty: 0,
  remadeQty: 0,
  cancelledQty: 0,
  waivedQty: 0,
  netSales: 0,
  itemNetSales: 0,
  recognizedSales: 0,
  salesReconciliationGap: 0,
  cashSales: 0,
  deferredSales: 0,
  addonSales: 0,
  taxTotal: 0,
  serviceTotal: 0,
  extrasTotal: 0,
  repaymentTotal: 0,
  complaintTotal: 0,
  complaintOpen: 0,
  complaintResolved: 0,
  complaintDismissed: 0,
  complaintRemake: 0,
  complaintCancel: 0,
  complaintWaive: 0,
  itemIssueTotal: 0,
  itemIssueNote: 0,
  itemIssueRemake: 0,
  itemIssueCancel: 0,
  itemIssueWaive: 0,
  openSessions: 0,
  closedSessions: 0,
  totalSessions: 0,
};

export default function ReportsPage() {
  const session = useAuthz();
  const [tab, setTab] = useState<ReportTab>('current');
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  const [rangePreset, setRangePreset] = useState<RangePreset>('day');
  const [rangeStart, setRangeStart] = useState(todayIsoDate());
  const [rangeEnd, setRangeEnd] = useState(todayIsoDate());
  const referenceDateSeed = todayIsoDate();
  const initialRangeRequest = buildRangeRequest(rangePreset, referenceDateSeed, rangeStart, rangeEnd);
  const loader = useCallback(
    () => opsClient.reportsWorkspace(initialRangeRequest ?? undefined),
    [initialRangeRequest?.endDate, initialRangeRequest?.startDate],
  );
  const { data, loading, error, reload } = useOpsWorkspace<ReportsWorkspace>(loader, {
    enabled: session.user?.baseRole === 'owner',
    cacheKey: `workspace:reports:${initialRangeRequest?.startDate ?? ''}:${initialRangeRequest?.endDate ?? ''}`,
    staleTimeMs: 60_000,
  });

  const isBranchManager = session.user?.ownerLabel === 'branch_manager';
  const safeTab: ReportTab = isBranchManager ? (tab === 'deferred' ? 'current' : tab) : tab;
  const effectiveReferenceDate = data?.referenceDate ?? referenceDateSeed;
  const effectiveRangeRequest = buildRangeRequest(rangePreset, effectiveReferenceDate, rangeStart, rangeEnd);
  const selectedPeriod = useMemo<PeriodReport | CustomRangeReport | null>(() => {
    if (!data || safeTab !== 'range') return null;
    if (rangePreset === 'day') return data.periods.day;
    if (rangePreset === 'month') return data.periods.month;
    if (rangePreset === 'year') return data.periods.year;
    return data.customRange;
  }, [data, rangePreset, safeTab]);

  if (session.user?.baseRole !== 'owner') {
    return <AccessDenied title="التقارير" message="هذه الصفحة للإدارة فقط." />;
  }

  const currentShift = data?.currentShift ?? null;
  const currentProducts = data?.currentProducts ?? [];
  const currentAddons = data?.currentAddons ?? [];
  const currentStaff = data?.currentStaff ?? [];
  const currentComplaints = data?.currentComplaints ?? [];
  const currentItemIssues = data?.currentItemIssues ?? [];
  const deferredCustomers = data?.deferredCustomers ?? [];

  const currentTopProduct = currentProducts.length ? (sortProducts(currentProducts)[0] ?? null) : null;
  const currentTopStaff = currentStaff.length ? (sortStaff(currentStaff)[0] ?? null) : null;
  const periodTopProduct = selectedPeriod?.products.length ? (sortProducts(selectedPeriod.products)[0] ?? null) : null;
  const periodTopStaff = selectedPeriod?.staff.length ? (sortStaff(selectedPeriod.staff)[0] ?? null) : null;

  const exportHref = safeTab === 'deferred'
    ? '/customers/print'
    : safeTab === 'range' && effectiveRangeRequest
      ? `/reports/print?tab=range&startDate=${effectiveRangeRequest.startDate}&endDate=${effectiveRangeRequest.endDate}`
      : safeTab === 'range'
        ? `/reports/print?tab=${rangePreset === 'month' ? 'month' : rangePreset === 'year' ? 'year' : 'day'}`
        : `/reports/print?tab=${safeTab}`;

  const rangePresets: { key: RangePreset; label: string }[] = [
    { key: 'day', label: 'اليوم' },
    { key: 'yesterday', label: 'أمس' },
    { key: 'last7', label: 'آخر 7 أيام' },
    { key: 'month', label: 'هذا الشهر' },
    { key: 'year', label: 'هذه السنة' },
    { key: 'custom', label: 'فترة مخصصة' },
  ];

  return (
    <MobileShell title="التقارير" backHref="/dashboard" desktopMode="wide">
      {error ? <div className="mb-3 ahwa-alert-danger p-3 text-sm">{error}</div> : null}

      <div className="rounded-3xl border bg-[#fffdf9] p-3 shadow-sm">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold">التقارير</div>
            <div className="mt-1 text-xs text-[#8a7763]">مرجع التقرير: {data?.referenceDate ?? '--'}</div>
          </div>

          <div className="flex items-center gap-2">
            <Link href={exportHref} className="rounded-xl border bg-[#fffdf9] px-3 py-2 text-xs font-semibold text-[#5e4d3f]">
              تصدير PDF
            </Link>
            <button onClick={() => void reload()} disabled={loading} className="rounded-xl border bg-[#fffdf9] px-3 py-2 text-xs disabled:opacity-60">
              {loading ? '...' : 'تحديث'}
            </button>
          </div>
        </div>

        <div className={`mt-3 grid gap-2 ${isBranchManager ? 'grid-cols-2' : 'grid-cols-3'}`}>
          {[
            { key: 'current', label: 'الوردية الحالية' },
            { key: 'range', label: 'التاريخ' },
            ...(!isBranchManager ? [{ key: 'deferred', label: 'الآجل' }] : []),
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => {
                setTab(item.key as ReportTab);
                if (item.key === 'deferred') setDetailTab('overview');
              }}
              className={[
                'rounded-2xl border px-2 py-2 text-xs font-semibold whitespace-normal break-words [overflow-wrap:anywhere]',
                safeTab === item.key ? 'border-neutral-900 bg-[#1e1712] text-white' : 'bg-[#f8f1e7]',
              ].join(' ')}
            >
              {item.label}
            </button>
          ))}
        </div>

        {safeTab === 'range' ? (
          <div className="mt-3 space-y-3 rounded-2xl border border-[#eadfce] bg-[#f8f1e7] p-3">
            <div className="text-sm font-semibold text-[#2f241b]">فلتر التاريخ</div>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
              {rangePresets.map((item) => (
                <button
                  key={item.key}
                  onClick={() => setRangePreset(item.key)}
                  className={[
                    'rounded-2xl border px-2 py-2 text-xs font-semibold',
                    rangePreset === item.key ? 'border-neutral-900 bg-[#1e1712] text-white' : 'bg-white text-[#5e4d3f]',
                  ].join(' ')}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <label className="rounded-2xl border bg-white p-3 text-xs text-[#5e4d3f]">
                <div className="mb-2 font-semibold">من تاريخ</div>
                <input type="date" value={rangeStart} onChange={(event) => setRangeStart(event.target.value)} className="w-full rounded-xl border px-3 py-2 text-sm" />
              </label>
              <label className="rounded-2xl border bg-white p-3 text-xs text-[#5e4d3f]">
                <div className="mb-2 font-semibold">إلى تاريخ</div>
                <input type="date" value={rangeEnd} onChange={(event) => setRangeEnd(event.target.value)} className="w-full rounded-xl border px-3 py-2 text-sm" />
              </label>
            </div>
            <div className="text-xs text-[#8a7763]">
              {effectiveRangeRequest
                ? `الفترة المختارة: ${effectiveRangeRequest.startDate} ← ${effectiveRangeRequest.endDate}`
                : `العرض الحالي: ${rangePresetLabel(rangePreset)}`}
            </div>
          </div>
        ) : null}
      </div>

      {safeTab === 'current' ? (
        <section className="mt-3 space-y-3">
          <TotalsHero
            title="الوردية الحالية"
            subtitle={currentShift ? `${shiftKindLabel(currentShift.kind)} • ${currentShift.businessDate ?? ''}` : 'لا توجد وردية مفتوحة الآن'}
            totals={currentShift ?? EMPTY_TOTALS}
            leadStatus={currentShift ? (currentShift.status === 'open' ? 'مفتوحة الآن' : 'مقفولة') : 'بدون وردية'}
          />
          <InsightStrip topProduct={currentTopProduct} topStaff={currentTopStaff} totals={currentShift ?? EMPTY_TOTALS} />
          <DetailTabs value={detailTab} onChange={setDetailTab} />
          {detailTab === 'overview' ? <OverviewPanel currentShift={currentShift} products={currentProducts} addons={currentAddons} staff={currentStaff} /> : null}
          {detailTab === 'products' ? (
            <div className="space-y-3">
              <div className="ahwa-card p-3"><div className="font-semibold">كل المنتجات</div><div className="mt-3"><ProductList items={currentProducts} /></div></div>
              <div className="ahwa-card p-3"><div className="font-semibold">كل الإضافات</div><div className="mt-3"><AddonList items={currentAddons} /></div></div>
            </div>
          ) : null}
          {detailTab === 'staff' ? <div className="ahwa-card p-3"><div className="font-semibold">كل العاملين</div><div className="mt-3"><StaffList items={currentStaff} /></div></div> : null}
          {detailTab === 'issues' ? (
            <div className="space-y-3">
              <div className="ahwa-card p-3"><div className="font-semibold">الشكاوى العامة</div><div className="mt-3"><ComplaintTimeline items={currentComplaints} /></div></div>
              <div className="ahwa-card p-3"><div className="font-semibold">ملاحظات وإجراءات الأصناف</div><div className="mt-3"><ItemIssueTimeline items={currentItemIssues} /></div></div>
            </div>
          ) : null}
        </section>
      ) : null}

      {safeTab === 'range' && selectedPeriod ? (
        <section className="mt-3 space-y-3">
          <TotalsHero
            title={selectedPeriod.key === 'range' ? rangePresetLabel(rangePreset) : periodLabel(selectedPeriod.key)}
            subtitle={`${selectedPeriod.startDate} ← ${selectedPeriod.endDate}`}
            totals={selectedPeriod.totals}
          />
          <InsightStrip topProduct={periodTopProduct} topStaff={periodTopStaff} totals={selectedPeriod.totals} />
          <DetailTabs value={detailTab} onChange={setDetailTab} />
          {detailTab === 'overview' ? <OverviewPanel period={selectedPeriod} products={selectedPeriod.products} addons={selectedPeriod.addons} staff={selectedPeriod.staff} /> : null}
          {detailTab === 'products' ? (
            <div className="space-y-3">
              <div className="ahwa-card p-3"><div className="font-semibold">كل المنتجات</div><div className="mt-3"><ProductList items={selectedPeriod.products} /></div></div>
              <div className="ahwa-card p-3"><div className="font-semibold">كل الإضافات</div><div className="mt-3"><AddonList items={selectedPeriod.addons} /></div></div>
            </div>
          ) : null}
          {detailTab === 'staff' ? <div className="ahwa-card p-3"><div className="font-semibold">كل العاملين</div><div className="mt-3"><StaffList items={selectedPeriod.staff} /></div></div> : null}
          {detailTab === 'issues' ? (
            <div className="space-y-3">
              <div className="ahwa-card p-3"><div className="font-semibold">الشكاوى العامة</div><div className="mt-3"><ComplaintTimeline items={selectedPeriod.complaints} /></div></div>
              <div className="ahwa-card p-3"><div className="font-semibold">ملاحظات وإجراءات الأصناف</div><div className="mt-3"><ItemIssueTimeline items={selectedPeriod.itemIssues} /></div></div>
            </div>
          ) : null}
        </section>
      ) : null}

      {safeTab === 'deferred' ? (
        <section className="mt-3 space-y-3">
          <div className="ahwa-card p-4">
            <div className="text-lg font-bold">الآجل</div>
            <div className="mt-1 text-xs text-[#8a7763]">قراءة سريعة لأرصدة العملاء الحالية مرتبة من الأعلى للأقل.</div>
          </div>
          <div className="ahwa-card p-3">
            <div className="font-semibold">أرصدة الآجل</div>
            <div className="mt-3"><DeferredList items={deferredCustomers} /></div>
          </div>
        </section>
      ) : null}
    </MobileShell>
  );
}

