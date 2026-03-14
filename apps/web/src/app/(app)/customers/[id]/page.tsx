'use client';

import { useCallback, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { MobileShell } from '@/ui/MobileShell';
import { useAuthz } from '@/lib/authz';
import { ShiftRequired, AccessDenied } from '@/ui/AccessState';
import { opsClient } from '@/lib/ops/client';
import type { DeferredCustomerLedgerWorkspace } from '@/lib/ops/types';
import { useOpsCommand, useOpsWorkspace } from '@/lib/ops/hooks';

function formatMoney(value: number) {
  return new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(value ?? 0);
}

export default function CustomerLedgerPage() {
  const params = useParams<{ id: string }>();
  const { can, shift } = useAuthz();
  const debtorName = useMemo(() => decodeURIComponent(String(params.id ?? '')), [params.id]);
  const [mode, setMode] = useState<'repayment' | 'debt'>('repayment');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const loader = useCallback(() => opsClient.deferredCustomerLedger(debtorName), [debtorName]);
  const { data, error, reload } = useOpsWorkspace<DeferredCustomerLedgerWorkspace>(loader, {
    enabled: Boolean(debtorName),
  });

  const submit = useOpsCommand(
    async () => {
      const numericAmount = Number(amount);
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) return;
      if (mode === 'repayment') {
        await opsClient.repay(debtorName, numericAmount);
      } else {
        await opsClient.addDeferredDebt(debtorName, numericAmount, notes.trim() || undefined);
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

  return (
    <MobileShell
      title={data?.debtorName ?? (debtorName || 'دفتر الآجل')}
      backHref="/customers"
      topRight={
        <span
          className={[
            'rounded-full px-3 py-1 text-xs font-semibold',
            (data?.balance ?? 0) > 0
              ? 'border border-red-200 bg-red-50 text-red-700'
              : 'border border-emerald-200 bg-emerald-50 text-emerald-700',
          ].join(' ')}
        >
          {formatMoney(data?.balance ?? 0)} ج
        </span>
      }
    >
      {effectiveError ? (
        <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {effectiveError}
        </div>
      ) : null}

      <div className="space-y-3">
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
              placeholder="ملاحظة"
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

          {!data?.entries?.length ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
              لا توجد حركات بعد
            </div>
          ) : (
            <div className="space-y-2">
              {data.entries.map((entry) => (
                <div key={entry.id} className="rounded-2xl border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 text-right">
                      <div className="truncate text-sm font-medium text-slate-900">
                        {entry.entryKind === 'debt'
                          ? 'مديونية'
                          : entry.entryKind === 'repayment'
                            ? 'سداد'
                            : 'تسوية'}
                        {entry.serviceSessionId ? (
                          <span className="text-slate-500"> • جلسة مرتبطة</span>
                        ) : null}
                        {entry.paymentId ? <span className="text-slate-500"> • دفعة</span> : null}
                      </div>
                      <div className="truncate text-xs text-slate-500">
                        {new Date(entry.createdAt).toLocaleString('ar-EG')}
                        {entry.actorLabel ? ` • ${entry.actorLabel}` : ''}
                        {entry.notes ? ` • ${entry.notes}` : ''}
                      </div>
                    </div>
                    <div
                      className={[
                        'shrink-0 rounded-full px-3 py-1 text-xs font-semibold',
                        entry.entryKind === 'debt'
                          ? 'border border-red-200 bg-red-50 text-red-700'
                          : 'border border-emerald-200 bg-emerald-50 text-emerald-700',
                      ].join(' ')}
                    >
                      {entry.entryKind === 'debt' ? '+' : '-'}
                      {formatMoney(entry.amount)} ج
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </MobileShell>
  );
}
