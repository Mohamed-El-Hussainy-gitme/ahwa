'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { MobileShell } from '@/ui/MobileShell';
import { useAuthz } from '@/lib/authz';
import { opsClient } from '@/lib/ops/client';
import type { BillingWorkspace } from '@/lib/ops/types';
import { AccessDenied, ShiftRequired } from '@/ui/AccessState';
import { useOpsCommand, useOpsWorkspace } from '@/lib/ops/hooks';
import { applyBillingToWorkspace } from '@/lib/ops/workspacePatches';
import { StickyActionBar } from '@/ui/StickyActionBar';

export default function BillingPage() {
  const { can, shift } = useAuthz();
  const [sessionId, setSessionId] = useState('');
  const [debtorName, setDebtorName] = useState('');
  const [selectedQty, setSelectedQty] = useState<Record<string, number>>({});
  const [localError, setLocalError] = useState<string | null>(null);

  const loader = useCallback(() => opsClient.billingWorkspace(), []);
  const { data, setData, error } = useOpsWorkspace<BillingWorkspace>(loader, { enabled: Boolean(shift) });

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


  const settleCommand = useOpsCommand(
    async () => {
      const currentSessionId = effectiveSessionId;
      const selected = allocations();
      await opsClient.settleAndClose(selected);
      setSelectedQty({});
      setData((current) => applyBillingToWorkspace(current, currentSessionId, selected, 'settle'));
    },
    { onError: setLocalError },
  );

  const deferCommand = useOpsCommand(
    async () => {
      const currentSessionId = effectiveSessionId;
      const selected = allocations();
      await opsClient.deferAndClose(debtorName, selected);
      setSelectedQty({});
      setDebtorName('');
      setData((current) => applyBillingToWorkspace(current, currentSessionId, selected, 'defer'));
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
  const selectedAllocations = allocations();
  const selectedQtyTotal = selectedAllocations.reduce((sum, item) => sum + item.quantity, 0);
  const selectedAmountTotal = selectedAllocations.reduce((sum, item) => {
    const match = current?.items.find((candidate) => candidate.orderItemId === item.orderItemId);
    return sum + item.quantity * Number(match?.unitPrice ?? 0);
  }, 0);

  return (
    <MobileShell
      title="الحساب"
      topRight={
        <div className="flex gap-2">
          <Link href="/complaints" className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">شكاوى</Link>
          <Link href="/support?source=in_app&page=/billing" className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">دعم</Link>
        </div>
      }
      stickyFooter={
        <StickyActionBar>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 text-right">
                <div className="text-sm font-semibold text-slate-900">{current?.sessionLabel ?? 'اختر جلسة للحساب'}</div>
                <div className="mt-1 text-xs text-slate-500">{selectedQtyTotal > 0 ? `المحدد ${selectedQtyTotal} • ${selectedAmountTotal} ج` : 'حدد البنود ثم اختر تحصيل أو ترحيل'}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                disabled={busy || selectedQtyTotal === 0}
                onClick={() => void settleCommand.run()}
                className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                تحصيل المحدد
              </button>
              <button
                disabled={busy || !debtorName.trim() || selectedQtyTotal === 0}
                onClick={() => void deferCommand.run()}
                className="rounded-2xl bg-amber-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                ترحيل المحدد
              </button>
            </div>
          </div>
        </StickyActionBar>
      }
    >
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
      {!(data?.sessions ?? []).length ? (
        <div className="mb-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          لا توجد جلسات جاهزة للحساب الآن. سيظهر هنا أي شيء جاهز للتحصيل أو الترحيل إلى الآجل.
        </div>
      ) : null}
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
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">لا يوجد عناصر جاهزة للحساب في هذه الجلسة. اختر جلسة أخرى أو انتظر اكتمال التسليم.</div>
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
      <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
        تُغلق الجلسة تلقائيًا عندما تنتهي كل كمياتها المسلّمة والمسددة/المرحلة، ولا يوجد زر قفل يدوي هنا.
      </div>
    </MobileShell>
  );
}
