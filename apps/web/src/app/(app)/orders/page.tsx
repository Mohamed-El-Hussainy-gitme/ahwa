'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { MobileShell } from '@/ui/MobileShell';
import { useAuthz } from '@/lib/authz';
import { opsClient } from '@/lib/ops/client';
import type { SessionOrderItem, WaiterWorkspace } from '@/lib/ops/types';
import { AccessDenied, ShiftRequired } from '@/ui/AccessState';
import { useOpsCommand, useOpsWorkspace } from '@/lib/ops/hooks';
import { ReadyDeliveryPanel } from '@/ui/ops/ReadyDeliveryPanel';
import { SessionRemakePanel } from '@/ui/ops/SessionRemakePanel';
import { InlineSessionComplaintComposer } from '@/ui/ops/InlineSessionComplaintComposer';
import { StickyActionBar } from '@/ui/StickyActionBar';
import { clampPositive, sessionItemsForSession } from '@/ui/ops/sessionHelpers';
import { useOpsChrome } from '@/lib/ops/chrome';
import { QueueHealthStrip } from '@/ui/ops/QueueHealthStrip';

export default function OrdersPage() {
  const { can, shift } = useAuthz();
  const [label, setLabel] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [creatingNew, setCreatingNew] = useState(false);
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [readySelection, setReadySelection] = useState<Record<string, number>>({});
  const [remakeSelection, setRemakeSelection] = useState<Record<string, number>>({});

  const loader = useCallback(() => opsClient.waiterWorkspace(), []);
  const { data, error: workspaceError, reload } = useOpsWorkspace<WaiterWorkspace>(loader, {
    enabled: Boolean(shift),
  });
  const { summary } = useOpsChrome();

  const [commandError, setCommandError] = useState<string | null>(null);

  const sessions = data?.sessions ?? [];
  const sections = data?.sections ?? [];
  const effectiveSessionId = !creatingNew ? (sessionId || sessions[0]?.id || '') : '';
  const effectiveSelectedSectionId = selectedSectionId || sections[0]?.id || '';
  const filteredProducts = (data?.products ?? []).filter(
    (product) => !effectiveSelectedSectionId || product.sectionId === effectiveSelectedSectionId,
  );
  const draftLines = Object.entries(draft).filter(([, quantity]) => quantity > 0);
  const currentSessionLabel = sessions.find((session) => session.id === effectiveSessionId)?.label ?? '';
  const currentSessionItems = useMemo(
    () => sessionItemsForSession(data?.sessionItems ?? [], effectiveSessionId),
    [data?.sessionItems, effectiveSessionId],
  );
  const draftQtyTotal = draftLines.reduce((sum, [, quantity]) => sum + quantity, 0);

  const submitCommand = useOpsCommand(
    async () => {
      if (!data) return;
      const nextDraftLines = Object.entries(draft).filter(([, quantity]) => quantity > 0);
      if (!nextDraftLines.length) return;

      const target = creatingNew || !effectiveSessionId
        ? await opsClient.openOrResumeSession(label || undefined)
        : {
            sessionId: effectiveSessionId,
            label:
              data.sessions.find((session) => session.id === effectiveSessionId)?.label ?? label,
          };

      setSessionId(target.sessionId);
      setCreatingNew(false);

      await opsClient.createOrderWithItems({
        serviceSessionId: target.sessionId,
        items: nextDraftLines.map(([productId, quantity]) => ({ productId, quantity })),
      });

      setDraft({});
      setLabel('');
      await reload();
    },
    { onError: setCommandError },
  );

  const deliverCommand = useOpsCommand(
    async (orderItemId: string, quantity: number) => {
      await opsClient.deliver(orderItemId, quantity);
      setReadySelection((state) => ({ ...state, [orderItemId]: 1 }));
      await reload();
    },
    { onError: setCommandError },
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
      await reload();
    },
    { onError: setCommandError },
  );

  const effectiveError = commandError ?? workspaceError;

  if (!shift) return <ShiftRequired title="الطلبات" />;
  if (!can.takeOrders && !can.owner) return <AccessDenied title="الطلبات" />;

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

  return (
    <MobileShell
      title="الطلبات"
      topRight={<Link href="/complaints" className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">شكاوى</Link>}
      stickyFooter={
        <StickyActionBar>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 text-right">
              <div className="text-sm font-semibold text-slate-900">{creatingNew ? 'جلسة جديدة' : currentSessionLabel || 'اختر جلسة'}</div>
              <div className="mt-1 text-xs text-slate-500">{draftQtyTotal > 0 ? `إجمالي المحدد ${draftQtyTotal}` : 'اختر الأصناف ثم أرسل مرة واحدة'}</div>
            </div>
            <button
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
      <div className="space-y-3">
        <QueueHealthStrip health={summary?.queueHealth ?? null} />
        <div className="rounded-2xl border border-slate-200 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-slate-700">الجلسات المفتوحة</div>
            <button
              onClick={beginNewSession}
              className={[
                'rounded-2xl px-3 py-2 text-sm font-semibold',
                creatingNew
                  ? 'bg-emerald-600 text-white'
                  : 'border border-slate-200 bg-white text-slate-800',
              ].join(' ')}
            >
              + جلسة جديدة
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
              <div className="text-xs text-slate-500">اكتب اسم أو رقم الجلسة الجديدة. ويمكن تركه فارغًا ليولد النظام label تلقائيًا.</div>
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
                await reload();
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
                  <button
                    onClick={() => dec(product.id)}
                    className="h-10 w-10 rounded-2xl border border-slate-200"
                  >
                    -
                  </button>
                  <div className="text-lg font-bold">{draft[product.id] ?? 0}</div>
                  <button
                    onClick={() => inc(product.id)}
                    className="h-10 w-10 rounded-2xl bg-slate-900 text-white"
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <ReadyDeliveryPanel
          title="جاهز للتسليم"
          items={data?.readyItems ?? []}
          selectedQty={readySelection}
          onChangeQty={(orderItemId, nextQty, maxQty) => {
            setReadySelection((state) => ({ ...state, [orderItemId]: clampPositive(nextQty, maxQty) }));
          }}
          onDeliver={(orderItemId, quantity) => deliverCommand.run(orderItemId, quantity)}
          busy={deliverCommand.busy}
          emptyLabel="لا يوجد جاهز للتسليم"
        />

        <SessionRemakePanel
          title="أصناف الجلسة الحالية"
          items={currentSessionItems}
          selectedQty={remakeSelection}
          onChangeQty={(orderItemId, nextQty, maxQty) => {
            setRemakeSelection((state) => ({ ...state, [orderItemId]: clampPositive(nextQty, maxQty) }));
          }}
          onRemake={(item, quantity) => remakeCommand.run(item, quantity)}
          busy={remakeCommand.busy}
          emptyLabel={effectiveSessionId ? 'لا توجد أصناف في الجلسة الحالية.' : 'اختر جلسة أولًا.'}
        />
      </div>
    </MobileShell>
  );
}
