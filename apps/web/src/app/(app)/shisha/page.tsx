'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { MobileShell } from '@/ui/MobileShell';
import { useAuthz } from '@/lib/authz';
import { opsClient } from '@/lib/ops/client';
import type { SessionOrderItem, StationWorkspace, WaiterWorkspace } from '@/lib/ops/types';
import { AccessDenied, ShiftRequired } from '@/ui/AccessState';
import { useOpsCommand, useOpsPendingCommand, useOpsWorkspace } from '@/lib/ops/hooks';
import { ReadyDeliveryPanel } from '@/ui/ops/ReadyDeliveryPanel';
import { SessionRemakePanel } from '@/ui/ops/SessionRemakePanel';
import { InlineSessionComplaintComposer } from '@/ui/ops/InlineSessionComplaintComposer';
import { StickyActionBar } from '@/ui/StickyActionBar';
import { clampPositive, readyItemsForStation, sessionItemsForSession } from '@/ui/ops/sessionHelpers';
import { useOpsChrome } from '@/lib/ops/chrome';
import { QueueHealthStrip } from '@/ui/ops/QueueHealthStrip';
import { OPS_SCOPE_STATION_SHISHA, OPS_SCOPE_WAITER } from '@/lib/ops/workspaceScopes';
import {
  patchStationReady,
  patchStationRemakeRequested,
  patchWaiterDelivered,
  patchWaiterOrderSubmitted,
  patchWaiterReady,
  patchWaiterRemakeRequested,
  rebindWaiterSession,
} from '@/lib/ops/workspacePatches';

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

  const stationLoader = useCallback(() => opsClient.stationWorkspace('shisha'), []);
  const waiterLoader = useCallback(() => opsClient.waiterWorkspace(), []);
  const { data: stationData, setData: setStationData, error: stationError } = useOpsWorkspace<StationWorkspace>(stationLoader, {
    enabled: Boolean(shift),
    scopes: [OPS_SCOPE_STATION_SHISHA],
  });
  const { data: orderData, setData: setOrderData, error: orderError } = useOpsWorkspace<WaiterWorkspace>(waiterLoader, {
    enabled: Boolean(shift),
    scopes: [OPS_SCOPE_WAITER],
  });
  const { summary } = useOpsChrome();

  const queue = stationData?.queue ?? [];
  const sessions = orderData?.sessions ?? [];
  const sections = (orderData?.sections ?? []).filter((section) => section.stationCode === 'shisha');
  const products = (orderData?.products ?? []).filter((product) => product.stationCode === 'shisha');
  const effectiveSessionId = !creatingNew ? (sessionId || sessions[0]?.id || '') : '';
  const effectiveSelectedSectionId = selectedSectionId || sections[0]?.id || '';
  const filteredProducts = products.filter((product) => !effectiveSelectedSectionId || product.sectionId === effectiveSelectedSectionId);
  const readyItems = readyItemsForStation(orderData?.readyItems ?? [], 'shisha');
  const currentSessionItems = useMemo(
    () => sessionItemsForSession(orderData?.sessionItems ?? [], effectiveSessionId, 'shisha'),
    [orderData?.sessionItems, effectiveSessionId],
  );
  const draftLines = Object.entries(draft).filter(([, quantity]) => quantity > 0);
  const draftQtyTotal = draftLines.reduce((sum, [, quantity]) => sum + quantity, 0);
  const currentSessionLabel = sessions.find((session) => session.id === effectiveSessionId)?.label ?? '';
  const canManageComplaintActions = can.owner || can.billing;

  const readyCommand = useOpsPendingCommand(
    (orderItemId: string, _quantity: number) => orderItemId,
    async (orderItemId: string, quantity: number) => {
      const previousStationData = stationData;
      const previousOrderData = orderData;
      setStationData((current) => (current ? patchStationReady(current, orderItemId, quantity) : current));
      setOrderData((current) => (current ? patchWaiterReady(current, orderItemId, quantity) : current));
      setQueueSelection((state) => ({ ...state, [orderItemId]: 1 }));
      try {
        await opsClient.markReady(orderItemId, quantity);
      } catch (commandError) {
        setStationData(previousStationData);
        setOrderData(previousOrderData);
        throw commandError;
      }
    },
    { onError: setLocalError },
  );

  const deliverCommand = useOpsPendingCommand(
    (orderItemId: string, _quantity: number) => orderItemId,
    async (orderItemId: string, quantity: number) => {
      const previousOrderData = orderData;
      setOrderData((current) => (current ? patchWaiterDelivered(current, orderItemId, quantity) : current));
      setReadySelection((state) => ({ ...state, [orderItemId]: 1 }));
      try {
        await opsClient.deliver(orderItemId, quantity);
      } catch (commandError) {
        setOrderData(previousOrderData);
        throw commandError;
      }
    },
    { onError: setLocalError },
  );

  const remakeCommand = useOpsPendingCommand(
    (item: SessionOrderItem, _quantity: number, _notes?: string) => item.orderItemId,
    async (item: SessionOrderItem, quantity: number, notes?: string) => {
      const previousStationData = stationData;
      const previousOrderData = orderData;
      setOrderData((current) => (current ? patchWaiterRemakeRequested(current, item.orderItemId, quantity) : current));
      setStationData((current) => (current
        ? patchStationRemakeRequested(current, {
            orderItemId: item.orderItemId,
            quantity,
            fallback: item,
          })
        : current));
      setRemakeSelection((state) => ({ ...state, [item.orderItemId]: 1 }));
      try {
        await opsClient.createComplaint({
          serviceSessionId: item.serviceSessionId,
          orderItemId: item.orderItemId,
          complaintKind: 'quality_issue',
          quantity,
          notes,
          action: 'remake',
        });
      } catch (commandError) {
        setStationData(previousStationData);
        setOrderData(previousOrderData);
        throw commandError;
      }
    },
    { onError: setLocalError },
  );

  const submitCommand = useOpsCommand(
    async () => {
      if (!orderData) return;
      if (!draftLines.length) return;

      const target = creatingNew || !effectiveSessionId
        ? null
        : {
            sessionId: effectiveSessionId,
            label: orderData.sessions.find((session) => session.id === effectiveSessionId)?.label ?? label,
          };

      const previousOrderData = orderData;
      const optimisticSessionId = target?.sessionId ?? `temp-session:${Date.now()}`;
      const optimisticLabel = target?.label ?? (label.trim() || 'جلسة جديدة');
      setSessionId(optimisticSessionId);
      setCreatingNew(false);
      setOrderData((current) => (current
        ? patchWaiterOrderSubmitted(current, {
            serviceSessionId: optimisticSessionId,
            sessionLabel: optimisticLabel,
            items: draftLines.map(([productId, quantity]) => ({ productId, quantity })),
          })
        : current));
      setDraft({});
      setLabel('');

      try {
        if (target) {
          await opsClient.createOrderWithItems({
            serviceSessionId: target.sessionId,
            items: draftLines.map(([productId, quantity]) => ({ productId, quantity })),
          });
        } else {
          const created = await opsClient.openSessionAndCreateOrder({
            label: label || undefined,
            items: draftLines.map(([productId, quantity]) => ({ productId, quantity })),
          });
          setSessionId(created.sessionId);
          setOrderData((current) => (current ? rebindWaiterSession(current, {
            fromSessionId: optimisticSessionId,
            toSessionId: created.sessionId,
            sessionLabel: created.label,
          }) : current));
        }
      } catch (commandError) {
        setOrderData(previousOrderData);
        setDraft(Object.fromEntries(draftLines));
        if (creatingNew || !effectiveSessionId) {
          setCreatingNew(true);
          setSessionId('');
          setLabel(label);
        }
        throw commandError;
      }
    },
    { onError: setLocalError },
  );

  if (!shift) return <ShiftRequired title="الشيشة" />;
  if (!(can.owner || effectiveRole === 'shisha' || effectiveRole === 'supervisor')) {
    return <AccessDenied title="الشيشة" message="هذه الصفحة للشيشة أو المشرف أو المعلم فقط." />;
  }

  function setQueueQty(orderItemId: string, qty: number, max: number) {
    setQueueSelection((state) => ({
      ...state,
      [orderItemId]: clampPositive(qty, max),
    }));
  }

  function inc(id: string) {
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
  }

  function beginNewSession() {
    setCreatingNew(true);
    setSessionId('');
    setLabel('');
    setDraft({});
  }

  const effectiveError = localError ?? stationError ?? orderError;

  return (
    <MobileShell
      title="الشيشة"
      topRight={
        <div className="flex gap-2">
          {(can.owner || can.billing) ? <Link href="/complaints" className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">شكاوى</Link> : null}
          <Link href="/support?source=in_app&page=/shisha" className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">دعم</Link>
        </div>
      }
      stickyFooter={
        <StickyActionBar>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 text-right">
              <div className="text-sm font-semibold text-slate-900">{creatingNew ? 'جلسة شيشة جديدة' : currentSessionLabel || 'اختر جلسة شيشة'}</div>
              <div className="mt-1 text-xs text-slate-500">{draftQtyTotal > 0 ? `إجمالي المحدد ${draftQtyTotal}` : 'اختر أصناف الشيشة ثم أرسل مرة واحدة'}</div>
            </div>
            <button
              onClick={() => void submitCommand.run()}
              disabled={submitCommand.busy || draftLines.length === 0 || (!creatingNew && !effectiveSessionId)}
              className="shrink-0 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {submitCommand.busy ? 'جارٍ الإرسال' : creatingNew ? 'فتح وإرسال' : 'إرسال'}
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

      <div className="space-y-3">
        <QueueHealthStrip health={summary?.queueHealth ?? null} />
        <div className="rounded-2xl border border-slate-200 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-slate-700">جلسات الشيشة</div>
            <button
              onClick={beginNewSession}
              className={[
                'rounded-2xl px-3 py-2 text-sm font-semibold',
                creatingNew
                  ? 'bg-emerald-600 text-white'
                  : 'border border-slate-200 bg-white text-slate-800',
              ].join(' ')}
            >
              + جلسة شيشة جديدة
            </button>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => selectExistingSession(session.id)}
                className={[
                  'rounded-2xl border px-3 py-2 text-sm font-semibold whitespace-nowrap',
                  !creatingNew && effectiveSessionId === session.id
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white text-slate-800',
                ].join(' ')}
              >
                {session.label}
              </button>
            ))}
          </div>

          {creatingNew ? (
            <div className="mt-3 space-y-2">
              <div className="text-xs text-slate-500">ابدأ باسم أو رقم الجلسة، ثم اختر أصناف قسم الشيشة فقط واضغط إرسال.</div>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="اسم أو رقم الجلسة الجديدة"
                className="w-full rounded-2xl border border-slate-200 px-3 py-3 text-right"
              />
            </div>
          ) : currentSessionLabel ? (
            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
              الجلسة الحالية: <span className="font-semibold">{currentSessionLabel}</span>
            </div>
          ) : null}

          {!sessions.length && !creatingNew ? (
            <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              لا توجد جلسات شيشة مفتوحة الآن. ابدأ بجلسة جديدة أو اختر جلسة قائمة لتكمل عليها.
            </div>
          ) : null}

          {!creatingNew && effectiveSessionId ? (
            <InlineSessionComplaintComposer
              sessionId={effectiveSessionId}
              sessionLabel={currentSessionLabel}
              busy={submitCommand.busy}
              onSubmit={async ({ serviceSessionId, complaintKind, notes }) => {
                await opsClient.createComplaint({
                  mode: 'general',
                  serviceSessionId,
                  complaintKind,
                  notes,
                  action: 'none',
                });
              }}
            />
          ) : null}
        </div>

        <div className="rounded-2xl border border-slate-200 p-3">
          <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setSelectedSectionId(section.id)}
                className={[
                  'rounded-2xl border px-3 py-2 text-sm font-semibold whitespace-nowrap',
                  effectiveSelectedSectionId === section.id
                    ? 'border-emerald-600 bg-emerald-600 text-white'
                    : 'border-slate-200 bg-slate-50',
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
                  <button onClick={() => dec(product.id)} className="h-10 w-10 rounded-2xl border border-slate-200">-</button>
                  <div className="text-lg font-bold">{draft[product.id] ?? 0}</div>
                  <button onClick={() => inc(product.id)} className="h-10 w-10 rounded-2xl bg-slate-900 text-white">+</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          {queue.map((item) => {
            const qty = Math.max(1, Math.min(queueSelection[item.orderItemId] ?? 1, item.qtyWaiting));
            const itemBusy = readyCommand.isPending(item.orderItemId);
            return (
              <div key={item.orderItemId} className="rounded-2xl border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold">{item.sessionLabel} • {item.productName}</div>
                  <div className="flex items-center gap-2">
                    {itemBusy ? (
                      <div className="rounded-xl bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">جارٍ التثبيت</div>
                    ) : null}
                    {item.qtyWaitingReplacement > 0 ? (
                      <div className="rounded-xl bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">إعادة مجانية</div>
                    ) : null}
                  </div>
                </div>
                <div className="mt-1 text-xs text-slate-500">بانتظار {item.qtyWaiting} • أصلي {item.qtyWaitingOriginal} • إعادة مجانية {item.qtyWaitingReplacement}</div>
                <div className="mt-3 flex items-center justify-between">
                  <button disabled={itemBusy} onClick={() => setQueueQty(item.orderItemId, qty - 1, item.qtyWaiting)} className="h-10 w-10 rounded-2xl border border-slate-200 disabled:opacity-40">-</button>
                  <div className="text-lg font-bold">{qty}</div>
                  <button disabled={itemBusy} onClick={() => setQueueQty(item.orderItemId, qty + 1, item.qtyWaiting)} className="h-10 w-10 rounded-2xl bg-slate-900 text-white disabled:opacity-40">+</button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    disabled={itemBusy}
                    onClick={() => void readyCommand.run(item.orderItemId, qty)}
                    className="rounded-2xl border border-slate-200 px-3 py-3 font-semibold disabled:opacity-40"
                  >
                    {itemBusy ? 'جارٍ التثبيت' : 'تجهيز المحدد'}
                  </button>
                  <button
                    disabled={itemBusy}
                    onClick={() => void readyCommand.run(item.orderItemId, item.qtyWaiting)}
                    className="rounded-2xl bg-slate-900 px-3 py-3 font-semibold text-white disabled:opacity-40"
                  >
                    {itemBusy ? 'جارٍ التثبيت' : 'تجهيز الكل'}
                  </button>
                </div>
              </div>
            );
          })}
          {!queue.length ? <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">لا يوجد طلبات شيشة الآن. عندما تصل طلبات جديدة ستظهر هنا.</div> : null}
        </div>

        <ReadyDeliveryPanel
          title="جاهز لتسليم الشيشة"
          items={readyItems}
          selectedQty={readySelection}
          onChangeQty={(orderItemId, nextQty, maxQty) => {
            setReadySelection((state) => ({ ...state, [orderItemId]: clampPositive(nextQty, maxQty) }));
          }}
          onDeliver={(orderItemId, quantity) => deliverCommand.run(orderItemId, quantity)}
          isBusy={deliverCommand.isPending}
          emptyLabel="لا يوجد شيشة جاهزة للتسليم"
        />

        {canManageComplaintActions ? (
          <SessionRemakePanel
            title="أصناف جلسة الشيشة الحالية"
            items={currentSessionItems}
            selectedQty={remakeSelection}
            onChangeQty={(orderItemId, nextQty, maxQty) => {
              setRemakeSelection((state) => ({ ...state, [orderItemId]: clampPositive(nextQty, maxQty) }));
            }}
            onRemake={(item, quantity, notes) => remakeCommand.run(item, quantity, notes)}
            isBusy={remakeCommand.isPending}
            emptyLabel={effectiveSessionId ? 'لا توجد أصناف شيشة في الجلسة الحالية.' : 'اختر جلسة أولًا.'}
          />
        ) : (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            تسجيل ملاحظات الشيشة متاح من صفحة الشكاوى، لكن الإعادة المجانية أو إسقاط الحساب متاحة للمشرف أو المعلم فقط.
          </div>
        )}
      </div>
    </MobileShell>
  );
}
