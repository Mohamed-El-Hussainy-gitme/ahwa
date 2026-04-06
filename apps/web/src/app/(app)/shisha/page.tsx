'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MobileShell } from '@/ui/MobileShell';
import { useAuthz } from '@/lib/authz';
import { opsClient } from '@/lib/ops/client';
import type { SessionOrderItem, StationQueueItem, StationWorkspace, WaiterWorkspace } from '@/lib/ops/types';
import {
  appendOrTouchSession,
  applyDeliverToWaiterWorkspace,
  applyReadyToStationWorkspace,
  applyReadyToWaiterWorkspace,
  applyRealtimeEventToStationWorkspace,
  applyRealtimeEventToWaiterWorkspace,
} from '@/lib/ops/workspacePatches';
import { AccessDenied, ShiftRequired } from '@/ui/AccessState';
import { useOpsCommand, useOpsWorkspace } from '@/lib/ops/hooks';
import { SHISHA_POLL_INTERVAL_MS, shouldReloadStationWorkspace, shouldReloadWaiterWorkspace } from '@/lib/ops/reload-rules';
import { ReadyDeliveryPanel } from '@/ui/ops/ReadyDeliveryPanel';
import { SessionRemakePanel } from '@/ui/ops/SessionRemakePanel';
import { StickyActionBar } from '@/ui/StickyActionBar';
import { clampPositive, readyItemsForStation, sessionItemsForSession } from '@/ui/ops/sessionHelpers';
import { playOpsNotificationSignal } from '@/lib/ops/notifications';
import { QuantityStepper } from '@/ui/ops/QuantityStepper';
import {
  opsAccentButton,
  opsAlert,
  opsBadge,
  opsEmptyState,
  opsGhostButton,
  opsPrimaryButton,
  opsSectionTitle,
  opsSurface,
} from '@/ui/ops/premiumStyles';

export default function ShishaPage() {
  const { can, shift, effectiveRole } = useAuthz();
  const [localError, setLocalError] = useState<string | null>(null);
  const [queueSelection, setQueueSelection] = useState<Record<string, number>>({});
  const [readySelection, setReadySelection] = useState<Record<string, number>>({});
  const [remakeSelection, setRemakeSelection] = useState<Record<string, number>>({});
  const [label, setLabel] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [creatingNew, setCreatingNew] = useState(false);
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [sessionWarning, setSessionWarning] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerLabel, setComposerLabel] = useState('');
  const composerInputRef = useRef<HTMLInputElement | null>(null);

  const stationLoader = useCallback(() => opsClient.stationWorkspace('shisha'), []);
  const waiterLoader = useCallback(() => opsClient.waiterWorkspace(), []);

  const { data: stationData, setData: setStationData, error: stationError } = useOpsWorkspace<StationWorkspace>(
    stationLoader,
    {
      enabled: Boolean(shift),
      pollIntervalMs: SHISHA_POLL_INTERVAL_MS,
      shouldReloadOnEvent: (event) => shouldReloadStationWorkspace('shisha', event),
      applyRealtimeEvent: applyRealtimeEventToStationWorkspace,
    },
  );

  const { data: orderData, setData: setOrderData, error: orderError } = useOpsWorkspace<WaiterWorkspace>(waiterLoader, {
    enabled: Boolean(shift),
    pollIntervalMs: SHISHA_POLL_INTERVAL_MS,
    shouldReloadOnEvent: shouldReloadWaiterWorkspace,
    applyRealtimeEvent: applyRealtimeEventToWaiterWorkspace,
  });

  const previousQueueQtyRef = useRef(0);

  const queue = stationData?.queue ?? [];
  const sessions = orderData?.sessions ?? [];
  const sections = (orderData?.sections ?? []).filter((section) => section.stationCode === 'shisha');
  const products = (orderData?.products ?? []).filter((product) => product.stationCode === 'shisha');
  const effectiveSessionId = !creatingNew ? sessionId || sessions[0]?.id || '' : '';
  const effectiveSelectedSectionId = selectedSectionId || sections[0]?.id || '';
  const filteredProducts = products.filter(
    (product) => !effectiveSelectedSectionId || product.sectionId === effectiveSelectedSectionId,
  );
  const readyItems = readyItemsForStation(orderData?.readyItems ?? [], 'shisha');
  const currentSessionItems = useMemo(
    () => sessionItemsForSession(orderData?.sessionItems ?? [], effectiveSessionId, 'shisha'),
    [orderData?.sessionItems, effectiveSessionId],
  );
  const draftLines = Object.entries(draft).filter(([, quantity]) => quantity > 0);
  const draftQtyTotal = draftLines.reduce((sum, [, quantity]) => sum + quantity, 0);
  const currentSessionLabel = sessions.find((session) => session.id === effectiveSessionId)?.label ?? '';
  const canManageComplaintActions = can.owner || can.billing;

  const totalQueueWaiting = queue.reduce((sum, item) => sum + item.qtyWaiting, 0);

  useEffect(() => {
    if (document.visibilityState !== 'visible') {
      previousQueueQtyRef.current = totalQueueWaiting;
      return;
    }
    if (effectiveRole === 'shisha' && totalQueueWaiting > previousQueueQtyRef.current) {
      void playOpsNotificationSignal('station-order');
    }
    previousQueueQtyRef.current = totalQueueWaiting;
  }, [effectiveRole, totalQueueWaiting]);

  useEffect(() => {
    if (creatingNew || effectiveSessionId) {
      setSessionWarning(null);
    }
  }, [creatingNew, effectiveSessionId]);

  useEffect(() => {
    if (!composerOpen) return;
    const id = window.setTimeout(() => composerInputRef.current?.focus(), 120);
    return () => window.clearTimeout(id);
  }, [composerOpen]);

  const readyCommand = useOpsCommand(
    async (item: StationQueueItem, quantity: number) => {
      await opsClient.markReady(item.orderItemId, quantity);
      setQueueSelection((state) => ({ ...state, [item.orderItemId]: 1 }));
      setStationData((current) => applyReadyToStationWorkspace(current, item, quantity));
      setOrderData((current) => applyReadyToWaiterWorkspace(current, item, quantity));
    },
    { onError: setLocalError },
  );

  const deliverCommand = useOpsCommand(
    async (orderItemId: string, quantity: number) => {
      await opsClient.deliver(orderItemId, quantity);
      setReadySelection((state) => ({ ...state, [orderItemId]: 1 }));
      setOrderData((current) => applyDeliverToWaiterWorkspace(current, orderItemId, quantity));
    },
    { onError: setLocalError },
  );

  const remakeCommand = useOpsCommand(
    async (item: SessionOrderItem, quantity: number, notes?: string) => {
      await opsClient.createComplaint({
        serviceSessionId: item.serviceSessionId,
        orderItemId: item.orderItemId,
        complaintKind: 'quality_issue',
        quantity,
        notes,
        action: 'remake',
      });
      setRemakeSelection((state) => ({ ...state, [item.orderItemId]: 1 }));
    },
    { onError: setLocalError },
  );

  const submitCommand = useOpsCommand(
    async () => {
      if (!orderData || !draftLines.length) return;

      if (creatingNew || !effectiveSessionId) {
        const created = await opsClient.openAndCreateOrder({
          label: label || undefined,
          items: draftLines.map(([productId, quantity]) => ({ productId, quantity })),
        });
        setSessionId(created.sessionId);
        setCreatingNew(false);
        setOrderData((current) => appendOrTouchSession(current, created.sessionId, created.label));
      } else {
        await opsClient.createOrderWithItems({
          serviceSessionId: effectiveSessionId,
          items: draftLines.map(([productId, quantity]) => ({ productId, quantity })),
        });
      }

      setDraft({});
      setLabel('');
    },
    { onError: setLocalError },
  );

  if (!shift) return <ShiftRequired title="الشيشة" />;
  if (!(can.owner || effectiveRole === 'shisha' || effectiveRole === 'supervisor')) {
    return <AccessDenied title="الشيشة" message="هذه الصفحة لمختص الشيشة أو مشرف التشغيل أو المالك فقط." />;
  }

  function warnSessionRequired() {
    setSessionWarning('اختر جلسة شيشة أو أنشئ جلسة جديدة أولًا ثم أضف الأصناف.');
    document.getElementById('sessions-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function setQueueQty(orderItemId: string, qty: number, max: number) {
    setQueueSelection((state) => ({
      ...state,
      [orderItemId]: clampPositive(qty, max),
    }));
  }

  function inc(id: string) {
    if (composerOpen) return;
    if (!creatingNew && !effectiveSessionId) {
      warnSessionRequired();
      return;
    }
    setDraft((state) => ({ ...state, [id]: (state[id] ?? 0) + 1 }));
  }

  function dec(id: string) {
    setDraft((state) => {
      const next = { ...state };
      const value = (next[id] ?? 0) - 1;
      if (value <= 0) delete next[id];
      else next[id] = value;
      return next;
    });
  }

  function selectExistingSession(nextSessionId: string) {
    if (composerOpen || submitCommand.busy) return;
    setSessionId(nextSessionId);
    setCreatingNew(false);
    setLabel('');
    setSessionWarning(null);
  }

  function beginNewSession() {
    if (submitCommand.busy) return;
    setComposerLabel(label);
    setComposerOpen(true);
    setSessionWarning(null);
  }

  function cancelComposer() {
    setComposerOpen(false);
    if (!draftQtyTotal) {
      setCreatingNew(false);
    }
  }

  function confirmComposer() {
    setCreatingNew(true);
    setSessionId('');
    setLabel(composerLabel.trim());
    setSessionWarning(null);
    setComposerOpen(false);
  }

  const effectiveError = localError ?? stationError ?? orderError;

  return (
    <MobileShell
      title="الشيشة"
      topRight={
        <div className="flex gap-2">
          {can.owner || can.billing ? (
            <Link href="/complaints" className={opsGhostButton}>
              شكاوى
            </Link>
          ) : null}
          <Link href="/support?source=in_app&page=/shisha" className={opsGhostButton}>
            دعم
          </Link>
        </div>
      }
      stickyFooter={
        <StickyActionBar>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 text-right">
              <div className="text-sm font-semibold text-[#1e1712]">
                {creatingNew ? 'جلسة شيشة جديدة' : currentSessionLabel || 'اختر جلسة شيشة'}
              </div>
              <div className="mt-1 text-xs text-[#7d6a59]">
                {draftQtyTotal > 0 ? `إجمالي المحدد ${draftQtyTotal}` : 'اختر أصناف الشيشة ثم أرسل الطلب دفعة واحدة'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void submitCommand.run()}
              disabled={submitCommand.busy || draftLines.length === 0 || (!creatingNew && !effectiveSessionId)}
              className={[opsPrimaryButton, 'shrink-0'].join(' ')}
            >
              {submitCommand.busy ? 'جارٍ الإرسال...' : creatingNew ? 'فتح وإرسال' : 'إرسال'}
            </button>
          </div>
        </StickyActionBar>
      }
    >
      {effectiveError ? <div className={`mb-3 ${opsAlert('danger')}`}>{effectiveError}</div> : null}
      {sessionWarning ? <div className={`mb-3 ${opsAlert('warning')} font-semibold`}>{sessionWarning}</div> : null}

      <div className="mb-3 rounded-[22px] border border-[#e0d1bf] bg-[#f7efe4] px-3 py-2 text-right text-xs font-semibold text-[#6b5a4c]">
        اختر جلسة شيشة أو أنشئ جلسة جديدة ثم أضف الأصناف.
      </div>

      <div className="space-y-3">
        <section id="sessions-panel" className={`${opsSurface} p-3`}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {sessions.length ? <div className={opsBadge('info')}>{sessions.length}</div> : null}
              <div className={opsSectionTitle}>جلسات الشيشة المفتوحة</div>
            </div>
            <button type="button" onClick={beginNewSession} className={opsAccentButton}>
              + جلسة شيشة جديدة
            </button>
          </div>

          {sessions.length ? (
            <div className="grid grid-cols-2 gap-2">
              {sessions.map((session) => {
                const active = !creatingNew && effectiveSessionId === session.id;
                return (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => selectExistingSession(session.id)}
                    disabled={composerOpen || submitCommand.busy}
                    className={[
                      'rounded-[20px] border px-3 py-3 text-right transition duration-150 hover:-translate-y-[1px]',
                      active
                        ? 'border-[#1e1712] bg-[#1e1712] text-white shadow-[0_14px_28px_rgba(30,23,18,0.16)]'
                        : 'border-[#decdb9] bg-[#f8f1e7] text-[#2f241b] hover:bg-[#f3e8da]',
                    ].join(' ')}
                  >
                    <div className="truncate text-sm font-bold">{session.label}</div>
                    <div className={['mt-1 text-xs', active ? 'text-white/75' : 'text-[#8a7763]'].join(' ')}>
                      جاهز {session.readyCount} • للحساب {session.billableCount}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}

          {!sessions.length && !creatingNew ? <div className={`mt-3 ${opsEmptyState()}`}>لا توجد جلسات شيشة مفتوحة الآن.</div> : null}
          {!sections.length ? <div className={`mt-3 ${opsEmptyState('warning')}`}>لا توجد أقسام منيو شيشة متاحة الآن.</div> : null}
        </section>

        <section id="menu-panel" className={`${opsSurface} p-3`}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className={opsSectionTitle}>منيو الشيشة</div>
            {creatingNew ? (
              <div className={opsBadge('accent')}>جلسة جديدة</div>
            ) : currentSessionLabel ? (
              <div className={opsBadge('info')}>{currentSessionLabel}</div>
            ) : null}
          </div>

          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => setSelectedSectionId(section.id)}
                className={[
                  'rounded-[18px] border px-3 py-2 text-sm font-semibold whitespace-nowrap transition duration-150',
                  effectiveSelectedSectionId === section.id
                    ? 'border-[#9b6b2e] bg-[#9b6b2e] text-white shadow-[0_12px_24px_rgba(155,107,46,0.18)]'
                    : 'border-[#dac9b6] bg-[#fffaf3] text-[#5e4d3f] hover:bg-[#f4eadc]',
                ].join(' ')}
              >
                {section.title}
              </button>
            ))}
          </div>

          {filteredProducts.length ? (
            <div className="grid grid-cols-2 gap-2">
              {filteredProducts.map((product) => (
                <div key={product.id} className="rounded-[20px] border border-[#e1d4c4] bg-[#fffdf8] p-3 shadow-[0_8px_24px_rgba(30,23,18,0.05)]">
                  <div className="text-sm font-semibold text-[#1e1712]">{product.name}</div>
                  <div className="mt-1 text-xs text-[#7d6a59]">{product.unitPrice}</div>
                  <div className="mt-3 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => dec(product.id)}
                      className="h-10 w-10 rounded-[16px] border border-[#d8c7b3] bg-white text-lg font-bold text-[#5e4d3f] transition duration-150 hover:-translate-y-[1px]"
                    >
                      -
                    </button>
                    <div className="text-lg font-black text-[#1e1712]">{draft[product.id] ?? 0}</div>
                    <button
                      type="button"
                      onClick={() => inc(product.id)}
                      className="h-10 w-10 rounded-[16px] bg-[#1e1712] text-lg font-bold text-white transition duration-150 hover:-translate-y-[1px]"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={opsEmptyState('accent')}>لا توجد أصناف ظاهرة في هذا القسم الآن.</div>
          )}
        </section>

        <section id="queue-panel" className="space-y-3">
          {queue.map((item) => {
            const qty = Math.max(1, Math.min(queueSelection[item.orderItemId] ?? 1, item.qtyWaiting));
            return (
              <div key={item.orderItemId} className={`${opsSurface} p-3`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 text-right">
                    <div className="text-xs font-semibold text-[#8d7967]">{item.sessionLabel}</div>
                    <div className="mt-1 text-base font-bold text-[#1e1712]">{item.productName}</div>
                  </div>
                  <div className="rounded-[18px] bg-[#1e1712] px-3 py-2 text-center text-white shadow-[0_12px_24px_rgba(30,23,18,0.14)]">
                    <div className="text-[10px] font-semibold text-white/75">الكمية</div>
                    <div className="text-xl font-black leading-none">{item.qtyWaiting}</div>
                  </div>
                </div>

                {item.qtyWaitingReplacement > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                    <span className={opsBadge('warning')}>إعادة مجانية {item.qtyWaitingReplacement}</span>
                  </div>
                ) : null}

                <QuantityStepper
                  label="تجهيز الآن"
                  value={qty}
                  onDecrement={() => setQueueQty(item.orderItemId, qty - 1, item.qtyWaiting)}
                  onIncrement={() => setQueueQty(item.orderItemId, qty + 1, item.qtyWaiting)}
                />

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={readyCommand.busy}
                    onClick={() => void readyCommand.run(item, qty)}
                    className={opsGhostButton}
                  >
                    تجهيز المحدد
                  </button>
                  <button
                    type="button"
                    disabled={readyCommand.busy}
                    onClick={() => void readyCommand.run(item, item.qtyWaiting)}
                    className={opsPrimaryButton}
                  >
                    تجهيز الكل
                  </button>
                </div>
              </div>
            );
          })}

          {!queue.length ? <div className={opsEmptyState()}>لا توجد طلبات شيشة الآن.</div> : null}
        </section>

        <section id="ready-panel">
          <ReadyDeliveryPanel
            title="جاهز لتسليم الشيشة"
            items={readyItems}
            selectedQty={readySelection}
            onChangeQty={(orderItemId, nextQty, maxQty) => {
              setReadySelection((state) => ({ ...state, [orderItemId]: clampPositive(nextQty, maxQty) }));
            }}
            onDeliver={(orderItemId, quantity) => deliverCommand.run(orderItemId, quantity)}
            busy={deliverCommand.busy}
            emptyLabel="لا توجد شيشة جاهزة للتسليم الآن."
            compact
          />
        </section>

        {canManageComplaintActions ? (
          <section id="session-items-panel">
            <SessionRemakePanel
              title="أصناف جلسة الشيشة الحالية"
              items={currentSessionItems}
              selectedQty={remakeSelection}
              onChangeQty={(orderItemId, nextQty, maxQty) => {
                setRemakeSelection((state) => ({ ...state, [orderItemId]: clampPositive(nextQty, maxQty) }));
              }}
              onRemake={(item, quantity, notes) => remakeCommand.run(item, quantity, notes)}
              busy={remakeCommand.busy}
              emptyLabel={effectiveSessionId ? 'لا توجد أصناف شيشة في الجلسة الحالية.' : 'اختر جلسة أولًا.'}
              compact
            />
          </section>
        ) : null}
      {composerOpen ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[#1e1712]/30 p-4">
          <div className="w-full max-w-md rounded-[28px] border border-[#eadcca] bg-[#fffdf8] p-5 shadow-[0_26px_60px_rgba(30,23,18,0.22)]">
            <div className="text-right">
              <div className="text-base font-black text-[#1e1712]">تعريف جلسة شيشة جديدة</div>
              <div className="mt-1 text-sm text-[#7d6a59]">اكتب اسمًا أو رقمًا واضحًا للجلسة لتسهيل العودة إليها أثناء التشغيل.</div>
            </div>
            <input
              ref={composerInputRef}
              value={composerLabel}
              onChange={(e) => setComposerLabel(e.target.value)}
              placeholder="مثال: طاولة 7 أو أحمد"
              className="mt-4 w-full rounded-[18px] border border-[#d7c7b2] bg-[#fffdf9] px-3 py-3 text-right text-[#1e1712] placeholder:text-[#a08a75]"
            />
            <div className="mt-2 text-right text-xs text-[#7d6a59]">يمكن ترك الاسم فارغًا ليولد النظام اسمًا تلقائيًا.</div>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={cancelComposer} className={[opsGhostButton, 'flex-1 justify-center'].join(' ')}>
                إلغاء
              </button>
              <button type="button" onClick={confirmComposer} className={[opsPrimaryButton, 'flex-1 justify-center'].join(' ')}>
                اعتماد الجلسة
              </button>
            </div>
          </div>
        </div>
      ) : null}
      </div>
    </MobileShell>
  );
}
