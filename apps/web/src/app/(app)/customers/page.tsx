'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { MobileShell } from '@/ui/MobileShell';
import { useAuthz } from '@/lib/authz';
import { ShiftRequired, AccessDenied } from '@/ui/AccessState';
import { opsClient } from '@/lib/ops/client';
import type { DeferredCustomerSummary } from '@/lib/ops/types';
import { useOpsCommand, useOpsWorkspace } from '@/lib/ops/hooks';

function formatMoney(value: number) {
  return new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(value ?? 0);
}

export default function CustomersPage() {
  const { can, shift } = useAuthz();
  const [query, setQuery] = useState('');
  const [debtorName, setDebtorName] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const loader = useCallback(() => opsClient.deferredCustomersWorkspace(), []);
  const { data, error, reload } = useOpsWorkspace<{ items: DeferredCustomerSummary[] }>(loader, {
    enabled: can.owner || can.billing,
  });

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const items = data?.items ?? [];
    if (!normalized) return items;
    return items.filter((item) => item.debtorName.toLowerCase().includes(normalized));
  }, [data?.items, query]);

  const totalDebt = useMemo(
    () => filteredItems.reduce((sum, item) => sum + Math.max(item.balance, 0), 0),
    [filteredItems],
  );

  const addDebt = useOpsCommand(
    async () => {
      const numericAmount = Number(amount);
      if (!debtorName.trim() || !Number.isFinite(numericAmount) || numericAmount <= 0) return;
      await opsClient.addDeferredDebt(debtorName.trim(), numericAmount, notes.trim() || undefined);
      setDebtorName('');
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
        message="لا توجد وردية مفتوحة لك الآن. دفتر الآجل متاح للمشرف النشط أو المعلم فقط."
      />
    );
  }

  if (!can.owner && !can.billing) {
    return <AccessDenied title="دفتر الآجل" />;
  }

  const effectiveError = localError ?? error;

  return (
    <MobileShell title="الزبائن والمديونيات" backHref={can.owner ? '/owner' : '/billing'}>
      {effectiveError ? (
        <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {effectiveError}
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs text-slate-500">عدد العملاء</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{filteredItems.length}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs text-slate-500">إجمالي المديونية</div>
            <div className="mt-1 text-2xl font-semibold text-amber-700">{formatMoney(totalDebt)} ج</div>
          </div>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-2 text-sm font-semibold text-slate-800">بحث سريع</div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-right text-sm outline-none"
            placeholder="اسم العميل"
          />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="font-semibold text-slate-900">قائمة المديونيات</div>
            <div className="text-xs text-slate-500">افتح العميل لعرض الدفتر والحركات</div>
          </div>

          {filteredItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
              لا توجد حسابات مطابقة
            </div>
          ) : (
            <div className="space-y-2">
              {filteredItems.map((item) => (
                <Link
                  key={item.id}
                  href={`/customers/${item.id}`}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 p-3 transition hover:bg-slate-50"
                >
                  <div className="min-w-0 text-right">
                    <div className="truncate text-sm font-semibold text-slate-900">{item.debtorName}</div>
                    <div className="truncate text-xs text-slate-500">
                      {item.lastEntryAt
                        ? `آخر حركة ${new Date(item.lastEntryAt).toLocaleString('ar-EG')}`
                        : 'بدون حركات'}{' '}
                      • {item.entryCount} حركة
                    </div>
                  </div>
                  <div
                    className={[
                      'rounded-full px-3 py-1 text-xs font-semibold',
                      item.balance > 0
                        ? 'bg-red-50 text-red-700 border border-red-200'
                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200',
                    ].join(' ')}
                  >
                    {formatMoney(item.balance)} ج
                  </div>
                </Link>
              ))}
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
            كل سداد وترحيل من شاشة الحساب سيظهر هنا مباشرة لنفس الاسم.
          </div>
        </section>
      </div>
    </MobileShell>
  );
}
