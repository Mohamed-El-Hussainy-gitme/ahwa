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
  ReportsWorkspace,
  ReportShiftRow,
  ReportTotals,
  StaffPerformanceRow,
} from '@/lib/ops/types';
import { useOpsWorkspace } from '@/lib/ops/hooks';

type ReportTab = 'current' | 'day' | 'week' | 'month' | 'year' | 'deferred';

function formatMoney(value: number) {
  return new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(value ?? 0);
}
function shiftKindLabel(kind: string) {
  return kind === 'morning' ? 'صباحي' : kind === 'evening' ? 'مسائي' : kind;
}
function periodLabel(key: PeriodReport['key']) {
  return key === 'day' ? 'اليوم' : key === 'week' ? 'الأسبوع' : key === 'month' ? 'الشهر' : 'السنة';
}

function TotalsGrid({ totals }: { totals: ReportTotals }) {
  const cards = [
    ['صافي المبيعات', `${formatMoney(totals.netSales)} ج`],
    ['كاش', `${formatMoney(totals.cashSales)} ج`],
    ['آجل', `${formatMoney(totals.deferredSales)} ج`],
    ['سداد آجل', `${formatMoney(totals.repaymentTotal)} ج`],
    ['مسلّم أصلي', String(totals.deliveredQty)],
    ['بديل مجاني مسلّم', String(totals.replacementDeliveredQty)],
    ['طلبات إعادة مجانية', String(totals.remadeQty)],
    ['إلغاء', String(totals.cancelledQty)],
    ['إسقاط', String(totals.waivedQty)],
    ['شكاوى عامة', String(totals.complaintTotal)],
    ['إجراءات أصناف', String(totals.itemIssueTotal)],
    ['جلسات', String(totals.totalSessions)],
    ['ورديات', String(totals.shiftCount)],
    ['تم تجهيزه', String(totals.readyQty)],
  ] as const;
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 text-center">
      {cards.map(([label, value]) => (
        <div key={label} className="rounded-xl bg-neutral-50 px-3 py-3">
          <div className="text-xs text-neutral-500">{label}</div>
          <div className="text-lg font-bold">{value}</div>
        </div>
      ))}
    </div>
  );
}

function ProductList({ items }: { items: ProductReportRow[] }) {
  if (!items.length) return <div className="text-sm text-neutral-500">لا توجد بيانات منتجات في هذه الفترة.</div>;
  return (
    <div className="space-y-2">
      {items.map((row) => (
        <div key={row.productId} className="rounded-2xl border bg-neutral-50 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-right">
              <div className="font-semibold">{row.productName}</div>
              <div className="mt-1 text-xs text-neutral-500">{row.stationCode} • مسلّم أصلي {row.qtyDelivered} • بديل مجاني مسلّم {row.qtyReplacementDelivered}</div>
              <div className="mt-1 text-xs text-neutral-500">طلبات إعادة مجانية {row.qtyRemade} • إلغاء {row.qtyCancelled} • إسقاط {row.qtyWaived}</div>
            </div>
            <div className="text-left">
              <div className="text-sm font-bold">{formatMoney(row.netSales)} ج</div>
              <div className="mt-1 text-xs text-neutral-500">إجمالي البيع {formatMoney(row.grossSales)} ج</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function StaffList({ items }: { items: StaffPerformanceRow[] }) {
  if (!items.length) return <div className="text-sm text-neutral-500">لا توجد بيانات أداء موظفين في هذه الفترة.</div>;
  return (
    <div className="space-y-2">
      {items.map((row) => (
        <div key={row.actorLabel} className="rounded-2xl border bg-neutral-50 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-right">
              <div className="font-semibold">{row.actorLabel}</div>
              <div className="mt-1 text-xs text-neutral-500">مسلّم أصلي {row.deliveredQty} • بديل مجاني مسلّم {row.replacementDeliveredQty} • تم تجهيزه {row.readyQty}</div>
              <div className="mt-1 text-xs text-neutral-500">طلبات إعادة مجانية {row.remadeQty} • إلغاء {row.cancelledQty} • شكاوى عامة {row.complaintCount} • إجراءات أصناف {row.itemIssueCount}</div>
            </div>
            <div className="text-left">
              <div className="text-sm font-bold">{formatMoney(row.paymentTotal)} ج</div>
              <div className="mt-1 text-xs text-neutral-500">كاش {formatMoney(row.cashSales)} • آجل {formatMoney(row.deferredSales)}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ShiftList({ items }: { items: ReportShiftRow[] }) {
  if (!items.length) return <div className="text-sm text-neutral-500">لا توجد ورديات في هذه الفترة.</div>;
  return (
    <div className="space-y-2">
      {items.map((row) => (
        <div key={row.shiftId} className="rounded-2xl border bg-neutral-50 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-right">
              <div className="font-semibold">{shiftKindLabel(row.kind)}</div>
              <div className="mt-1 text-xs text-neutral-500">{row.businessDate ?? ''}</div>
              <div className="mt-1 text-xs text-neutral-500">{row.status === 'open' ? 'مفتوحة' : 'مقفولة'} • جلسات {row.totalSessions} • شكاوى عامة {row.complaintTotal} • إجراءات أصناف {row.itemIssueTotal}</div>
            </div>
            <div className="text-left">
              <div className="text-sm font-bold">{formatMoney(row.netSales)} ج</div>
              <div className="mt-1 text-xs text-neutral-500">مسلّم أصلي {row.deliveredQty} • بدائل مجانية مسلّمة {row.replacementDeliveredQty}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function DayBreakdown({ period }: { period: PeriodReport }) {
  if (!period.days.length) return <div className="text-sm text-neutral-500">لا يوجد تجميع يومي في هذه الفترة.</div>;
  return (
    <div className="space-y-2">
      {period.days.map((row) => (
        <div key={row.businessDate} className="rounded-2xl border bg-neutral-50 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-right">
              <div className="font-semibold">{row.businessDate}</div>
              <div className="mt-1 text-xs text-neutral-500">ورديات {row.shiftCount} • جلسات {row.totalSessions} • شكاوى عامة {row.complaintTotal} • إجراءات أصناف {row.itemIssueTotal}</div>
            </div>
            <div className="text-left">
              <div className="text-sm font-bold">{formatMoney(row.netSales)} ج</div>
              <div className="mt-1 text-xs text-neutral-500">مسلّم أصلي {row.deliveredQty} • طلبات إعادة مجانية {row.remadeQty} • بدائل مسلّمة {row.replacementDeliveredQty}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function DeferredList({ items }: { items: DeferredCustomerSummary[] }) {
  if (!items.length) return <div className="text-sm text-neutral-500">لا توجد أرصدة آجل حتى الآن.</div>;
  return (
    <div className="space-y-2">
      {items.map((row) => (
        <div key={row.id} className="rounded-2xl border bg-neutral-50 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-right">
              <div className="font-semibold">{row.debtorName}</div>
              <div className="mt-1 text-xs text-neutral-500">دين {formatMoney(row.debtTotal)} • سداد {formatMoney(row.repaymentTotal)}</div>
            </div>
            <div className="text-left">
              <div className="text-sm font-bold">{formatMoney(row.balance)} ج</div>
              <div className="mt-1 text-xs text-neutral-500">{row.entryCount} حركة</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ReportsPage() {
  const session = useAuthz();
  const [tab, setTab] = useState<ReportTab>('current');
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
  const deferredCustomers = data?.deferredCustomers ?? [];

  return (
    <MobileShell title="التقارير" backHref="/dashboard">
      {error ? (
        <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="rounded-2xl border bg-white p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-semibold">التقارير الزمنية</div>
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
              onClick={() => setTab(item.key as ReportTab)}
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
          <div className="rounded-2xl border bg-white p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="font-semibold">الوردية الحالية</div>
              <div className="text-xs text-neutral-500">{currentShift ? `${shiftKindLabel(currentShift.kind)} • ${currentShift.businessDate ?? ''}` : 'لا توجد وردية مفتوحة'}</div>
            </div>
            {!currentShift ? (
              <div className="mt-3 text-sm text-neutral-500">لا توجد بيانات مباشرة لوردية مفتوحة الآن.</div>
            ) : (
              <>
                <TotalsGrid totals={currentShift} />
                <div className="mt-3 rounded-2xl bg-neutral-50 p-3 text-xs text-neutral-600">الشكاوى العامة: مفتوح {currentShift.complaintOpen} • محلول {currentShift.complaintResolved} • مغلق {currentShift.complaintDismissed} • إجراءات أصناف {currentShift.itemIssueTotal} • ملاحظات {currentShift.itemIssueNote} • إعادة {currentShift.itemIssueRemake} • إلغاء {currentShift.itemIssueCancel} • إسقاط {currentShift.itemIssueWaive}</div>
              </>
            )}
          </div>
          <div className="rounded-2xl border bg-white p-3"><div className="font-semibold">منتجات الوردية الحالية</div><div className="mt-3"><ProductList items={currentProducts} /></div></div>
          <div className="rounded-2xl border bg-white p-3"><div className="font-semibold">أداء العاملين في الوردية الحالية</div><div className="mt-3"><StaffList items={currentStaff} /></div></div>
        </section>
      ) : null}

      {selectedPeriod ? (
        <section className="mt-3 space-y-3">
          <div className="rounded-2xl border bg-white p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="font-semibold">{periodLabel(selectedPeriod.key)}</div>
              <div className="text-xs text-neutral-500">{selectedPeriod.startDate} ← {selectedPeriod.endDate}</div>
            </div>
            <TotalsGrid totals={selectedPeriod.totals} />
            <div className="mt-3 rounded-2xl bg-neutral-50 p-3 text-xs text-neutral-600">الشكاوى العامة: مفتوح {selectedPeriod.totals.complaintOpen} • محلول {selectedPeriod.totals.complaintResolved} • مغلق {selectedPeriod.totals.complaintDismissed} • إجراءات أصناف {selectedPeriod.totals.itemIssueTotal} • ملاحظات {selectedPeriod.totals.itemIssueNote} • إعادة {selectedPeriod.totals.itemIssueRemake} • إلغاء {selectedPeriod.totals.itemIssueCancel} • إسقاط {selectedPeriod.totals.itemIssueWaive}</div>
          </div>
          <div className="rounded-2xl border bg-white p-3"><div className="font-semibold">التجميع اليومي</div><div className="mt-3"><DayBreakdown period={selectedPeriod} /></div></div>
          <div className="rounded-2xl border bg-white p-3"><div className="font-semibold">تفصيل الورديات</div><div className="mt-3"><ShiftList items={selectedPeriod.shifts} /></div></div>
          <div className="rounded-2xl border bg-white p-3"><div className="font-semibold">المنتجات في {periodLabel(selectedPeriod.key)}</div><div className="mt-3"><ProductList items={selectedPeriod.products} /></div></div>
          <div className="rounded-2xl border bg-white p-3"><div className="font-semibold">أداء العاملين في {periodLabel(selectedPeriod.key)}</div><div className="mt-3"><StaffList items={selectedPeriod.staff} /></div></div>
        </section>
      ) : null}

      {tab === 'deferred' ? (
        <section className="mt-3 rounded-2xl border bg-white p-3"><div className="font-semibold">أرصدة الآجل</div><div className="mt-3"><DeferredList items={deferredCustomers} /></div></section>
      ) : null}
    </MobileShell>
  );
}
