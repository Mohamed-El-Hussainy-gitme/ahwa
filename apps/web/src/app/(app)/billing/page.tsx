'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import {
  opsAccentButton,
  opsBadge,
  opsDashed,
  opsGhostButton,
  opsInset,
  opsInput,
  opsMetricCard,
  opsPrimaryButton,
  opsSuccessButton,
  opsSurface,
} from '@/ui/ops/premiumStyles';

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
  const billingEnabled = Boolean(shift) && (can.billing || can.owner);
  const { data, setData, error } = useOpsWorkspace<BillingWorkspace>(loader, {
    enabled: billingEnabled,
    cacheKey: 'workspace:billing',
    staleTimeMs: 12_000,
    pollIntervalMs: billingEnabled ? 4000 : undefined,
  });

  const effectiveSessionId = sessionId || data?.sessions[0]?.sessionId || '';
  const current = useMemo(
    () => data?.sessions.find((session) => session.sessionId === effectiveSessionId) ?? null,
    [data, effectiveSessionId],
  );

  useEffect(() => {
    const sessions = data?.sessions ?? [];

    if (!sessions.length) {
      if (sessionId) {
        setSessionId('');
      }
      return;
    }

    if (sessionId && !sessions.some((session) => session.sessionId === sessionId)) {
      setSessionId(sessions[0]?.sessionId ?? '');
      setSelectedQty({});
      setLastReceiptUrl(null);
      setLastTotals(null);
    }
  }, [data?.sessions, sessionId]);

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

  const printableAllocations = (current?.items ?? [])
    .map((item) => ({
      orderItemId: item.orderItemId,
      quantity: item.qtyBillable,
    }))
    .filter((item) => item.quantity > 0);

  const printableQtyTotal = printableAllocations.reduce((sum, item) => sum + item.quantity, 0);
  const printableSubtotal = printableAllocations.reduce((sum, item) => {
    const match = current?.items.find((candidate) => candidate.orderItemId === item.orderItemId);
    return sum + item.quantity * Number(match?.unitPrice ?? 0);
  }, 0);
  const printableTotals = computeBillingTotals(printableSubtotal, data?.billingSettings);
  const previewReceiptUrl = buildBillingPreviewUrl(effectiveSessionId, printableAllocations, debtorName);

  return (
    <MobileShell
      title="الحساب"
      topRight={
        <div className="flex gap-2">
          <Link href="/complaints" className={opsGhostButton}>
            شكاوى
          </Link>
          <Link href="/support?source=in_app&page=/billing" className={opsGhostButton}>
            دعم
          </Link>
        </div>
      }
      stickyFooter={
        <StickyActionBar>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 text-right">
                <div className="text-sm font-semibold text-[#1e1712]">{current?.sessionLabel ?? 'اختر جلسة للحساب'}</div>
                <div className="mt-1 text-xs leading-6 text-[#7d6a59]">
                  {selectedQtyTotal > 0
                    ? `المحدد ${selectedQtyTotal} • قبل الإضافات ${formatMoney(previewTotals.subtotal)} ج • النهائي ${formatMoney(previewTotals.total)} ج`
                    : 'حدد البنود المطلوبة للتحصيل أو الترحيل'}
                </div>
              </div>
            </div>

            {(data?.billingSettings.taxEnabled || data?.billingSettings.serviceEnabled) && selectedQtyTotal > 0 ? (
              <div className={[opsInset, 'p-3 text-xs text-[#6b5a4c]'].join(' ')}>
                {data?.billingSettings.taxEnabled ? (
                  <div>
                    ضريبة: {formatMoney(previewTotals.taxAmount)} ج ({formatMoney(data.billingSettings.taxRate)}%)
                  </div>
                ) : null}
                {data?.billingSettings.serviceEnabled ? (
                  <div>
                    خدمة: {formatMoney(previewTotals.serviceAmount)} ج ({formatMoney(data.billingSettings.serviceRate)}%)
                  </div>
                ) : null}
              </div>
            ) : null}

            {lastTotals ? (
              <div className="flex items-center justify-between gap-3 rounded-[20px] border border-[#cfe0d7] bg-[#eff7f1] p-3 text-sm">
                <div className="text-right text-[#2e6a4e]">
                  <div className="font-semibold">تم تسجيل العملية.</div>
                  <div className="mt-1 text-xs">الإجمالي النهائي {formatMoney(lastTotals.total)} ج</div>
                </div>
                {lastReceiptUrl ? (
                  <Link
                    href={lastReceiptUrl}
                    target="_blank"
                    className="rounded-[18px] border border-[#c0d8cb] px-4 py-2 text-sm font-semibold text-[#2e6a4e]"
                  >
                    عرض المستند النهائي
                  </Link>
                ) : null}
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              <button
                disabled={busy || selectedQtyTotal === 0}
                onClick={() => void settleCommand.run()}
                className={opsSuccessButton}
              >
                تحصيل المحدد
              </button>
              <button
                disabled={busy || !debtorName.trim() || selectedQtyTotal === 0}
                onClick={() => void deferCommand.run()}
                className={opsAccentButton}
              >
                ترحيل المحدد
              </button>
            </div>
          </div>
        </StickyActionBar>
      }
    >
      {effectiveError ? (
        <div className="mb-3 rounded-[22px] border border-[#e6c7c2] bg-[#fff7f5] p-3 text-sm text-[#9a3e35]">
          {effectiveError}
        </div>
      ) : null}

      <section className={[opsSurface, 'mb-3 p-3'].join(' ')}>
        <div className="flex items-start justify-between gap-3">
          <div className="text-right">
            <div className="text-sm font-semibold text-[#1e1712]">التحصيل والإقفال</div>
            <div className="mt-1 text-xs leading-6 text-[#7d6a59]">
              اختر الجلسة، حدّد البنود المطلوب تحصيلها، ثم اطبع الفاتورة أو رحّلها إلى الآجل باسم واضح.
            </div>
          </div>
          <div className={opsBadge('accent')}>واجهة التحصيل</div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className={opsMetricCard('success')}>
            <div className="text-[11px] font-semibold opacity-70">جلسات للحساب</div>
            <div className="mt-1 text-xl font-black leading-none">{data?.sessions?.length ?? 0}</div>
          </div>
          <div className={opsMetricCard('info')}>
            <div className="text-[11px] font-semibold opacity-70">المحدد</div>
            <div className="mt-1 text-xl font-black leading-none">{selectedQtyTotal}</div>
          </div>
          <div className={opsMetricCard('accent')}>
            <div className="text-[11px] font-semibold opacity-70">الإجمالي</div>
            <div className="mt-1 text-xl font-black leading-none">{formatMoney(previewTotals.total)}</div>
          </div>
        </div>
      </section>

      <section className={[opsSurface, 'p-3'].join(' ')}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-[#3d3128]">الجلسات للحساب</div>
          {(data?.sessions?.length ?? 0) > 0 ? <div className={opsBadge('success')}>{data?.sessions.length}</div> : null}
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
                  'rounded-[20px] border px-3 py-3 text-right transition',
                  effectiveSessionId === session.sessionId
                    ? 'border-[#1e1712] bg-[#1e1712] text-white shadow-[0_14px_28px_rgba(30,23,18,0.16)]'
                    : 'border-[#decebb] bg-[#fffdf8] text-[#1e1712]',
                ].join(' ')}
              >
                <div className="truncate text-sm font-bold">{session.sessionLabel}</div>
                <div className={['mt-1 text-xs', effectiveSessionId === session.sessionId ? 'text-white/75' : 'text-[#7d6a59]'].join(' ')}>
                  {session.totalBillableQty} صنف • {session.totalBillableAmount} ج
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className={[opsDashed, 'p-3 text-sm text-[#6b5a4c]'].join(' ')}>
            لا توجد جلسات جاهزة للحساب الآن.
          </div>
        )}
      </section>

      {current ? (
        <div className={[opsSurface, 'mt-3 p-3'].join(' ')}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 text-right">
              <div className="text-sm font-bold text-[#1e1712]">{current.sessionLabel}</div>
              <div className="mt-1 text-xs text-[#7d6a59]">الجلسة الحالية للحساب</div>
            </div>

            <div className="flex flex-wrap justify-end gap-2 text-xs font-semibold">
              <span className={opsBadge('info')}>للحساب {current.totalBillableQty}</span>
              <span className={opsBadge('success')}>{current.totalBillableAmount} ج</span>
            </div>
          </div>

          {printableQtyTotal > 0 ? (
            <div className={[opsInset, 'mt-3 flex items-center justify-between gap-3 p-3'].join(' ')}>
              <div className="text-right">
                <div className="text-sm font-semibold text-[#1e1712]">الفاتورة الكاملة</div>
                <div className="mt-1 text-xs text-[#7d6a59]">
                  {formatMoney(printableTotals.total)} ج • {printableQtyTotal} صنف
                </div>
              </div>

              <Link href={previewReceiptUrl} target="_blank" className={opsPrimaryButton}>
                طباعة الفاتورة
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}

      <section className={[opsSurface, 'mt-3 p-3'].join(' ')}>
        <div className="mb-3 text-right text-sm font-semibold text-[#3d3128]">الأصناف الجاهزة للحساب</div>

        {current?.items?.length ? (
          <div className="grid grid-cols-2 gap-2">
            {current.items.map((item) => {
              const selected = selectedQty[item.orderItemId] ?? 0;

              return (
                <div key={item.orderItemId} className={[opsInset, 'p-3'].join(' ')}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 text-right">
                      <div className="text-sm font-bold text-[#1e1712]">{item.productName}</div>
                      <div className="mt-1 text-xs text-[#7d6a59]">{item.unitPrice} ج</div>
                    </div>
                    <div className="rounded-[16px] bg-[#2e6a4e] px-2 py-1 text-center text-white">
                      <div className="text-[9px] font-semibold text-white/80">للحساب</div>
                      <div className="text-lg font-black leading-none">{item.qtyBillable}</div>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-semibold">
                    {item.qtyDelivered > 0 ? <span className={opsBadge('info')}>مسلّم {item.qtyDelivered}</span> : null}
                    {item.qtyWaived > 0 ? <span className={opsBadge('warning')}>مسقط {item.qtyWaived}</span> : null}
                    {item.qtyDeferred > 0 ? <span className={opsBadge('accent')}>آجل {item.qtyDeferred}</span> : null}
                    {item.qtyPaid > 0 ? <span className={opsBadge('success')}>مدفوع {item.qtyPaid}</span> : null}
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
          <div className={[opsDashed, 'p-3 text-sm text-[#6b5a4c]'].join(' ')}>
            لا يوجد عناصر جاهزة للحساب في هذه الجلسة.
          </div>
        )}
      </section>

      <section className={[opsSurface, 'mt-3 p-3'].join(' ')}>
        <div className="text-right text-sm font-semibold text-[#3d3128]">الترحيل إلى الآجل</div>
        <input value={debtorName} onChange={(e) => setDebtorName(e.target.value)} placeholder="اسم الأجل" className={[opsInput, 'mt-3'].join(' ')} />
        {(data?.deferredNames?.length ?? 0) > 0 ? (
          <div className="mt-2">
            <div className="mb-2 text-right text-xs font-semibold text-[#7d6a59]">اختيار سريع</div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {data?.deferredNames.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setDebtorName(name)}
                  className={[
                    'rounded-[18px] border px-3 py-2 text-sm whitespace-nowrap',
                    debtorName === name ? 'border-[#9b6b2e] bg-[#9b6b2e] text-white' : 'border-[#dac9b6] bg-[#fffaf3] text-[#5e4d3f]',
                  ].join(' ')}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </MobileShell>
  );
}
