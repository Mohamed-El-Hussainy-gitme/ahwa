'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { MobileShell } from '@/ui/MobileShell';
import { useAuthz } from '@/lib/authz';
import { ShiftRequired, AccessDenied } from '@/ui/AccessState';
import { opsClient } from '@/lib/ops/client';
import type { DeferredAgingBucket, DeferredCustomerStatus, DeferredCustomerSummary } from '@/lib/ops/types';
import { useOpsCommand, useOpsWorkspace } from '@/lib/ops/hooks';

function formatMoney(value: number) {
  return new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(value ?? 0);
}

function formatDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString('ar-EG') : 'بدون حركة';
}

function statusMeta(status: DeferredCustomerStatus) {
  switch (status) {
    case 'late':
      return { label: 'متأخر', className: 'border border-red-200 bg-red-50 text-red-700' };
    case 'settled':
      return { label: 'مسدد', className: 'border border-emerald-200 bg-emerald-50 text-emerald-700' };
    default:
      return { label: 'نشط', className: 'border border-amber-200 bg-amber-50 text-amber-700' };
  }
}

function agingMeta(bucket: DeferredAgingBucket) {
  switch (bucket) {
    case 'three_days':
      return { label: 'حتى 3 أيام', className: 'border border-amber-200 bg-amber-50 text-amber-700' };
    case 'week':
      return { label: 'حتى أسبوع', className: 'border border-orange-200 bg-orange-50 text-orange-700' };
    case 'older':
      return { label: 'أكثر من أسبوع', className: 'border border-red-200 bg-red-50 text-red-700' };
    case 'settled':
      return { label: 'مسدد', className: 'border border-emerald-200 bg-emerald-50 text-emerald-700' };
    default:
      return { label: 'اليوم', className: 'border border-sky-200 bg-sky-50 text-sky-700' };
  }
}

const STATUS_FILTERS: Array<{ key: 'all' | DeferredCustomerStatus; label: string }> = [
  { key: 'all', label: 'الكل' },
  { key: 'active', label: 'نشط' },
  { key: 'late', label: 'متأخر' },
  { key: 'settled', label: 'مسدد' },
];

export default function CustomersPage() {
  const { can, shift } = useAuthz();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | DeferredCustomerStatus>('all');
  const [debtorName, setDebtorName] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const loader = useCallback(() => opsClient.deferredCustomersWorkspace(), []);
  const { data, error } = useOpsWorkspace<{ items: DeferredCustomerSummary[] }>(loader, {
    enabled: can.owner || can.billing,
  });

  const items = data?.items ?? [];

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesQuery =
        !normalized ||
        item.debtorName.toLowerCase().includes(normalized) ||
        String(Math.round(item.balance)).includes(normalized);
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [items, query, statusFilter]);

  const summary = useMemo(() => {
    const stats = {
      totalDebt: 0,
      activeCount: 0,
      lateCount: 0,
      settledCount: 0,
      todayCount: 0,
      weekCount: 0,
      olderCount: 0,
    };

    for (const item of items) {
      stats.totalDebt += Math.max(item.balance, 0);
      if (item.status === 'late') stats.lateCount += 1;
      else if (item.status === 'settled') stats.settledCount += 1;
      else stats.activeCount += 1;

      if (item.agingBucket === 'today' || item.agingBucket === 'three_days') stats.todayCount += 1;
      else if (item.agingBucket === 'week') stats.weekCount += 1;
      else if (item.agingBucket === 'older') stats.olderCount += 1;
    }

    return stats;
  }, [items]);

  const addDebt = useOpsCommand(
    async () => {
      const numericAmount = Number(amount);
      if (!debtorName.trim() || !Number.isFinite(numericAmount) || numericAmount <= 0) return;
      await opsClient.addDeferredDebt(debtorName.trim(), numericAmount, notes.trim() || undefined);
      setDebtorName('');
      setAmount('');
      setNotes('');
    },
    { onError: setLocalError },
  );

  if (!can.owner && !shift) {
    return (
      <ShiftRequired
        title="دفتر الآجل"
        backHref="/dashboard"
        message="لا توجد وردية مفتوحة لك الآن. دفتر الآجل متاح للمشرف النشط أو المعلم فقط."
      />
    );
  }

  if (!can.owner && !can.billing) {
    return <AccessDenied title="دفتر الآجل" />;
  }

  const effectiveError = localError ?? error;

  return (
    <MobileShell title="دفتر الآجل" backHref={can.owner ? '/owner' : '/billing'}>
      {effectiveError ? (
        <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {effectiveError}
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-slate-900">تصدير دفتر الآجل</div>
              <div className="mt-1 text-xs text-slate-500">افتح نسخة قابلة للطباعة واحفظها PDF.</div>
            </div>
            <Link href="/customers/print" target="_blank" className="rounded-2xl border bg-white px-4 py-2 text-sm font-semibold text-slate-700">تصدير PDF</Link>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs text-slate-500">الرصيد المفتوح</div>
            <div className="mt-1 text-2xl font-semibold text-amber-700">{formatMoney(summary.totalDebt)} ج</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs text-slate-500">عدد الأسماء</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{items.length}</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <StatPill label="نشط" value={summary.activeCount} tone="amber" />
          <StatPill label="متأخر" value={summary.lateCount} tone="red" />
          <StatPill label="مسدد" value={summary.settledCount} tone="emerald" />
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-2 text-sm font-semibold text-slate-800">بحث وفلترة</div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-right text-sm outline-none"
            placeholder="اسم العميل أو قيمة تقريبية"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {STATUS_FILTERS.map((item) => (
              <button
                key={item.key}
                onClick={() => setStatusFilter(item.key)}
                className={[
                  'rounded-full px-3 py-2 text-xs font-semibold transition',
                  statusFilter === item.key
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 bg-white text-slate-700',
                ].join(' ')}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <MiniAgingCard label="اليوم - 3 أيام" value={summary.todayCount} tone="sky" />
            <MiniAgingCard label="حتى أسبوع" value={summary.weekCount} tone="orange" />
            <MiniAgingCard label="أكثر من أسبوع" value={summary.olderCount} tone="red" />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="font-semibold text-slate-900">العملاء</div>
            <div className="text-xs text-slate-500">{filteredItems.length} نتيجة</div>
          </div>

          {filteredItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
              لا توجد حسابات مطابقة
            </div>
          ) : (
            <div className="space-y-2">
              {filteredItems.map((item) => {
                const status = statusMeta(item.status);
                const aging = agingMeta(item.agingBucket);
                return (
                  <Link
                    key={item.id}
                    href={`/customers/${item.id}`}
                    className="block rounded-2xl border border-slate-200 p-3 transition hover:bg-slate-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 text-right">
                        <div className="truncate text-sm font-semibold text-slate-900">{item.debtorName}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          آخر حركة {formatDateTime(item.lastEntryAt)}
                        </div>
                      </div>
                      <div className="text-left">
                        <div className="text-base font-bold text-slate-900">{formatMoney(item.balance)} ج</div>
                        <div className="mt-1 text-xs text-slate-500">
                          دين {formatMoney(item.debtTotal)} • سداد {formatMoney(item.repaymentTotal)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      <span className={[ 'rounded-full px-3 py-1 font-semibold', status.className ].join(' ')}>{status.label}</span>
                      <span className={[ 'rounded-full px-3 py-1 font-semibold', aging.className ].join(' ')}>{aging.label}</span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">
                        {item.entryCount} حركة
                      </span>
                      {item.ageDays !== null ? (
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">
                          منذ {item.ageDays} يوم
                        </span>
                      ) : null}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-2 text-sm font-semibold text-slate-800">تسجيل مديونية مباشرة</div>
          <div className="space-y-2">
            <input
              value={debtorName}
              onChange={(event) => setDebtorName(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-right text-sm outline-none"
              placeholder="اسم العميل"
            />
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-right text-sm outline-none"
              placeholder="المبلغ"
              inputMode="decimal"
            />
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="min-h-24 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-right text-sm outline-none"
              placeholder="ملاحظة"
            />
            <button
              onClick={() => void addDebt.run()}
              disabled={addDebt.busy}
              className="w-full rounded-2xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {addDebt.busy ? '...' : 'إضافة المديونية'}
            </button>
          </div>
          <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
            دفتر الآجل هنا خفيف وسريع: ابحث بالاسم، راقب الرصيد، وافتح العميل لتسجيل السداد أو متابعة السجل كاملًا.
          </div>
        </section>
      </div>
    </MobileShell>
  );
}

function StatPill({ label, value, tone }: { label: string; value: number; tone: 'amber' | 'red' | 'emerald' }) {
  const toneClass =
    tone === 'red'
      ? 'border-red-200 bg-red-50 text-red-700'
      : tone === 'emerald'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : 'border-amber-200 bg-amber-50 text-amber-700';
  return (
    <div className={[ 'rounded-2xl border px-3 py-3 text-center shadow-sm', toneClass ].join(' ')}>
      <div className="text-xs font-medium">{label}</div>
      <div className="mt-1 text-lg font-bold">{value}</div>
    </div>
  );
}

function MiniAgingCard({ label, value, tone }: { label: string; value: number; tone: 'sky' | 'orange' | 'red' }) {
  const toneClass =
    tone === 'red'
      ? 'border-red-200 bg-red-50 text-red-700'
      : tone === 'orange'
        ? 'border-orange-200 bg-orange-50 text-orange-700'
        : 'border-sky-200 bg-sky-50 text-sky-700';
  return (
    <div className={[ 'rounded-2xl border px-2 py-2 text-center', toneClass ].join(' ')}>
      <div className="text-[11px] font-medium">{label}</div>
      <div className="mt-1 text-sm font-bold">{value}</div>
    </div>
  );
}
