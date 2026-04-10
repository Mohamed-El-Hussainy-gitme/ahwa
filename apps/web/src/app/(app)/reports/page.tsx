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

function salesHint(totals: ReportTotals) {
  return totals.extrasTotal > 0 ? `+${formatMoney(totals.extrasTotal)} ج ضريبة + خدمة` : undefined;
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
    <div className={`min-w-0 overflow-hidden rounded-2xl border px-3 py-3 text-center ${toneClass}`}>
      <div className="min-w-0 break-words text-[11px] text-[#8a7763] [overflow-wrap:anywhere]">{label}</div>
      <div className="mt-1 min-w-0 break-words text-lg font-bold text-[#1e1712] [overflow-wrap:anywhere]">{value}</div>
      {hint ? (
        <div className="mt-1 min-w-0 break-words text-[11px] text-[#8a7763] [overflow-wrap:anywhere]">
          {hint}
        </div>
      ) : null}
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
    <div className="ahwa-card min-w-0 overflow-hidden p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="min-w-0 break-words text-lg font-bold [overflow-wrap:anywhere]">{title}</div>
          <div className="mt-1 min-w-0 break-words text-xs text-[#8a7763] [overflow-wrap:anywhere]">{subtitle}</div>
        </div>
        {leadStatus ? <div className="ahwa-pill-neutral shrink-0">{leadStatus}</div> : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <MetricCard label="إجمالي البيع" value={`${formatMoney(totals.netSales)} ج`} tone="success" hint={salesHint(totals)} />
        <MetricCard label="الكاش" value={`${formatMoney(totals.cashSales)} ج`} />
        <MetricCard label="الآجل المرحل" value={`${formatMoney(totals.deferredSales)} ج`} />
        <MetricCard label="سداد الآجل" value={`${formatMoney(totals.repaymentTotal)} ج`} />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-5">
        <MetricCard
          label="الجلسات"
          value={String(totals.totalSessions)}
          hint={`مفتوحة ${totals.openSessions} • مغلقة ${totals.closedSessions}`}
        />
        <MetricCard
          label="البنود المسلّمة"
          value={String(totals.deliveredQty)}
          hint={`بديل مجاني ${totals.replacementDeliveredQty}`}
        />
        <MetricCard
          label="الجاهز"
          value={String(totals.readyQty)}
          hint={`المدفوع ${totals.paidQty} • الآجل ${totals.deferredQty}`}
        />
        <MetricCard
          label="إعادة مجانية"
          value={String(totals.remadeQty)}
          tone={totals.remadeQty > 0 ? 'warning' : 'default'}
          hint={`إلغاء ${totals.cancelledQty} • إسقاط ${totals.waivedQty}`}
        />
        <MetricCard
          label="الجودة والملاحظات والشكاوى"
          value={String(totals.complaintTotal + totals.itemIssueTotal)}
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
    topStaff ? `الأعلى بيعًا: ${topStaff.actorLabel} (${formatMoney(topStaff.paymentTotal)} ج)` : 'لا يوجد بيع مسجل بعد',
    `الجودة والملاحظات: ${totals.itemIssueNote} • إعادة مجانية: ${totals.remadeQty} • شكاوى عامة مفتوحة: ${totals.complaintOpen}`,
  ];

  return (
    <div className="ahwa-card min-w-0 overflow-hidden p-3">
      <div className="mb-2 text-sm font-semibold">قراءة سريعة</div>
      <div className="flex min-w-0 flex-wrap gap-2">
        {chips.map((chip) => (
          <div key={chip} className="ahwa-pill-neutral min-w-0 max-w-full break-words px-3 py-2 [overflow-wrap:anywhere]">
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
    <div className="grid grid-cols-4 gap-2 rounded-2xl border bg-[#fffdf9] p-2 shadow-sm">
      {items.map((item) => (
        <button
          key={item.key}
          onClick={() => onChange(item.key)}
          className={[
            'rounded-2xl px-2 py-2 text-xs font-semibold transition',
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
  return <div className="ahwa-card-dashed min-w-0 overflow-hidden p-4 text-sm text-[#8a7763]">{text}</div>;
}

function ProductList({ items }: { items: ProductReportRow[] }) {
  if (!items.length) return <EmptyState text="لا توجد بيانات منتجات ضمن هذه الفترة." />;
  const ranked = sortProducts(items);

  return (
    <div className="space-y-2">
      {ranked.map((row, index) => (
        <div key={row.productId} className="ahwa-card min-w-0 overflow-hidden p-3">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="min-w-0 flex-1 text-right">
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 rounded-full border bg-[#f8f1e7] px-2 py-1 text-[11px] font-semibold text-[#746353]">
                  #{index + 1}
                </span>
                <div className="min-w-0 break-words font-semibold [overflow-wrap:anywhere]">{row.productName}</div>
              </div>
              <div className="mt-1 min-w-0 break-words text-xs text-[#8a7763] [overflow-wrap:anywhere]">
                {row.stationCode} • مسلّم {row.qtyDelivered} • بديل مجاني {row.qtyReplacementDelivered}
              </div>
              <div className="mt-1 min-w-0 break-words text-xs text-[#8a7763] [overflow-wrap:anywhere]">
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
        <div key={row.addonId} className="ahwa-card min-w-0 overflow-hidden p-3">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="min-w-0 flex-1 text-right">
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 rounded-full border bg-[#f8f1e7] px-2 py-1 text-[11px] font-semibold text-[#746353]">
                  #{index + 1}
                </span>
                <div className="min-w-0 break-words font-semibold [overflow-wrap:anywhere]">{row.addonName}</div>
              </div>
              <div className="mt-1 min-w-0 break-words text-xs text-[#8a7763] [overflow-wrap:anywhere]">
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
        <div key={row.actorKey} className="ahwa-card min-w-0 overflow-hidden p-3">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="min-w-0 flex-1 text-right">
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 rounded-full border bg-[#f8f1e7] px-2 py-1 text-[11px] font-semibold text-[#746353]">
                  #{index + 1}
                </span>
                <div className="min-w-0 break-words font-semibold [overflow-wrap:anywhere]">{row.actorLabel}</div>
              </div>
              <div className="mt-1 min-w-0 break-words text-xs text-[#8a7763] [overflow-wrap:anywhere]">
                تسليم {row.deliveredQty} • بدائل مجانية {row.replacementDeliveredQty} • تجهيز {row.readyQty}
              </div>
              <div className="mt-1 min-w-0 break-words text-xs text-[#8a7763] [overflow-wrap:anywhere]">
                إعادة مجانية {row.remadeQty} • إلغاء {row.cancelledQty} • شكاوى {row.complaintCount} • ملاحظات أصناف {row.itemIssueCount}
              </div>
            </div>
            <div className="shrink-0 text-left">
              <div className="text-base font-bold">{formatMoney(row.paymentTotal)} ج</div>
              <div className="mt-1 text-xs text-[#8a7763]">
                كاش {formatMoney(row.cashSales)} • آجل {formatMoney(row.deferredSales)} • سداد {formatMoney(row.repaymentTotal)}
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
        <div key={row.shiftId} className="ahwa-card min-w-0 overflow-hidden p-3">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="min-w-0 flex-1 text-right">
              <div className="min-w-0 break-words font-semibold [overflow-wrap:anywhere]">{shiftKindLabel(row.kind)}</div>
              <div className="mt-1 min-w-0 break-words text-xs text-[#8a7763] [overflow-wrap:anywhere]">{row.businessDate ?? ''}</div>
              <div className="mt-1 min-w-0 break-words text-xs text-[#8a7763] [overflow-wrap:anywhere]">
                {row.status === 'open' ? 'مفتوحة' : 'مقفولة'} • جلسات {row.totalSessions} • شكاوى {row.complaintTotal} • ملاحظات أصناف {row.itemIssueTotal}
              </div>
            </div>
            <div className="shrink-0 text-left">
              <div className="text-base font-bold">{formatMoney(row.netSales)} ج</div>
              <div className="mt-1 text-xs text-[#8a7763]">مسلّم {row.deliveredQty} • بدائل مجانية {row.replacementDeliveredQty}</div>
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
        <div key={row.businessDate} className="ahwa-card min-w-0 overflow-hidden p-3">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="min-w-0 flex-1 text-right">
              <div className="min-w-0 break-words font-semibold [overflow-wrap:anywhere]">{row.businessDate}</div>
              <div className="mt-1 min-w-0 break-words text-xs text-[#8a7763] [overflow-wrap:anywhere]">
                ورديات {row.shiftCount} • جلسات {row.totalSessions} • شكاوى {row.complaintTotal} • ملاحظات أصناف {row.itemIssueTotal}
              </div>
            </div>
            <div className="shrink-0 text-left">
              <div className="text-base font-bold">{formatMoney(row.netSales)} ج</div>
              <div className="mt-1 text-xs text-[#8a7763]">
                مسلّم {row.deliveredQty} • إعادات مجانية {row.remadeQty} • بدائل مجانية {row.replacementDeliveredQty}
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
        <div key={row.id} className="ahwa-card min-w-0 overflow-hidden p-3">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="min-w-0 flex-1 text-right">
              <div className="min-w-0 break-words font-semibold [overflow-wrap:anywhere]">{row.debtorName}</div>
              <div className="mt-1 min-w-0 break-words text-xs text-[#8a7763] [overflow-wrap:anywhere]">
                دين {formatMoney(row.debtTotal)} • سداد {formatMoney(row.repaymentTotal)}
              </div>
              <div className="mt-1 min-w-0 break-words text-xs text-[#8a7763] [overflow-wrap:anywhere]">
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
        <div key={row.id} className="ahwa-card min-w-0 overflow-hidden p-3">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0 flex-1 text-right">
              <div className="min-w-0 break-words font-semibold [overflow-wrap:anywhere]">{row.sessionLabel}</div>
              <div className="mt-1 min-w-0 break-words text-xs text-[#8a7763] [overflow-wrap:anywhere]">
                {complaintKindLabel(row.complaintKind)} • {row.businessDate ?? '--'} • {shiftKindLabel(row.shiftKind)}
              </div>
              {row.notes ? (
                <div className="mt-2 min-w-0 whitespace-pre-wrap break-words rounded-xl bg-[#f8f1e7] p-2 text-sm text-[#5e4d3f] [overflow-wrap:anywhere]">
                  {row.notes}
                </div>
              ) : null}
              <div className="mt-2 min-w-0 break-words text-[11px] text-[#8a7763] [overflow-wrap:anywhere]">
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
        <div key={row.id} className="ahwa-card min-w-0 overflow-hidden p-3">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0 flex-1 text-right">
              <div className="min-w-0 break-words font-semibold [overflow-wrap:anywhere]">
                {row.sessionLabel} • {row.productName}
              </div>
              <div className="mt-1 min-w-0 break-words text-xs text-[#8a7763] [overflow-wrap:anywhere]">
                {itemIssueActionLabel(row.actionKind)} • {complaintKindLabel(row.issueKind)} • {row.businessDate ?? '--'} • {shiftKindLabel(row.shiftKind)}
              </div>
              {row.notes ? (
                <div className="mt-2 min-w-0 whitespace-pre-wrap break-words rounded-xl bg-[#f8f1e7] p-2 text-sm text-[#5e4d3f] [overflow-wrap:anywhere]">
                  {row.notes}
                </div>
              ) : null}
              <div className="mt-2 min-w-0 break-words text-[11px] text-[#8a7763] [overflow-wrap:anywhere]">
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
  period?: PeriodReport | null;
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
        <div className="ahwa-card min-w-0 overflow-hidden p-3">
          <div className="font-semibold">التجميع اليومي</div>
          <div className="mt-3 min-w-0">
            <DayBreakdown period={period} />
          </div>
        </div>
      ) : null}

      {period ? (
        <div className="ahwa-card min-w-0 overflow-hidden p-3">
          <div className="font-semibold">تفصيل الورديات</div>
          <div className="mt-3 min-w-0">
            <ShiftList items={period.shifts} />
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 2xl:grid-cols-3">
        <div className="ahwa-card min-w-0 overflow-hidden p-3">
          <div className="font-semibold">أعلى المنتجات</div>
          <div className="mt-3 min-w-0">
            <ProductList items={topProducts} />
          </div>
        </div>
        <div className="ahwa-card min-w-0 overflow-hidden p-3">
          <div className="font-semibold">أعلى الإضافات</div>
          <div className="mt-3 min-w-0">
            <AddonList items={topAddons} />
          </div>
        </div>
        <div className="ahwa-card min-w-0 overflow-hidden p-3">
          <div className="font-semibold">أعلى العاملين</div>
          <div className="mt-3 min-w-0">
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
  const loader = useCallback(() => opsClient.reportsWorkspace(), []);
  const { data, loading, error, reload } = useOpsWorkspace<ReportsWorkspace>(loader, {
    enabled: session.user?.baseRole === 'owner',
    cacheKey: 'workspace:reports',
    staleTimeMs: 60_000,
  });

  const isBranchManager = session.user?.ownerLabel === 'branch_manager';
  const allowedManagerTabs: ReportTab[] = ['current', 'day', 'week'];
  const safeTab: ReportTab = isBranchManager ? (allowedManagerTabs.includes(tab) ? tab : 'current') : tab;

  const selectedPeriod = useMemo(
    () => data && (safeTab === 'day' || safeTab === 'week' || safeTab === 'month' || safeTab === 'year') ? data.periods[safeTab] : null,
    [data, safeTab],
  );

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

  return (
    <MobileShell title="التقارير" backHref="/dashboard">
      {error ? <div className="mb-3 ahwa-alert-danger p-3 text-sm">{error}</div> : null}

      <div className="rounded-3xl border bg-[#fffdf9] p-3 shadow-sm">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="font-semibold">التقارير</div>
            <div className="mt-1 text-xs text-[#8a7763]">مرجع التقرير: {data?.referenceDate ?? '--'}</div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={safeTab === 'deferred' ? '/customers/print' : `/reports/print?tab=${safeTab}`}
              className="rounded-xl border bg-[#fffdf9] px-3 py-2 text-xs font-semibold text-[#5e4d3f]"
            >
              تصدير PDF
            </Link>
            <button
              onClick={() => void reload()}
              disabled={loading}
              className="rounded-xl border bg-[#fffdf9] px-3 py-2 text-xs disabled:opacity-60"
            >
              {loading ? '...' : 'تحديث'}
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 md:grid-cols-6">
          {(isBranchManager
            ? [
                { key: 'current', label: 'الوردية الحالية' },
                { key: 'day', label: 'اليوم' },
                { key: 'week', label: 'الأسبوع' },
              ]
            : [
                { key: 'current', label: 'الوردية الحالية' },
                { key: 'day', label: 'اليوم' },
                { key: 'week', label: 'الأسبوع' },
                { key: 'month', label: 'الشهر' },
                { key: 'year', label: 'السنة' },
                { key: 'deferred', label: 'الآجل' },
              ]).map((item) => (
            <button
              key={item.key}
              onClick={() => {
                setTab(item.key as ReportTab);
                if (item.key === 'deferred') setDetailTab('overview');
              }}
              className={[
                'rounded-2xl border px-2 py-2 text-xs font-semibold',
                safeTab === item.key ? 'border-neutral-900 bg-[#1e1712] text-white' : 'bg-[#f8f1e7]',
              ].join(' ')}
            >
              {item.label}
            </button>
          ))}
        </div>
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

          {detailTab === 'overview' ? (
            <OverviewPanel currentShift={currentShift} products={currentProducts} addons={currentAddons} staff={currentStaff} />
          ) : null}

          {detailTab === 'products' ? (
            <div className="space-y-3">
              <div className="ahwa-card min-w-0 overflow-hidden p-3">
                <div className="font-semibold">كل المنتجات</div>
                <div className="mt-3 min-w-0">
                  <ProductList items={currentProducts} />
                </div>
              </div>
              <div className="ahwa-card min-w-0 overflow-hidden p-3">
                <div className="font-semibold">كل الإضافات</div>
                <div className="mt-3 min-w-0">
                  <AddonList items={currentAddons} />
                </div>
              </div>
            </div>
          ) : null}

          {detailTab === 'staff' ? (
            <div className="ahwa-card min-w-0 overflow-hidden p-3">
              <div className="font-semibold">كل العاملين</div>
              <div className="mt-3 min-w-0">
                <StaffList items={currentStaff} />
              </div>
            </div>
          ) : null}

          {detailTab === 'issues' ? (
            <div className="space-y-3">
              <div className="ahwa-card min-w-0 overflow-hidden p-3">
                <div className="font-semibold">الشكاوى العامة</div>
                <div className="mt-3 min-w-0">
                  <ComplaintTimeline items={currentComplaints} />
                </div>
              </div>
              <div className="ahwa-card min-w-0 overflow-hidden p-3">
                <div className="font-semibold">ملاحظات وإجراءات الأصناف</div>
                <div className="mt-3 min-w-0">
                  <ItemIssueTimeline items={currentItemIssues} />
                </div>
              </div>
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

          {detailTab === 'overview' ? (
            <OverviewPanel period={selectedPeriod} products={selectedPeriod.products} addons={selectedPeriod.addons} staff={selectedPeriod.staff} />
          ) : null}

          {detailTab === 'products' ? (
            <div className="space-y-3">
              <div className="ahwa-card min-w-0 overflow-hidden p-3">
                <div className="font-semibold">كل المنتجات في {periodLabel(selectedPeriod.key)}</div>
                <div className="mt-3 min-w-0">
                  <ProductList items={selectedPeriod.products} />
                </div>
              </div>
              <div className="ahwa-card min-w-0 overflow-hidden p-3">
                <div className="font-semibold">كل الإضافات في {periodLabel(selectedPeriod.key)}</div>
                <div className="mt-3 min-w-0">
                  <AddonList items={selectedPeriod.addons} />
                </div>
              </div>
            </div>
          ) : null}

          {detailTab === 'staff' ? (
            <div className="ahwa-card min-w-0 overflow-hidden p-3">
              <div className="font-semibold">كل العاملين في {periodLabel(selectedPeriod.key)}</div>
              <div className="mt-3 min-w-0">
                <StaffList items={selectedPeriod.staff} />
              </div>
            </div>
          ) : null}

          {detailTab === 'issues' ? (
            <div className="space-y-3">
              <div className="ahwa-card min-w-0 overflow-hidden p-3">
                <div className="font-semibold">الشكاوى العامة في {periodLabel(selectedPeriod.key)}</div>
                <div className="mt-3 min-w-0">
                  <ComplaintTimeline items={selectedPeriod.complaints} />
                </div>
              </div>
              <div className="ahwa-card min-w-0 overflow-hidden p-3">
                <div className="font-semibold">ملاحظات وإجراءات الأصناف في {periodLabel(selectedPeriod.key)}</div>
                <div className="mt-3 min-w-0">
                  <ItemIssueTimeline items={selectedPeriod.itemIssues} />
                </div>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {safeTab === 'deferred' ? (
        <section className="mt-3 space-y-3">
          <div className="ahwa-card min-w-0 overflow-hidden p-4">
            <div className="text-lg font-bold">الآجل</div>
            <div className="mt-1 text-xs text-[#8a7763]">قراءة سريعة لأرصدة العملاء الحالية مرتبة من الأعلى للأقل.</div>
          </div>
          <div className="ahwa-card min-w-0 overflow-hidden p-3">
            <div className="font-semibold">أرصدة الآجل</div>
            <div className="mt-3 min-w-0">
              <DeferredList items={deferredCustomers} />
            </div>
          </div>
        </section>
      ) : null}
    </MobileShell>
  );
}