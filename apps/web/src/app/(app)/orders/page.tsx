'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MobileShell } from '@/ui/MobileShell';
import { useAuthz } from '@/lib/authz';
import { opsClient } from '@/lib/ops/client';
import type { SessionOrderItem, WaiterWorkspace } from '@/lib/ops/types';
import { appendOrTouchSession, applyDeliverToWaiterWorkspace } from '@/lib/ops/workspacePatches';
import { AccessDenied, ShiftRequired } from '@/ui/AccessState';
import { useOpsCommand, useOpsWorkspace } from '@/lib/ops/hooks';
import { ReadyDeliveryPanel } from '@/ui/ops/ReadyDeliveryPanel';
import { SessionRemakePanel } from '@/ui/ops/SessionRemakePanel';
import { StickyActionBar } from '@/ui/StickyActionBar';
import { clampPositive, sessionItemsForSession } from '@/ui/ops/sessionHelpers';
import {
  opsAccentButton,
  opsBadge,
  opsDashed,
  opsGhostButton,
  opsInset,
  opsPrimaryButton,
  opsSurface,
} from '@/ui/ops/premiumStyles';

export default function OrdersPage() {
  const { can, shift, effectiveRole } = useAuthz();
  const [label, setLabel] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [creatingNew, setCreatingNew] = useState(false);
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [readySelection, setReadySelection] = useState<Record<string, number>>({});
  const [remakeSelection, setRemakeSelection] = useState<Record<string, number>>({});
  const [sessionWarning, setSessionWarning] = useState<string | null>(null);

  const loader = useCallback(() => opsClient.waiterWorkspace(), []);
  const { data, setData, error: workspaceError } = useOpsWorkspace<WaiterWorkspace>(loader, {
    enabled: Boolean(shift),
    cacheKey: 'workspace:orders',
    staleTimeMs: 12_000,
    pollIntervalMs: 4000,
  });

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
  const canManageComplaintActions = can.owner || can.billing;
  const showReadyOnDashboard = !can.owner && (effectiveRole === 'waiter' || effectiveRole === 'supervisor');

  useEffect(() => {
    if (creatingNew || effectiveSessionId) {
      setSessionWarning(null);
    }
  }, [creatingNew, effectiveSessionId]);

  const submitCommand = useOpsCommand(
    async () => {
      if (!data) return;
      const nextDraftLines = Object.entries(draft).filter(([, quantity]) => quantity > 0);
      if (!nextDraftLines.length) return;

      if (creatingNew || !effectiveSessionId) {
        const created = await opsClient.openAndCreateOrder({
          label: label || undefined,
          items: nextDraftLines.map(([productId, quantity]) => ({ productId, quantity })),
        });
        setSessionId(created.sessionId);
        setCreatingNew(false);
        setData((current) => appendOrTouchSession(current, created.sessionId, created.label));
      } else {
        await opsClient.createOrderWithItems({
          serviceSessionId: effectiveSessionId,
          items: nextDraftLines.map(([productId, quantity]) => ({ productId, quantity })),
        });
      }

      setDraft({});
      setLabel('');
    },
    { onError: setCommandError },
  );

  const deliverCommand = useOpsCommand(
    async (orderItemId: string, quantity: number) => {
      await opsClient.deliver(orderItemId, quantity);
      setReadySelection((state) => ({ ...state, [orderItemId]: 1 }));
      setData((current) => applyDeliverToWaiterWorkspace(current, orderItemId, quantity));
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
    },
    { onError: setCommandError },
  );

  const effectiveError = commandError ?? workspaceError;

  if (!shift) return <ShiftRequired title="الطلبات" />;
  if (!can.takeOrders && !can.owner) return <AccessDenied title="الطلبات" />;

  function warnSessionRequired() {
    setSessionWarning('اختر جلسة أو أنشئ جلسة جديدة أولًا ثم أضف الأصناف.');
    document.getElementById('sessions-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  return (
    <MobileShell
      title="الطلبات"
      topRight={
        <div className="flex gap-2">
          {can.owner || can.billing ? (
            <Link href="/complaints" className={opsGhostButton}>
              شكاوى
            </Link>
          ) : null}
          <Link href="/support?source=in_app&page=/orders" className={opsGhostButton}>
            دعم
          </Link>
        </div>
      }
      stickyFooter={
        <StickyActionBar>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 text-right">
              <div className="text-sm font-semibold text-[#1e1712]">
                {creatingNew ? 'جلسة جديدة' : currentSessionLabel || 'اختر جلسة'}
              </div>
              <div className="mt-1 text-xs text-[#7d6a59]">
                {draftQtyTotal > 0 ? `إجمالي المحدد ${draftQtyTotal}` : 'اختر الأصناف ثم أرسل الطلب دفعة واحدة'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void submitCommand.run()}
              disabled={submitCommand.busy || draftLines.length === 0 || (!creatingNew && !effectiveSessionId)}
              className={[opsPrimaryButton, 'shrink-0'].join(' ')}
            >
              {submitCommand.busy ? '...' : creatingNew ? 'فتح وإرسال' : 'إرسال'}
            </button>
          </div>
        </StickyActionBar>
      }
    >
      {effectiveError ? (
        <div className="mb-3 rounded-[22px] border border-[#e6c7c2] bg-[#fff7f5] p-3 text-sm text-[#9a3e35]">
          {effectiveError}
        </div>
      ) : null}

      {sessionWarning ? (
        <div className="mb-3 rounded-[22px] border border-[#ecd9bd] bg-[#fffbf5] p-3 text-sm font-semibold text-[#a5671e]">
          {sessionWarning}
        </div>
      ) : null}

      <div className="mb-3 rounded-[22px] border border-[#e0d1bf] bg-[#f7efe4] px-3 py-2 text-right text-xs font-semibold text-[#6b5a4c]">
        اختر جلسة أو أنشئ جلسة جديدة ثم أضف الأصناف.
      </div>

      <div className="space-y-3">
        <section id="sessions-panel" className={[opsSurface, 'p-3'].join(' ')}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {sessions.length ? <div className={opsBadge('info')}>{sessions.length}</div> : null}
              <div className="text-sm font-semibold text-[#3d3128]">الجلسات المفتوحة</div>
            </div>
            <button type="button" onClick={beginNewSession} className={opsAccentButton}>
              + جلسة جديدة
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
                    'rounded-[20px] border px-3 py-3 text-right transition',
                    !creatingNew && effectiveSessionId === session.id
                      ? 'border-[#1e1712] bg-[#1e1712] text-white shadow-[0_14px_28px_rgba(30,23,18,0.16)]'
                      : 'border-[#decebb] bg-[#fffdf8] text-[#1e1712]',
                  ].join(' ')}
                >
                  <div className="truncate text-sm font-bold">{session.label}</div>
                  <div
                    className={[
                      'mt-1 text-xs',
                      !creatingNew && effectiveSessionId === session.id ? 'text-white/75' : 'text-[#7d6a59]',
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
                className="w-full rounded-[18px] border border-[#d7c7b2] bg-[#fffdf9] px-3 py-3 text-right text-[#1e1712] placeholder:text-[#a08a75]"
              />
              <div className="text-xs text-[#7d6a59]">يمكن ترك الاسم فارغًا ليولده النظام تلقائيًا.</div>
            </div>
          ) : null}

          {!sessions.length && !creatingNew ? (
            <div className={[opsDashed, 'mt-3 p-3 text-sm text-[#6b5a4c]'].join(' ')}>لا توجد جلسات مفتوحة الآن.</div>
          ) : null}

          {!sections.length ? (
            <div className={[opsDashed, 'mt-3 p-3 text-sm text-[#6b5a4c]'].join(' ')}>لا توجد أقسام منيو متاحة الآن.</div>
          ) : null}
        </section>

        <section id="menu-panel" className={[opsSurface, 'p-3'].join(' ')}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-[#3d3128]">المنيو</div>
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
                  'rounded-[18px] border px-3 py-2 text-sm font-semibold whitespace-nowrap',
                  effectiveSelectedSectionId === section.id
                    ? 'border-[#9b6b2e] bg-[#9b6b2e] text-white'
                    : 'border-[#dac9b6] bg-[#fffaf3] text-[#5e4d3f]',
                ].join(' ')}
              >
                {section.title}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {filteredProducts.map((product) => (
              <div key={product.id} className={[opsInset, 'p-3'].join(' ')}>
                <div className="text-right">
                  <div className="text-sm font-semibold text-[#1e1712]">{product.name}</div>
                  <div className="mt-1 text-xs text-[#7d6a59]">{product.unitPrice} ج</div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => dec(product.id)}
                    className="h-10 w-10 rounded-[16px] border border-[#d8c7b3] bg-white text-[#5e4d3f]"
                  >
                    -
                  </button>
                  <div className="text-lg font-black text-[#1e1712]">{draft[product.id] ?? 0}</div>
                  <button
                    type="button"
                    onClick={() => inc(product.id)}
                    className="h-10 w-10 rounded-[16px] bg-[#1e1712] text-white"
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {!showReadyOnDashboard ? (
          <section id="ready-panel">
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
              compact
            />
          </section>
        ) : null}

        {canManageComplaintActions ? (
          <section id="session-items-panel">
            <SessionRemakePanel
              title="أصناف الجلسة الحالية"
              items={currentSessionItems}
              selectedQty={remakeSelection}
              onChangeQty={(orderItemId, nextQty, maxQty) => {
                setRemakeSelection((state) => ({ ...state, [orderItemId]: clampPositive(nextQty, maxQty) }));
              }}
              onRemake={(item, quantity, notes) => remakeCommand.run(item, quantity, notes)}
              busy={remakeCommand.busy}
              emptyLabel={effectiveSessionId ? 'لا توجد أصناف في الجلسة الحالية.' : 'اختر جلسة أولًا.'}
              compact
            />
          </section>
        ) : null}
      </div>
    </MobileShell>
  );
}
