'use client';

import { useCallback, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { MobileShell } from '@/ui/MobileShell';
import { useAuthz } from '@/lib/authz';
import { ShiftRequired, AccessDenied } from '@/ui/AccessState';
import { opsClient } from '@/lib/ops/client';
import type { DeferredAgingBucket, DeferredCustomerLedgerWorkspace, DeferredCustomerStatus, DeferredLedgerEntry } from '@/lib/ops/types';
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
      return 'حتى 3 أيام';
    case 'week':
      return 'حتى أسبوع';
    case 'older':
      return 'أكثر من أسبوع';
    case 'settled':
      return 'مسدد';
    default:
      return 'اليوم';
  }
}

function actorLabel(label: string | null) {
  if (label === 'owner') return 'المعلم';
  if (label === 'staff') return 'الموظف';
  return 'غير محدد';
}

const ENTRY_FILTERS: Array<{ key: 'all' | DeferredLedgerEntry['entryKind']; label: string }> = [
  { key: 'all', label: 'الكل' },
  { key: 'debt', label: 'ترحيل' },
  { key: 'repayment', label: 'سداد' },
];

export default function CustomerLedgerPage() {
  const params = useParams<{ id: string }>();
  const { can, shift } = useAuthz();
  const debtorName = useMemo(() => decodeURIComponent(String(params.id ?? '')), [params.id]);
  const [mode, setMode] = useState<'repayment' | 'debt'>('repayment');
  const [entryFilter, setEntryFilter] = useState<'all' | DeferredLedgerEntry['entryKind']>('all');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const loader = useCallback(() => opsClient.deferredCustomerLedger(debtorName), [debtorName]);
  const { data, error, reload } = useOpsWorkspace<DeferredCustomerLedgerWorkspace>(loader, {
    enabled: Boolean(debtorName),
  });

  const filteredEntries = useMemo(() => {
    const entries = data?.entries ?? [];
    if (entryFilter === 'all') return entries;
    return entries.filter((entry) => entry.entryKind === entryFilter);
  }, [data?.entries, entryFilter]);

  const submit = useOpsCommand(
    async () => {
      const numericAmount = Number(amount);
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) return;
      const trimmedNotes = notes.trim() || undefined;
      if (mode === 'repayment') {
        await opsClient.repay(debtorName, numericAmount, trimmedNotes);
      } else {
        await opsClient.addDeferredDebt(debtorName, numericAmount, trimmedNotes);
      }
      setAmount('');
      setNotes('');
      await reload();
    },
    { onError: setLocalError },
  );

  if (!can.owner && !shift) {
    return (
      <ShiftRequired
        title="دفتر الآجل"
        backHref="/dashboard"
        message="لا توجد وردية مفتوحة لك الآن. لا يمكنك فتح دفتر الآجل بدون وردية نشطة."
      />
    );
  }

  if (!can.owner && !can.billing) {
    return <AccessDenied title="دفتر الآجل" />;
  }

  const effectiveError = localError ?? error;
  const status = statusMeta(data?.status ?? 'settled');

  return (
    <MobileShell
      title={data?.debtorName ?? (debtorName || 'دفتر الآجل')}
      backHref="/customers"
      topRight={
        <span className={[ 'rounded-full px-3 py-1 text-xs font-semibold', status.className ].join(' ')}>
          {status.label}
        </span>
      }
    >
      {effectiveError ? (
        <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {effectiveError}
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <MetricCard label="الرصيد الحالي" value={`${formatMoney(data?.balance ?? 0)} ج`} tone={(data?.balance ?? 0) > 0 ? 'amber' : 'emerald'} />
          <MetricCard label="الحالة" value={status.label} hint={agingMeta(data?.agingBucket ?? 'settled')} tone={data?.status === 'late' ? 'red' : data?.status === 'active' ? 'amber' : 'emerald'} />
          <MetricCard label="إجمالي الترحيل" value={`${formatMoney(data?.debtTotal ?? 0)} ج`} />
          <MetricCard label="إجمالي السداد" value={`${formatMoney(data?.repaymentTotal ?? 0)} ج`} />
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <InfoLine label="آخر حركة" value={formatDateTime(data?.lastEntryAt ?? null)} />
            <InfoLine label="آخر ترحيل" value={formatDateTime(data?.lastDebtAt ?? null)} />
            <InfoLine label="آخر سداد" value={formatDateTime(data?.lastRepaymentAt ?? null)} />
            <InfoLine label="عدد الحركات" value={String(data?.entryCount ?? 0)} />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-2 text-sm font-semibold text-slate-800">تسجيل حركة</div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setMode('repayment')}
              className={[
                'rounded-2xl px-3 py-3 text-sm font-semibold',
                mode === 'repayment'
                  ? 'bg-emerald-600 text-white'
                  : 'border border-slate-200 bg-white text-slate-800',
              ].join(' ')}
            >
              سداد
            </button>
            <button
              onClick={() => setMode('debt')}
              className={[
                'rounded-2xl px-3 py-3 text-sm font-semibold',
                mode === 'debt'
                  ? 'bg-amber-500 text-white'
                  : 'border border-slate-200 bg-white text-slate-800',
              ].join(' ')}
            >
              مديونية
            </button>
          </div>
          <div className="mt-3 space-y-2">
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-right text-sm outline-none"
              placeholder="المبلغ"
            />
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="min-h-24 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-right text-sm outline-none"
              placeholder={mode === 'repayment' ? 'ملاحظة على السداد' : 'ملاحظة على الترحيل'}
            />
            <button
              onClick={() => void submit.run()}
              disabled={submit.busy}
              className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {submit.busy ? '...' : mode === 'repayment' ? 'تسجيل سداد' : 'تسجيل مديونية'}
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="font-semibold text-slate-900">سجل الحركة</div>
            <div className="text-xs text-slate-500">الأحدث أولًا</div>
          </div>

          <div className="mb-3 flex flex-wrap gap-2">
            {ENTRY_FILTERS.map((item) => (
              <button
                key={item.key}
                onClick={() => setEntryFilter(item.key)}
                className={[
                  'rounded-full px-3 py-2 text-xs font-semibold transition',
                  entryFilter === item.key
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 bg-white text-slate-700',
                ].join(' ')}
              >
                {item.label}
              </button>
            ))}
          </div>

          {!filteredEntries.length ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
              لا توجد حركات مطابقة
            </div>
          ) : (
            <div className="space-y-2">
              {filteredEntries.map((entry) => {
                const isDebt = entry.entryKind === 'debt';
                return (
                  <div key={entry.id} className="rounded-2xl border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 text-right">
                        <div className="truncate text-sm font-medium text-slate-900">
                          {entry.entryKind === 'debt'
                            ? 'ترحيل آجل'
                            : entry.entryKind === 'repayment'
                              ? 'سداد آجل'
                              : 'تسوية'}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {formatDateTime(entry.createdAt)} • {actorLabel(entry.actorLabel)}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                          {entry.serviceSessionId ? <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1">جلسة مرتبطة</span> : null}
                          {entry.paymentId ? <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1">دفعة مرتبطة</span> : null}
                          {entry.notes ? <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1">{entry.notes}</span> : null}
                        </div>
                      </div>
                      <div
                        className={[
                          'shrink-0 rounded-full px-3 py-1 text-xs font-semibold',
                          isDebt
                            ? 'border border-red-200 bg-red-50 text-red-700'
                            : 'border border-emerald-200 bg-emerald-50 text-emerald-700',
                        ].join(' ')}
                      >
                        {isDebt ? '+' : '-'}
                        {formatMoney(entry.amount)} ج
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </MobileShell>
  );
}

function MetricCard({
  label,
  value,
  hint,
  tone = 'slate',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'slate' | 'amber' | 'emerald' | 'red';
}) {
  const toneClass =
    tone === 'red'
      ? 'border-red-200 bg-red-50 text-red-700'
      : tone === 'emerald'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : tone === 'amber'
          ? 'border-amber-200 bg-amber-50 text-amber-700'
          : 'border-slate-200 bg-white text-slate-900';
  return (
    <div className={[ 'rounded-2xl border p-4 shadow-sm', toneClass ].join(' ')}>
      <div className="text-xs opacity-80">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      {hint ? <div className="mt-1 text-xs opacity-70">{hint}</div> : null}
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 font-medium text-slate-900">{value}</div>
    </div>
  );
}
