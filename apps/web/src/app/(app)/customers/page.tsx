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
      return { label: 'متأخر', className: 'border border-[#e6c7c2] bg-[#fff3f1] text-[#9a3e35]' };
    case 'settled':
      return { label: 'مسدد', className: 'border border-[#cfe0d7] bg-[#eff7f1] text-[#2e6a4e]' };
    default:
      return { label: 'نشط', className: 'border border-[#ecd9bd] bg-[#fcf3e7] text-[#a5671e]' };
  }
}

function agingMeta(bucket: DeferredAgingBucket) {
  switch (bucket) {
    case 'three_days':
      return { label: 'حتى 3 أيام', className: 'border border-[#ecd9bd] bg-[#fcf3e7] text-[#a5671e]' };
    case 'week':
      return { label: 'حتى أسبوع', className: 'border border-[#ecd9bd] bg-[#fcf3e7] text-[#a5671e]' };
    case 'older':
      return { label: 'أكثر من أسبوع', className: 'border border-[#e6c7c2] bg-[#fff3f1] text-[#9a3e35]' };
    case 'settled':
      return { label: 'مسدد', className: 'border border-[#cfe0d7] bg-[#eff7f1] text-[#2e6a4e]' };
    default:
      return { label: 'اليوم', className: 'border border-[#d6dee5] bg-[#f4f7f9] text-[#3c617c]' };
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
    cacheKey: 'workspace:customers',
    staleTimeMs: 20_000,
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
        message="لا توجد وردية مفتوحة لك الآن. دفتر الآجل متاح لمشرف التشغيل النشط أو المالك فقط."
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
        <div className="mb-3 rounded-2xl border border-[#e6c7c2] bg-[#fff3f1] p-3 text-sm text-[#9a3e35]">
          {effectiveError}
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="ahwa-card p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-[#1e1712]">تصدير كشف الآجل</div>
              <div className="mt-1 text-xs text-[#8a7763]">افتح نسخة مرتبة للطباعة أو الحفظ بصيغة PDF.</div>
            </div>
            <Link href="/customers/print" className="rounded-2xl border bg-[#fffdf9] px-4 py-2 text-sm font-semibold text-[#5e4d3f]">تصدير PDF</Link>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="ahwa-card p-4">
            <div className="text-xs text-[#8a7763]">الرصيد المفتوح</div>
            <div className="mt-1 text-2xl font-semibold text-[#a5671e]">{formatMoney(summary.totalDebt)} ج</div>
          </div>
          <div className="ahwa-card p-4">
            <div className="text-xs text-[#8a7763]">عدد الحسابات</div>
            <div className="mt-1 text-2xl font-semibold text-[#1e1712]">{items.length}</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <StatPill label="نشط" value={summary.activeCount} tone="amber" />
          <StatPill label="متأخر" value={summary.lateCount} tone="red" />
          <StatPill label="مسدد" value={summary.settledCount} tone="emerald" />
        </div>

        <section className="ahwa-card p-3">
          <div className="mb-2 text-sm font-semibold text-[#2f241b]">بحث وفلترة</div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="ahwa-input text-right text-sm"
            placeholder="اسم الحساب أو قيمة تقريبية"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {STATUS_FILTERS.map((item) => (
              <button
                key={item.key}
                onClick={() => setStatusFilter(item.key)}
                className={[
                  'rounded-full px-3 py-2 text-xs font-semibold transition',
                  statusFilter === item.key
                    ? 'bg-[#1e1712] text-white'
                    : 'border border-[#decdb9] bg-[#fffdf9] text-[#5e4d3f]',
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

        <section className="ahwa-card p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="font-semibold text-[#1e1712]">الحسابات</div>
            <div className="text-xs text-[#8a7763]">{filteredItems.length} نتيجة</div>
          </div>

          {filteredItems.length === 0 ? (
            <div className="ahwa-card-dashed p-4 text-center text-sm text-[#8a7763]">
              لا توجد حسابات مطابقة لهذه المعايير
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
                    className="block rounded-2xl border border-[#decdb9] p-3 transition hover:bg-[#f8f1e7]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 text-right">
                        <div className="truncate text-sm font-semibold text-[#1e1712]">{item.debtorName}</div>
                        <div className="mt-1 text-xs text-[#8a7763]">
                          آخر حركة {formatDateTime(item.lastEntryAt)}
                        </div>
                      </div>
                      <div className="text-left">
                        <div className="text-base font-bold text-[#1e1712]">{formatMoney(item.balance)} ج</div>
                        <div className="mt-1 text-xs text-[#8a7763]">
                          دين {formatMoney(item.debtTotal)} • سداد {formatMoney(item.repaymentTotal)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      <span className={[ 'rounded-full px-3 py-1 font-semibold', status.className ].join(' ')}>{status.label}</span>
                      <span className={[ 'rounded-full px-3 py-1 font-semibold', aging.className ].join(' ')}>{aging.label}</span>
                      <span className="ahwa-pill-neutral">
                        {item.entryCount} حركة
                      </span>
                      {item.ageDays !== null ? (
                        <span className="ahwa-pill-neutral">
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

        <section className="ahwa-card p-3">
          <div className="mb-2 text-sm font-semibold text-[#2f241b]">ترحيل مبلغ جديد</div>
          <div className="space-y-2">
            <input
              value={debtorName}
              onChange={(event) => setDebtorName(event.target.value)}
              className="ahwa-input text-right text-sm"
              placeholder="اسم الحساب"
            />
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="ahwa-input text-right text-sm"
              placeholder="المبلغ"
              inputMode="decimal"
            />
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="min-h-24 ahwa-textarea text-right text-sm"
              placeholder="ملاحظات داخلية"
            />
            <button
              onClick={() => void addDebt.run()}
              disabled={addDebt.busy}
              className="w-full rounded-2xl bg-[#9b6b2e] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {addDebt.busy ? '...' : 'ترحيل المبلغ'}
            </button>
          </div>
          <div className="mt-3 rounded-2xl border border-[#decdb9] bg-[#f8f1e7] p-3 text-xs text-[#8a7763]">
            دفتر الآجل هنا مصمم للمتابعة اليومية السريعة: ابحث بالاسم، راقب الرصيد، وافتح الحساب لتسجيل السداد أو مراجعة السجل بالكامل.
          </div>
        </section>
      </div>
    </MobileShell>
  );
}

function StatPill({ label, value, tone }: { label: string; value: number; tone: 'amber' | 'red' | 'emerald' }) {
  const toneClass =
    tone === 'red'
      ? 'border-[#e6c7c2] bg-[#fff3f1] text-[#9a3e35]'
      : tone === 'emerald'
        ? 'border-[#cfe0d7] bg-[#eff7f1] text-[#2e6a4e]'
        : 'border-[#ecd9bd] bg-[#fcf3e7] text-[#a5671e]';
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
      ? 'border-[#e6c7c2] bg-[#fff3f1] text-[#9a3e35]'
      : tone === 'orange'
        ? 'border-[#ecd9bd] bg-[#fcf3e7] text-[#a5671e]'
        : 'border-[#d6dee5] bg-[#f4f7f9] text-[#3c617c]';
  return (
    <div className={[ 'rounded-2xl border px-2 py-2 text-center', toneClass ].join(' ')}>
      <div className="text-[11px] font-medium">{label}</div>
      <div className="mt-1 text-sm font-bold">{value}</div>
    </div>
  );
}
