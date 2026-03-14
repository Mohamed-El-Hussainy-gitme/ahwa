'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { MobileShell } from '@/ui/MobileShell';
import { useAuthz } from '@/lib/authz';
import { opsClient } from '@/lib/ops/client';
import type { BillingWorkspace } from '@/lib/ops/types';
import { AccessDenied, ShiftRequired } from '@/ui/AccessState';
import { useOpsCommand, useOpsWorkspace } from '@/lib/ops/hooks';

export default function BillingPage() {
  const { can, shift } = useAuthz();
  const [sessionId, setSessionId] = useState('');
  const [debtorName, setDebtorName] = useState('');
  const [selectedQty, setSelectedQty] = useState<Record<string, number>>({});
  const [localError, setLocalError] = useState<string | null>(null);

  const loader = useCallback(() => opsClient.billingWorkspace(), []);
  const { data, error, reload } = useOpsWorkspace<BillingWorkspace>(loader, { enabled: Boolean(shift) });

  const effectiveSessionId = sessionId || data?.sessions[0]?.sessionId || '';
  const current = useMemo(
    () => data?.sessions.find((session) => session.sessionId === effectiveSessionId) ?? null,
    [data, effectiveSessionId],
  );
  const allocations = useCallback(() => {
    return (current?.items ?? [])
      .map((item) => ({
        orderItemId: item.orderItemId,
        quantity: Math.min(selectedQty[item.orderItemId] ?? 0, item.qtyBillable),
      }))
      .filter((item) => item.quantity > 0);
  }, [current?.items, selectedQty]);

  async function finalizeSessionIfPossible(targetSessionId: string) {
    if (!targetSessionId) return;
    try {
      await opsClient.closeSession(targetSessionId);
    } catch {
      // قد تبقى الجلسة مفتوحة لو ما زالت فيها كميات غير منتهية، وهذا طبيعي.
    }
  }

  const settleCommand = useOpsCommand(
    async () => {
      const currentSessionId = effectiveSessionId;
      await opsClient.settle(allocations());
      setSelectedQty({});
      await reload();
      await finalizeSessionIfPossible(currentSessionId);
      await reload();
    },
    { onError: setLocalError },
  );

  const deferCommand = useOpsCommand(
    async () => {
      const currentSessionId = effectiveSessionId;
      await opsClient.defer(debtorName, allocations());
      setSelectedQty({});
      setDebtorName('');
      await reload();
      await finalizeSessionIfPossible(currentSessionId);
      await reload();
    },
    { onError: setLocalError },
  );

  if (!shift) return <ShiftRequired title="الحساب" />;
  if (!can.billing && !can.owner) return <AccessDenied title="الحساب" />;

  function setQty(orderItemId: string, qty: number) {
    setSelectedQty((state) => ({ ...state, [orderItemId]: Math.max(0, qty) }));
  }

  const effectiveError = localError ?? error;
  const busy = settleCommand.busy || deferCommand.busy;

  return (
    <MobileShell title="الحساب" topRight={<Link href="/complaints" className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">شكاوى</Link>}>
      {effectiveError ? (
        <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {effectiveError}
        </div>
      ) : null}
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        {(data?.sessions ?? []).map((session) => (
          <button
            key={session.sessionId}
            onClick={() => setSessionId(session.sessionId)}
            className={[
              'rounded-2xl border px-3 py-2 text-sm font-semibold whitespace-nowrap',
              effectiveSessionId === session.sessionId
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-white',
            ].join(' ')}
          >
            {session.sessionLabel}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {(current?.items ?? []).map((item) => (
          <div key={item.orderItemId} className="rounded-2xl border border-slate-200 p-3">
            <div className="font-semibold">{item.productName}</div>
            <div className="mt-1 text-xs text-slate-500">جاهز للحساب {item.qtyBillable} • مُسقط {item.qtyWaived}</div>
            <div className="mt-3 flex items-center justify-between">
              <button
                onClick={() => setQty(item.orderItemId, (selectedQty[item.orderItemId] ?? 0) - 1)}
                className="h-10 w-10 rounded-2xl border border-slate-200"
              >
                -
              </button>
              <div className="text-lg font-bold">{selectedQty[item.orderItemId] ?? 0}</div>
              <button
                onClick={() =>
                  setQty(
                    item.orderItemId,
                    Math.min((selectedQty[item.orderItemId] ?? 0) + 1, item.qtyBillable),
                  )
                }
                className="h-10 w-10 rounded-2xl bg-slate-900 text-white"
              >
                +
              </button>
            </div>
          </div>
        ))}
        {!current?.items?.length ? (
          <div className="text-sm text-slate-500">لا يوجد عناصر جاهزة للحساب</div>
        ) : null}
      </div>
      <input
        value={debtorName}
        onChange={(e) => setDebtorName(e.target.value)}
        placeholder="اسم الأجل"
        className="mt-3 w-full rounded-2xl border border-slate-200 px-3 py-3 text-right"
      />
      {(data?.deferredNames?.length ?? 0) > 0 ? (
        <div className="mt-2">
          <div className="mb-2 text-right text-xs font-semibold text-slate-500">اختيار سريع من دفتر الأجل</div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {data?.deferredNames.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setDebtorName(name)}
                className={[
                  'rounded-2xl border px-3 py-2 text-sm whitespace-nowrap',
                  debtorName === name
                    ? 'border-amber-600 bg-amber-600 text-white'
                    : 'border-slate-200 bg-slate-50 text-slate-800',
                ].join(' ')}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          disabled={busy}
          onClick={() => void settleCommand.run()}
          className="rounded-2xl bg-emerald-600 px-4 py-4 font-semibold text-white disabled:opacity-60"
        >
          تحصيل المحدد
        </button>
        <button
          disabled={busy || !debtorName.trim()}
          onClick={() => void deferCommand.run()}
          className="rounded-2xl bg-amber-600 px-4 py-4 font-semibold text-white disabled:opacity-60"
        >
          ترحيل المحدد
        </button>
      </div>
      <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
        تُغلق الجلسة تلقائيًا عندما تنتهي كل كمياتها المسلّمة والمسددة/المرحلة، ولا يوجد زر قفل يدوي هنا.
      </div>
    </MobileShell>
  );
}
