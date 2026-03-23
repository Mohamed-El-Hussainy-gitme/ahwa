'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { MobileShell } from '@/ui/MobileShell';
import { useAuthz } from '@/lib/authz';
import { opsClient } from '@/lib/ops/client';
import type { BillingTotals, BillingWorkspace } from '@/lib/ops/types';
import { AccessDenied, ShiftRequired } from '@/ui/AccessState';
import { useOpsCommand, useOpsWorkspace } from '@/lib/ops/hooks';
import { applyBillingToWorkspace } from '@/lib/ops/workspacePatches';
import { StickyActionBar } from '@/ui/StickyActionBar';
import { QuantityStepper } from '@/ui/ops/QuantityStepper';
import { buildBillingPreviewUrl, computeBillingTotals } from '@/lib/ops/billing';

function formatMoney(value: number) {
  return new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(value ?? 0);
}

export default function BillingPage() {
  const { can, shift } = useAuthz();
  const [sessionId, setSessionId] = useState('');
  const [debtorName, setDebtorName] = useState('');
  const [selectedQty, setSelectedQty] = useState<Record<string, number>>({});
  const [localError, setLocalError] = useState<string | null>(null);
  const [lastReceiptUrl, setLastReceiptUrl] = useState<string | null>(null);
  const [lastTotals, setLastTotals] = useState<BillingTotals | null>(null);

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
      const result = await opsClient.settleAndClose(selected);
      setSelectedQty({});
      setLastReceiptUrl(result.receiptUrl);
      setLastTotals(result.totals);
      setData((currentWorkspace) => applyBillingToWorkspace(currentWorkspace, currentSessionId, selected, 'settle'));
    },
    { onError: setLocalError },
  );

  const deferCommand = useOpsCommand(
    async () => {
      const currentSessionId = effectiveSessionId;
      const selected = allocations();
      const result = await opsClient.deferAndClose(debtorName, selected);
      setSelectedQty({});
      setDebtorName('');
      setLastReceiptUrl(result.receiptUrl);
      setLastTotals(result.totals);
      setData((currentWorkspace) => applyBillingToWorkspace(currentWorkspace, currentSessionId, selected, 'defer'));
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
  const selectedSubtotal = selectedAllocations.reduce((sum, item) => {
    const match = current?.items.find((candidate) => candidate.orderItemId === item.orderItemId);
    return sum + item.quantity * Number(match?.unitPrice ?? 0);
  }, 0);
  const previewTotals = computeBillingTotals(selectedSubtotal, data?.billingSettings);
  const previewReceiptUrl = buildBillingPreviewUrl(effectiveSessionId, selectedAllocations, debtorName);

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
                <div className="mt-1 text-xs text-slate-500">
                  {selectedQtyTotal > 0
                    ? `المحدد ${selectedQtyTotal} • قبل الإضافات ${formatMoney(previewTotals.subtotal)} ج • النهائي ${formatMoney(previewTotals.total)} ج`
                    : 'حدد البنود ثم اطبع الشيك قبل تسجيل التحصيل أو الترحيل'}
                </div>
              </div>
            </div>

            {(data?.billingSettings.taxEnabled || data?.billingSettings.serviceEnabled) && selectedQtyTotal > 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                {data?.billingSettings.taxEnabled ? <div>ضريبة: {formatMoney(previewTotals.taxAmount)} ج ({formatMoney(data.billingSettings.taxRate)}%)</div> : null}
                {data?.billingSettings.serviceEnabled ? <div>خدمة: {formatMoney(previewTotals.serviceAmount)} ج ({formatMoney(data.billingSettings.serviceRate)}%)</div> : null}
              </div>
            ) : null}

            {selectedQtyTotal > 0 ? (
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm">
                <div className="text-right text-sky-900">
                  <div className="font-semibold">اطبع الشيك أولًا قبل تسجيل الحساب.</div>
                  <div className="mt-1 text-xs text-sky-700">هذا الشيك يعرض نفس الكميات المحددة للحساب ولا يغيّر منطق الـ split.</div>
                </div>
                <Link href={previewReceiptUrl} target="_blank" className="rounded-2xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white">طباعة الشيك</Link>
              </div>
            ) : null}

            {lastTotals ? (
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm">
                <div className="text-right text-emerald-800">
                  <div className="font-semibold">تم تسجيل العملية بعد الشيك.</div>
                  <div className="mt-1 text-xs">الإجمالي النهائي {formatMoney(lastTotals.total)} ج</div>
                </div>
                {lastReceiptUrl ? <Link href={lastReceiptUrl} target="_blank" className="rounded-2xl border border-emerald-300 px-4 py-2 text-sm font-semibold text-emerald-800">عرض المستند النهائي</Link> : null}
              </div>
            ) : null}

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

      <section className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-slate-800">الجلسات للحساب</div>
          {(data?.sessions?.length ?? 0) > 0 ? (
            <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">{data?.sessions.length}</div>
          ) : null}
        </div>

        {(data?.sessions ?? []).length ? (
          <div className="grid grid-cols-2 gap-2">
            {(data?.sessions ?? []).map((session) => (
              <button
                key={session.sessionId}
                onClick={() => {
                  setSessionId(session.sessionId);
                  setLastReceiptUrl(null);
                  setLastTotals(null);
                }}
                className={[
                  'rounded-2xl border px-3 py-3 text-right',
                  effectiveSessionId === session.sessionId ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-800',
                ].join(' ')}
              >
                <div className="truncate text-sm font-bold">{session.sessionLabel}</div>
                <div className={['mt-1 text-xs', effectiveSessionId === session.sessionId ? 'text-slate-200' : 'text-slate-500'].join(' ')}>
                  {session.totalBillableQty} صنف • {session.totalBillableAmount} ج
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            لا توجد جلسات جاهزة للحساب الآن.
          </div>
        )}
      </section>

      {current ? (
        <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 text-right">
              <div className="text-sm font-bold text-slate-900">{current.sessionLabel}</div>
              <div className="mt-1 text-xs text-slate-500">الجلسة الحالية للحساب</div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 text-xs font-semibold">
              <span className="rounded-full bg-sky-50 px-3 py-1 text-sky-700">للحساب {current.totalBillableQty}</span>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">{current.totalBillableAmount} ج</span>
            </div>
          </div>
        </div>
      ) : null}

      <section className="mt-3 rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="mb-3 text-right text-sm font-semibold text-slate-800">الأصناف الجاهزة للحساب</div>

        {current?.items?.length ? (
          <div className="grid grid-cols-2 gap-2">
            {current.items.map((item) => {
              const selected = selectedQty[item.orderItemId] ?? 0;

              return (
                <div key={item.orderItemId} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 text-right">
                      <div className="text-sm font-bold text-slate-900">{item.productName}</div>
                      <div className="mt-1 text-xs text-slate-500">{item.unitPrice} ج</div>
                    </div>
                    <div className="rounded-2xl bg-emerald-600 px-2 py-1 text-center text-white">
                      <div className="text-[9px] font-semibold text-white/80">للحساب</div>
                      <div className="text-lg font-black leading-none">{item.qtyBillable}</div>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-semibold">
                    {item.qtyDelivered > 0 ? <span className="rounded-full bg-sky-50 px-2 py-1 text-sky-700">مسلّم {item.qtyDelivered}</span> : null}
                    {item.qtyWaived > 0 ? <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">مسقط {item.qtyWaived}</span> : null}
                    {item.qtyDeferred > 0 ? <span className="rounded-full bg-violet-50 px-2 py-1 text-violet-700">آجل {item.qtyDeferred}</span> : null}
                    {item.qtyPaid > 0 ? <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">مدفوع {item.qtyPaid}</span> : null}
                  </div>

                  <QuantityStepper
                    compact
                    label="تحديد"
                    value={selected}
                    onDecrement={() => setQty(item.orderItemId, selected - 1)}
                    onIncrement={() => setQty(item.orderItemId, Math.min(selected + 1, item.qtyBillable))}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
            لا يوجد عناصر جاهزة للحساب في هذه الجلسة.
          </div>
        )}
      </section>

      <section className="mt-3 rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="text-right text-sm font-semibold text-slate-800">الترحيل إلى الآجل</div>
        <input
          value={debtorName}
          onChange={(e) => setDebtorName(e.target.value)}
          placeholder="اسم الأجل"
          className="mt-3 w-full rounded-2xl border border-slate-200 px-3 py-3 text-right"
        />
        {(data?.deferredNames?.length ?? 0) > 0 ? (
          <div className="mt-2">
            <div className="mb-2 text-right text-xs font-semibold text-slate-500">اختيار سريع</div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {data?.deferredNames.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setDebtorName(name)}
                  className={[
                    'rounded-2xl border px-3 py-2 text-sm whitespace-nowrap',
                    debtorName === name ? 'border-amber-600 bg-amber-600 text-white' : 'border-slate-200 bg-slate-50 text-slate-800',
                  ].join(' ')}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
        طباعة الشيك أصبحت قبل الحساب، ثم بعد المراجعة يتم تسجيل التحصيل أو الترحيل. تقسيم الحساب حسب الكميات المحددة بقي كما هو ولم يتم المساس بمنطقه.
      </div>
    </MobileShell>
  );
}
