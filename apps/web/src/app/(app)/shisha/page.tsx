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
} from '@/lib/ops/workspacePatches';
import { AccessDenied, ShiftRequired } from '@/ui/AccessState';
import { useOpsCommand, useOpsWorkspace } from '@/lib/ops/hooks';
import { ReadyDeliveryPanel } from '@/ui/ops/ReadyDeliveryPanel';
import { SessionRemakePanel } from '@/ui/ops/SessionRemakePanel';
import { StickyActionBar } from '@/ui/StickyActionBar';
import { clampPositive, readyItemsForStation, sessionItemsForSession } from '@/ui/ops/sessionHelpers';
import { playOpsNotificationSignal } from '@/lib/ops/notifications';
import { QuantityStepper } from '@/ui/ops/QuantityStepper';

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

  const stationLoader = useCallback(() => opsClient.stationWorkspace('shisha'), []);
  const waiterLoader = useCallback(() => opsClient.waiterWorkspace(), []);

  const { data: stationData, setData: setStationData, error: stationError } = useOpsWorkspace<StationWorkspace>(
    stationLoader,
    {
      enabled: Boolean(shift),
      pollIntervalMs: 1500,
    },
  );

  const { data: orderData, setData: setOrderData, error: orderError } = useOpsWorkspace<WaiterWorkspace>(waiterLoader, {
    enabled: Boolean(shift),
    pollIntervalMs: 1500,
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
      if (!orderData) return;
      if (!draftLines.length) return;

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
    return <AccessDenied title="الشيشة" message="هذه الصفحة للشيشة أو المشرف أو المعلم فقط." />;
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
    setSessionId(nextSessionId);
    setCreatingNew(false);
    setLabel('');
    setSessionWarning(null);
  }

  function beginNewSession() {
    setCreatingNew(true);
    setSessionId('');
    setLabel('');
    setDraft({});
    setSessionWarning(null);
  }

  const effectiveError = localError ?? stationError ?? orderError;

  return (
    <MobileShell
      title="الشيشة"
      topRight={
        <div className="flex gap-2">
          {can.owner || can.billing ? (
            <Link
              href="/complaints"
              className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
            >
              شكاوى
            </Link>
          ) : null}
          <Link
            href="/support?source=in_app&page=/shisha"
            className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
          >
            دعم
          </Link>
        </div>
      }
      stickyFooter={
        <StickyActionBar>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 text-right">
              <div className="text-sm font-semibold text-slate-900">
                {creatingNew ? 'جلسة شيشة جديدة' : currentSessionLabel || 'اختر جلسة شيشة'}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {draftQtyTotal > 0 ? `إجمالي المحدد ${draftQtyTotal}` : 'اختر أصناف الشيشة ثم أرسل مرة واحدة'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void submitCommand.run()}
              disabled={submitCommand.busy || draftLines.length === 0 || (!creatingNew && !effectiveSessionId)}
              className="shrink-0 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {submitCommand.busy ? '...' : creatingNew ? 'فتح وإرسال' : 'إرسال'}
            </button>
          </div>
        </StickyActionBar>
      }
    >
      {effectiveError ? (
        <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {effectiveError}
        </div>
      ) : null}

      {sessionWarning ? (
        <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
          {sessionWarning}
        </div>
      ) : null}

      <div className="mb-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-right text-xs font-semibold text-slate-600">
        اختر جلسة شيشة أو أنشئ جلسة جديدة ثم أضف الأصناف.
      </div>

      <div className="space-y-3">
        <section id="sessions-panel" className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {sessions.length ? (
                <div className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                  {sessions.length}
                </div>
              ) : null}
              <div className="text-sm font-semibold text-slate-800">جلسات الشيشة المفتوحة</div>
            </div>
            <button
              type="button"
              onClick={beginNewSession}
              className="rounded-2xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm"
            >
              + جلسة شيشة جديدة
            </button>
          </div>

          {sessions.length ? (
            <div className="grid grid-cols-2 gap-2">
              {sessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => selectExistingSession(session.id)}
                  className={[
                    'rounded-2xl border px-3 py-3 text-right',
                    !creatingNew && effectiveSessionId === session.id
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-slate-50 text-slate-800',
                  ].join(' ')}
                >
                  <div className="truncate text-sm font-bold">{session.label}</div>
                  <div
                    className={[
                      'mt-1 text-xs',
                      !creatingNew && effectiveSessionId === session.id ? 'text-slate-200' : 'text-slate-500',
                    ].join(' ')}
                  >
                    جاهز {session.readyCount} • للحساب {session.billableCount}
                  </div>
                </button>
              ))}
            </div>
          ) : null}

          {creatingNew ? (
            <div className="mt-3 space-y-2">
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="اسم أو رقم الجلسة الجديدة"
                className="w-full rounded-2xl border border-slate-200 px-3 py-3 text-right"
              />
              <div className="text-xs text-slate-500">يمكن ترك الاسم فارغًا ليولده النظام تلقائيًا.</div>
            </div>
          ) : null}

          {!sessions.length && !creatingNew ? (
            <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              لا توجد جلسات شيشة مفتوحة الآن.
            </div>
          ) : null}

          {!sections.length ? (
            <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              لا توجد أقسام منيو شيشة متاحة الآن.
            </div>
          ) : null}
        </section>

        <section id="menu-panel" className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-slate-800">منيو الشيشة</div>
            {creatingNew ? (
              <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                جلسة جديدة
              </div>
            ) : currentSessionLabel ? (
              <div className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                {currentSessionLabel}
              </div>
            ) : null}
          </div>

          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => setSelectedSectionId(section.id)}
                className={[
                  'rounded-2xl border px-3 py-2 text-sm font-semibold whitespace-nowrap',
                  effectiveSelectedSectionId === section.id
                    ? 'border-emerald-600 bg-emerald-600 text-white'
                    : 'border-slate-200 bg-slate-50 text-slate-700',
                ].join(' ')}
              >
                {section.title}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {filteredProducts.map((product) => (
              <div key={product.id} className="rounded-2xl border border-slate-200 p-3">
                <div className="text-sm font-semibold text-slate-900">{product.name}</div>
                <div className="mt-1 text-xs text-slate-500">{product.unitPrice}</div>
                <div className="mt-3 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => dec(product.id)}
                    className="h-10 w-10 rounded-2xl border border-slate-200"
                  >
                    -
                  </button>
                  <div className="text-lg font-bold">{draft[product.id] ?? 0}</div>
                  <button
                    type="button"
                    onClick={() => inc(product.id)}
                    className="h-10 w-10 rounded-2xl bg-slate-900 text-white"
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="queue-panel" className="space-y-3">
          {queue.map((item) => {
            const qty = Math.max(1, Math.min(queueSelection[item.orderItemId] ?? 1, item.qtyWaiting));
            return (
              <div key={item.orderItemId} className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 text-right">
                    <div className="text-xs font-semibold text-slate-500">{item.sessionLabel}</div>
                    <div className="mt-1 text-base font-bold text-slate-900">{item.productName}</div>
                  </div>
                  <div className="rounded-2xl bg-slate-900 px-3 py-2 text-center text-white">
                    <div className="text-[10px] font-semibold text-white/70">الكمية</div>
                    <div className="text-xl font-black leading-none">{item.qtyWaiting}</div>
                  </div>
                </div>

                {item.qtyWaitingReplacement > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                    <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">
                      إعادة مجانية {item.qtyWaitingReplacement}
                    </span>
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
                    className="rounded-2xl border border-slate-200 px-3 py-3 font-semibold text-slate-700 disabled:opacity-40"
                  >
                    تجهيز المحدد
                  </button>
                  <button
                    type="button"
                    disabled={readyCommand.busy}
                    onClick={() => void readyCommand.run(item, item.qtyWaiting)}
                    className="rounded-2xl bg-slate-900 px-3 py-3 font-semibold text-white disabled:opacity-40"
                  >
                    تجهيز الكل
                  </button>
                </div>
              </div>
            );
          })}

          {!queue.length ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
              لا يوجد طلبات شيشة الآن.
            </div>
          ) : null}
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
            emptyLabel="لا يوجد شيشة جاهزة للتسليم"
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
      </div>
    </MobileShell>
  );
}