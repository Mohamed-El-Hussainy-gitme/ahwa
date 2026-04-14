'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { appendBillingReturnSessionId, buildBillingPageUrl, buildBillingPreviewUrl, computeBillingTotals, type BillingAllocationInput } from '@/lib/ops/billing';
import { saveBillingReceiptPreviewDraft } from '@/lib/ops/receipt-preview';
import { parseOrderItemNotes } from '@/lib/ops/orderItemNotes';
import { shouldReloadBillingWorkspace } from '@/lib/ops/reload-rules';
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

type BillingMutationMode = 'settle' | 'defer';

export default function BillingPage() {
  const { can, shift } = useAuthz();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedSessionId = String(searchParams.get('sessionId') ?? '').trim();
  const [sessionId, setSessionId] = useState(requestedSessionId);
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
    shouldReloadOnEvent: shouldReloadBillingWorkspace,
  });

  const effectiveSessionId = sessionId || requestedSessionId || data?.sessions[0]?.sessionId || '';
  const current = useMemo(
    () => data?.sessions.find((session) => session.sessionId === effectiveSessionId) ?? null,
    [data, effectiveSessionId],
  );

  const printableAllocations = useMemo(
    () =>
      (current?.items ?? [])
        .map((item) => ({
          orderItemId: item.orderItemId,
          quantity: item.qtyBillable,
        }))
        .filter((item) => item.quantity > 0),
    [current?.items],
  );

  const resetSessionSideEffects = useCallback(() => {
    setSelectedQty({});
    setLastReceiptUrl(null);
    setLastTotals(null);
  }, []);

  const selectSession = useCallback((nextSessionId: string) => {
    const normalized = String(nextSessionId ?? '').trim();
    if (!normalized) {
      return;
    }

    setSessionId(normalized);
    resetSessionSideEffects();
    router.replace(buildBillingPageUrl(normalized), { scroll: false });
  }, [resetSessionSideEffects, router]);

  useEffect(() => {
    const sessions = data?.sessions ?? [];

    if (!sessions.length) {
      if (sessionId) {
        setSessionId('');
      }
      if (requestedSessionId) {
        router.replace('/billing', { scroll: false });
      }
      return;
    }

    if (requestedSessionId) {
      const requestedExists = sessions.some((session) => session.sessionId === requestedSessionId);
      if (requestedExists) {
        if (sessionId !== requestedSessionId) {
          setSessionId(requestedSessionId);
          resetSessionSideEffects();
        }
        return;
      }
    }

    const fallbackSessionId = sessions[0]?.sessionId ?? '';
    if (!fallbackSessionId) {
      return;
    }

    if (sessionId !== fallbackSessionId) {
      setSessionId(fallbackSessionId);
      resetSessionSideEffects();
    }

    if (requestedSessionId !== fallbackSessionId) {
      router.replace(buildBillingPageUrl(fallbackSessionId), { scroll: false });
    }
  }, [data?.sessions, requestedSessionId, resetSessionSideEffects, router, sessionId]);

  const allocations = useCallback(() => {
    return (current?.items ?? [])
      .map((item) => ({
        orderItemId: item.orderItemId,
        quantity: Math.min(selectedQty[item.orderItemId] ?? 0, item.qtyBillable),
      }))
      .filter((item) => item.quantity > 0);
  }, [current?.items, selectedQty]);

  const executeBillingMutation = useCallback(async (mode: BillingMutationMode, requestedAllocations: BillingAllocationInput[], debtorNameInput?: string) => {
    const currentSessionId = effectiveSessionId;
    const normalizedAllocations = requestedAllocations.filter((item) => item.quantity > 0);

    if (!currentSessionId || normalizedAllocations.length === 0) {
      throw new Error('حدد البنود المطلوبة أولاً.');
    }

    const normalizedDebtorName = String(debtorNameInput ?? '').trim();
    if (mode === 'defer' && !normalizedDebtorName) {
      throw new Error('اكتب اسم الآجل أولاً قبل الترحيل.');
    }

    const result = mode === 'settle'
      ? await opsClient.settleAndClose(normalizedAllocations)
      : await opsClient.deferAndClose(normalizedDebtorName, normalizedAllocations);

    setSelectedQty({});
    if (mode === 'defer') {
      setDebtorName('');
    }
    setLastReceiptUrl(appendBillingReturnSessionId(result.receiptUrl, currentSessionId));
    setLastTotals(result.totals);
    setData((currentWorkspace) => applyBillingToWorkspace(currentWorkspace, currentSessionId, normalizedAllocations, mode));
  }, [effectiveSessionId, setData]);

  const settleCommand = useOpsCommand(async () => {
    await executeBillingMutation('settle', allocations());
  }, { onError: setLocalError });

  const deferCommand = useOpsCommand(async () => {
    await executeBillingMutation('defer', allocations(), debtorName);
  }, { onError: setLocalError });

  const settleFullCommand = useOpsCommand(async () => {
    await executeBillingMutation('settle', printableAllocations);
  }, { onError: setLocalError });

  const deferFullCommand = useOpsCommand(async () => {
    await executeBillingMutation('defer', printableAllocations, debtorName);
  }, { onError: setLocalError });

  if (!shift) return <ShiftRequired title="الحساب" />;
  if (!can.billing && !can.owner) return <AccessDenied title="الحساب" />;

  function setQty(orderItemId: string, qty: number) {
    setSelectedQty((state) => ({ ...state, [orderItemId]: Math.max(0, qty) }));
  }

  const effectiveError = localError ?? error;
  const busy = settleCommand.busy || deferCommand.busy || settleFullCommand.busy || deferFullCommand.busy;
  const selectedAllocations = allocations();
  const selectedQtyTotal = selectedAllocations.reduce((sum, item) => sum + item.quantity, 0);
  const selectedSubtotal = selectedAllocations.reduce((sum, item) => {
    const match = current?.items.find((candidate) => candidate.orderItemId === item.orderItemId);
    return sum + item.quantity * Number(match?.unitPrice ?? 0);
  }, 0);
  const previewTotals = computeBillingTotals(selectedSubtotal, data?.billingSettings);

  const printableQtyTotal = printableAllocations.reduce((sum, item) => sum + item.quantity, 0);
  const printableSubtotal = printableAllocations.reduce((sum, item) => {
    const match = current?.items.find((candidate) => candidate.orderItemId === item.orderItemId);
    return sum + item.quantity * Number(match?.unitPrice ?? 0);
  }, 0);
  const printableTotals = computeBillingTotals(printableSubtotal, data?.billingSettings);
  const previewReceiptUrl = buildBillingPreviewUrl(effectiveSessionId, printableAllocations, debtorName, effectiveSessionId);

  const openPreviewReceipt = useCallback(() => {
    if (!previewReceiptUrl) {
      return;
    }

    saveBillingReceiptPreviewDraft({
      sessionId: effectiveSessionId,
      allocations: printableAllocations,
      debtorName,
    });
    router.push(previewReceiptUrl);
  }, [debtorName, effectiveSessionId, previewReceiptUrl, printableAllocations, router]);

  return (
    <MobileShell
      title="الحساب"
      topRight={
        <div className="flex gap-2">
          <Link href="/complaints" className={opsGhostButton}>شكاوى</Link>
          <Link href="/support?source=in_app&page=/billing" className={opsGhostButton}>دعم</Link>
        </div>
      }
      stickyFooter={
        <StickyActionBar>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1 text-right">
              <div className="text-xs font-semibold text-[#1e1712]">{current?.sessionLabel ?? 'اختر جلسة للحساب'}</div>
              <div className="mt-1 text-[11px] leading-5 text-[#7d6a59]">
                {selectedQtyTotal > 0 ? `المحدد ${selectedQtyTotal} • الإجمالي ${formatMoney(previewTotals.total)} ج` : 'حدد البنود المطلوبة للتحصيل أو الترحيل'}
              </div>
            </div>

            <div className="grid min-w-[13.5rem] grid-cols-2 gap-2">
              <button disabled={busy || selectedQtyTotal === 0} onClick={() => void settleCommand.run()} className={opsSuccessButton}>تحصيل المحدد</button>
              <button disabled={busy || !debtorName.trim() || selectedQtyTotal === 0} onClick={() => void deferCommand.run()} className={opsAccentButton}>ترحيل المحدد</button>
            </div>
          </div>
        </StickyActionBar>
      }
    >
      {effectiveError ? <div className="mb-3 rounded-[22px] border border-[#e6c7c2] bg-[#fff7f5] p-3 text-sm text-[#9a3e35]">{effectiveError}</div> : null}

      {lastTotals ? (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-[22px] border border-[#cfe0d7] bg-[#eff7f1] p-3 text-sm">
          <div className="text-right text-[#2e6a4e]">
            <div className="font-semibold">تم تسجيل العملية.</div>
            <div className="mt-1 text-xs">الإجمالي النهائي {formatMoney(lastTotals.total)} ج</div>
          </div>
          {lastReceiptUrl ? <Link href={lastReceiptUrl} className="rounded-[18px] border border-[#c0d8cb] px-4 py-2 text-sm font-semibold text-[#2e6a4e]">عرض المستند النهائي</Link> : null}
        </div>
      ) : null}

      <section className={[opsSurface, 'mb-3 p-3'].join(' ')}>
        <div className="flex items-start justify-between gap-3">
          <div className="text-right">
            <div className="text-sm font-semibold text-[#1e1712]">التحصيل والإقفال</div>
            <div className="mt-1 text-xs leading-6 text-[#7d6a59]">اختر الجلسة، حدّد البنود المطلوب تحصيلها، أو نفّذ الفاتورة الكاملة من الكارت الموجود أسفل الأصناف.</div>
          </div>
          <div className={opsBadge('accent')}>واجهة التحصيل</div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className={opsMetricCard('success')}><div className="text-[11px] font-semibold opacity-70">جلسات للحساب</div><div className="mt-1 text-xl font-black leading-none">{data?.sessions?.length ?? 0}</div></div>
          <div className={opsMetricCard('info')}><div className="text-[11px] font-semibold opacity-70">المحدد</div><div className="mt-1 text-xl font-black leading-none">{selectedQtyTotal}</div></div>
          <div className={opsMetricCard('accent')}><div className="text-[11px] font-semibold opacity-70">إجمالي المحدد</div><div className="mt-1 text-xl font-black leading-none">{formatMoney(previewTotals.total)}</div></div>
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
                onClick={() => selectSession(session.sessionId)}
                className={[
                  'rounded-[20px] border px-3 py-3 text-right transition',
                  effectiveSessionId === session.sessionId ? 'border-[#1e1712] bg-[#1e1712] text-white shadow-[0_14px_28px_rgba(30,23,18,0.16)]' : 'border-[#decebb] bg-[#fffdf8] text-[#1e1712]',
                ].join(' ')}
              >
                <div className="truncate text-sm font-bold">{session.sessionLabel}</div>
                <div className={['mt-1 text-xs', effectiveSessionId === session.sessionId ? 'text-white/75' : 'text-[#7d6a59]'].join(' ')}>{session.totalBillableQty} صنف • {session.totalBillableAmount} ج</div>
              </button>
            ))}
          </div>
        ) : (
          <div className={[opsDashed, 'p-3 text-sm text-[#6b5a4c]'].join(' ')}>لا توجد جلسات جاهزة للحساب الآن.</div>
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
        </div>
      ) : null}

      <section className={[opsSurface, 'mt-3 p-3'].join(' ')}>
        <div className="mb-3 text-right text-sm font-semibold text-[#3d3128]">الأصناف الجاهزة للحساب</div>

        {current?.items?.length ? (
          <div className="grid grid-cols-2 gap-2">
            {current.items.map((item) => {
              const selected = selectedQty[item.orderItemId] ?? 0;
              const parsedNotes = parseOrderItemNotes(item.notes);

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
                    {parsedNotes.addonSummary ? <span className={opsBadge('accent')}>إضافات: {parsedNotes.addonSummary}</span> : null}
                  </div>

                  {parsedNotes.freeformNotes ? <div className="mt-2 rounded-[16px] bg-[#fff8ef] px-3 py-2 text-right text-xs font-semibold text-[#6b5a4c]">{parsedNotes.freeformNotes}</div> : null}

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
          <div className={[opsDashed, 'p-3 text-sm text-[#6b5a4c]'].join(' ')}>لا يوجد عناصر جاهزة للحساب في هذه الجلسة.</div>
        )}
      </section>

      {current ? (
        <section className={[opsSurface, 'mt-3 p-3'].join(' ')}>
          <div className="flex items-start justify-between gap-3">
            <div className="text-right">
              <div className="text-sm font-semibold text-[#1e1712]">الفاتورة الكاملة</div>
              <div className="mt-1 text-xs leading-6 text-[#7d6a59]">هذا القسم يخص الفاتورة بالكامل، ويقع مباشرة أسفل الأصناف الجاهزة للحساب.</div>
            </div>
            <div className={opsBadge('accent')}>{printableQtyTotal} صنف</div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className={opsMetricCard('neutral')}><div className="text-[11px] font-semibold opacity-70">قبل الإضافات</div><div className="mt-1 text-lg font-black leading-none">{formatMoney(printableTotals.subtotal)} ج</div></div>
            <div className={opsMetricCard('success')}><div className="text-[11px] font-semibold opacity-70">الإجمالي</div><div className="mt-1 text-lg font-black leading-none">{formatMoney(printableTotals.total)} ج</div></div>
            <div className={opsMetricCard('info')}><div className="text-[11px] font-semibold opacity-70">الضريبة</div><div className="mt-1 text-lg font-black leading-none">{formatMoney(printableTotals.taxAmount)} ج</div></div>
            <div className={opsMetricCard('warning')}><div className="text-[11px] font-semibold opacity-70">الخدمة</div><div className="mt-1 text-lg font-black leading-none">{formatMoney(printableTotals.serviceAmount)} ج</div></div>
          </div>

          <div className={[opsInset, 'mt-3 p-3'].join(' ')}>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" disabled={busy || !previewReceiptUrl} onClick={openPreviewReceipt} className={opsGhostButton}>عرض المستند</button>
              <button type="button" disabled={busy || !previewReceiptUrl} onClick={openPreviewReceipt} className={opsPrimaryButton}>طباعة الفاتورة</button>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" disabled={busy || printableQtyTotal === 0} onClick={() => void settleFullCommand.run()} className={opsSuccessButton}>تحصيل الفاتورة بالكامل</button>
              <button type="button" disabled={busy || printableQtyTotal === 0 || !debtorName.trim()} onClick={() => void deferFullCommand.run()} className={opsAccentButton}>ترحيل الفاتورة بالكامل</button>
            </div>

            {!debtorName.trim() ? <div className="mt-2 text-right text-[11px] font-semibold text-[#7d6a59]">اكتب اسم الآجل أسفل هذا القسم لتفعيل ترحيل الفاتورة بالكامل.</div> : null}
          </div>
        </section>
      ) : null}

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
