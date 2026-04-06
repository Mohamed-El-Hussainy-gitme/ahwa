'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MobileShell } from '@/ui/MobileShell';
import { useAuthz } from '@/lib/authz';
import { opsClient } from '@/lib/ops/client';
import type { OpsProduct, OpsSection, OpsSessionSummary, SessionOrderItem, WaiterCatalogWorkspace, WaiterLiveWorkspace } from '@/lib/ops/types';
import { appendOrTouchSession, applyDeliverToWaiterWorkspace } from '@/lib/ops/workspacePatches';
import { AccessDenied, ShiftRequired } from '@/ui/AccessState';
import { useOpsCommand, useOpsWorkspace } from '@/lib/ops/hooks';
import { ReadyDeliveryPanel } from '@/ui/ops/ReadyDeliveryPanel';
import { SessionRemakePanel } from '@/ui/ops/SessionRemakePanel';
import { StickyActionBar } from '@/ui/StickyActionBar';
import { clampPositive, sessionItemsForSession } from '@/ui/ops/sessionHelpers';
import { shouldReloadWaiterCatalogWorkspace, shouldReloadWaiterLiveWorkspace } from '@/lib/ops/reload-rules';
import {
  opsAccentButton,
  opsBadge,
  opsDashed,
  opsGhostButton,
  opsInset,
  opsPrimaryButton,
  opsSurface,
} from '@/ui/ops/premiumStyles';

type SessionCardView = OpsSessionSummary & {
  totalItemQty: number;
  totalProductCount: number;
  lastActivityAt: string;
  openedLabel: string;
  activityLabel: string;
};

function formatClockLabel(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ar-EG', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function safeIsoLike(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function normalizeSessionSummary(session: OpsSessionSummary): OpsSessionSummary {
  return {
    ...session,
    id: typeof session.id === 'string' ? session.id : String(session.id ?? ''),
    label: typeof session.label === 'string' && session.label.trim() ? session.label : 'جلسة',
    status: typeof session.status === 'string' ? session.status : '',
    openedAt: safeIsoLike(session.openedAt, ''),
    billableCount: Number.isFinite(Number(session.billableCount)) ? Math.max(Number(session.billableCount), 0) : 0,
    readyCount: Number.isFinite(Number(session.readyCount)) ? Math.max(Number(session.readyCount), 0) : 0,
  };
}

function normalizeSessionOrderItem(item: SessionOrderItem): SessionOrderItem {
  return {
    ...item,
    orderItemId: typeof item.orderItemId === 'string' ? item.orderItemId : String(item.orderItemId ?? ''),
    serviceSessionId: typeof item.serviceSessionId === 'string' ? item.serviceSessionId : String(item.serviceSessionId ?? ''),
    sessionLabel: typeof item.sessionLabel === 'string' && item.sessionLabel.trim() ? item.sessionLabel : 'جلسة',
    productName: typeof item.productName === 'string' ? item.productName : '',
    stationCode: item.stationCode,
    unitPrice: Number.isFinite(Number(item.unitPrice)) ? Number(item.unitPrice) : 0,
    qtyTotal: Number.isFinite(Number(item.qtyTotal)) ? Number(item.qtyTotal) : 0,
    qtyReady: Number.isFinite(Number(item.qtyReady)) ? Number(item.qtyReady) : 0,
    qtyDelivered: Number.isFinite(Number(item.qtyDelivered)) ? Number(item.qtyDelivered) : 0,
    qtyReplacementDelivered: Number.isFinite(Number(item.qtyReplacementDelivered)) ? Number(item.qtyReplacementDelivered) : 0,
    qtyPaid: Number.isFinite(Number(item.qtyPaid)) ? Number(item.qtyPaid) : 0,
    qtyDeferred: Number.isFinite(Number(item.qtyDeferred)) ? Number(item.qtyDeferred) : 0,
    qtyWaived: Number.isFinite(Number(item.qtyWaived)) ? Number(item.qtyWaived) : 0,
    qtyCancelled: Number.isFinite(Number(item.qtyCancelled)) ? Number(item.qtyCancelled) : 0,
    qtyRemade: Number.isFinite(Number(item.qtyRemade)) ? Number(item.qtyRemade) : 0,
    qtyReadyForDelivery: Number.isFinite(Number(item.qtyReadyForDelivery)) ? Number(item.qtyReadyForDelivery) : 0,
    qtyReadyForReplacementDelivery: Number.isFinite(Number(item.qtyReadyForReplacementDelivery)) ? Number(item.qtyReadyForReplacementDelivery) : 0,
    availableRemakeQty: Number.isFinite(Number(item.availableRemakeQty)) ? Number(item.availableRemakeQty) : 0,
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : undefined,
  };
}

function normalizeSection(section: OpsSection): OpsSection {
  return {
    ...section,
    id: typeof section.id === 'string' ? section.id : String(section.id ?? ''),
    title: typeof section.title === 'string' && section.title.trim() ? section.title : 'قسم',
    sortOrder: Number.isFinite(Number(section.sortOrder)) ? Number(section.sortOrder) : 0,
  };
}

function normalizeProduct(product: OpsProduct): OpsProduct {
  return {
    ...product,
    id: typeof product.id === 'string' ? product.id : String(product.id ?? ''),
    sectionId: typeof product.sectionId === 'string' ? product.sectionId : String(product.sectionId ?? ''),
    name: typeof product.name === 'string' && product.name.trim() ? product.name : 'صنف',
    unitPrice: Number.isFinite(Number(product.unitPrice)) ? Number(product.unitPrice) : 0,
    sortOrder: Number.isFinite(Number(product.sortOrder)) ? Number(product.sortOrder) : 0,
  };
}

function safeLocaleCompare(a: unknown, b: unknown) {
  return safeIsoLike(a).localeCompare(safeIsoLike(b));
}

function buildSessionCardView(session: OpsSessionSummary, items: SessionOrderItem[]): SessionCardView {
  let totalItemQty = 0;
  let latestAt = session.openedAt;
  for (const item of items) {
    totalItemQty += Math.max(Number(item.qtyTotal ?? 0), 0);
    if (item.createdAt && item.createdAt > latestAt) {
      latestAt = item.createdAt;
    }
  }
  return {
    ...session,
    totalItemQty,
    totalProductCount: items.length,
    lastActivityAt: latestAt,
    openedLabel: formatClockLabel(session.openedAt),
    activityLabel: formatClockLabel(latestAt),
  };
}

export default function OrdersPage() {
  const { can, shift, effectiveRole } = useAuthz();
  const [label, setLabel] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [creatingNew, setCreatingNew] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerLabel, setComposerLabel] = useState('');
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [readySelection, setReadySelection] = useState<Record<string, number>>({});
  const [remakeSelection, setRemakeSelection] = useState<Record<string, number>>({});
  const [sessionWarning, setSessionWarning] = useState<string | null>(null);
  const composerInputRef = useRef<HTMLInputElement | null>(null);

  const liveLoader = useCallback(() => opsClient.waiterLiveWorkspace(), []);
  const catalogLoader = useCallback(() => opsClient.waiterCatalogWorkspace(), []);
  const { data: liveData, setData: setLiveData, error: liveError } = useOpsWorkspace<WaiterLiveWorkspace>(liveLoader, {
    enabled: Boolean(shift),
    cacheKey: 'workspace:orders:live',
    staleTimeMs: 12_000,
    pollIntervalMs: 4000,
    shouldReloadOnEvent: shouldReloadWaiterLiveWorkspace,
  });
  const { data: catalogData, error: catalogError } = useOpsWorkspace<WaiterCatalogWorkspace>(catalogLoader, {
    enabled: Boolean(shift),
    cacheKey: 'workspace:orders:catalog',
    staleTimeMs: 120_000,
    shouldReloadOnEvent: shouldReloadWaiterCatalogWorkspace,
  });

  const [commandError, setCommandError] = useState<string | null>(null);

  const sessions = useMemo(() => (Array.isArray(liveData?.sessions) ? liveData.sessions.map(normalizeSessionSummary) : []), [liveData?.sessions]);
  const sessionItems = useMemo(() => (Array.isArray(liveData?.sessionItems) ? liveData.sessionItems.map(normalizeSessionOrderItem) : []), [liveData?.sessionItems]);
  const sections = useMemo(() => (Array.isArray(catalogData?.sections) ? catalogData.sections.map(normalizeSection) : []), [catalogData?.sections]);
  const products = useMemo(() => (Array.isArray(catalogData?.products) ? catalogData.products.map(normalizeProduct) : []), [catalogData?.products]);
  const effectiveSessionId = !creatingNew ? (sessionId || sessions[0]?.id || '') : '';
  const effectiveSelectedSectionId = selectedSectionId || sections[0]?.id || '';
  const filteredProducts = products.filter((product) => !effectiveSelectedSectionId || product.sectionId === effectiveSelectedSectionId);
  const draftLines = Object.entries(draft).filter(([, quantity]) => quantity > 0);
  const currentSessionItems = useMemo(
    () => sessionItemsForSession(sessionItems, effectiveSessionId),
    [sessionItems, effectiveSessionId],
  );
  const draftQtyTotal = draftLines.reduce((sum, [, quantity]) => sum + quantity, 0);
  const canManageComplaintActions = can.owner || can.billing;
  const showReadyOnDashboard = !can.owner && (effectiveRole === 'waiter' || effectiveRole === 'supervisor');

  const sessionCards = useMemo(() => {
    const itemsBySession = new Map<string, SessionOrderItem[]>();
    for (const item of sessionItems) {
      const current = itemsBySession.get(item.serviceSessionId);
      if (current) current.push(item);
      else itemsBySession.set(item.serviceSessionId, [item]);
    }

    return [...sessions]
      .map((session) => buildSessionCardView(session, itemsBySession.get(session.id) ?? []))
      .sort((a, b) => {
        if (!creatingNew && a.id === effectiveSessionId) return -1;
        if (!creatingNew && b.id === effectiveSessionId) return 1;
        return safeLocaleCompare(b.lastActivityAt, a.lastActivityAt);
      });
  }, [creatingNew, effectiveSessionId, sessionItems, sessions]);

  const selectedSession = useMemo(() => {
    if (creatingNew) {
      return null;
    }
    return sessionCards.find((session) => session.id === effectiveSessionId) ?? null;
  }, [creatingNew, effectiveSessionId, sessionCards]);

  useEffect(() => {
    if (creatingNew || effectiveSessionId) {
      setSessionWarning(null);
    }
  }, [creatingNew, effectiveSessionId]);

  useEffect(() => {
    if (!composerOpen) return;
    const timer = window.setTimeout(() => {
      composerInputRef.current?.focus();
      composerInputRef.current?.select();
    }, 40);
    return () => window.clearTimeout(timer);
  }, [composerOpen]);

  const submitCommand = useOpsCommand(
    async () => {
      if (!liveData) return;
      const nextDraftLines = Object.entries(draft).filter(([, quantity]) => quantity > 0);
      if (!nextDraftLines.length) return;

      if (creatingNew || !effectiveSessionId) {
        const created = await opsClient.openAndCreateOrder({
          label: label || undefined,
          items: nextDraftLines.map(([productId, quantity]) => ({ productId, quantity })),
        });
        setSessionId(created.sessionId);
        setCreatingNew(false);
        setLiveData((current) => appendOrTouchSession(current, created.sessionId, created.label));
      } else {
        await opsClient.createOrderWithItems({
          serviceSessionId: effectiveSessionId,
          items: nextDraftLines.map(([productId, quantity]) => ({ productId, quantity })),
        });
        setLiveData((current) => appendOrTouchSession(current, effectiveSessionId, selectedSession?.label ?? `جلسة ${effectiveSessionId.slice(0, 6)}`));
      }

      setDraft({});
      setLabel('');
      setComposerLabel('');
    },
    { onError: setCommandError },
  );

  const deliverCommand = useOpsCommand(
    async (orderItemId: string, quantity: number) => {
      await opsClient.deliver(orderItemId, quantity);
      setReadySelection((state) => ({ ...state, [orderItemId]: 1 }));
      setLiveData((current) => applyDeliverToWaiterWorkspace(current, orderItemId, quantity));
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

  const effectiveError = commandError ?? liveError ?? catalogError;

  if (!shift) return <ShiftRequired title="الطلبات" />;
  if (!can.takeOrders && !can.owner) return <AccessDenied title="الطلبات" />;

  function warnSessionRequired() {
    setSessionWarning('اختر جلسة واضحة أو أنشئ جلسة جديدة أولًا، ثم أضف الأصناف.');
    document.getElementById('sessions-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function inc(id: string) {
    if (composerOpen) {
      return;
    }
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
    if (composerOpen || submitCommand.busy) {
      return;
    }
    setSessionId(nextSessionId);
    setCreatingNew(false);
    setLabel('');
    setSessionWarning(null);
  }

  function beginNewSession() {
    if (submitCommand.busy) {
      return;
    }
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
                {creatingNew ? (label ? `جلسة جديدة: ${label}` : 'جلسة جديدة') : selectedSession?.label || 'اختر جلسة واضحة'}
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
              {submitCommand.busy ? 'جارٍ الإرسال...' : creatingNew ? 'فتح وإرسال' : 'إرسال'}
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
        اختر الجلسة بعلامة واضحة قبل إضافة الأصناف. الجلسة الحالية تظهر دائمًا أعلى القائمة.
      </div>

      {!creatingNew && selectedSession ? (
        <section className={[opsSurface, 'mb-3 p-3'].join(' ')}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 text-right">
              <div className="text-xs font-semibold text-[#9b6b2e]">الجلسة الحالية</div>
              <div className="mt-1 truncate text-base font-black text-[#1e1712]">{selectedSession.label}</div>
              <div className="mt-1 text-xs text-[#7d6a59]">
                آخر نشاط {selectedSession.activityLabel} • فُتحت {selectedSession.openedLabel}
              </div>
            </div>
            <div className="grid shrink-0 grid-cols-2 gap-2 text-center text-xs text-[#5e4d3f]">
              <div className="rounded-[18px] bg-[#fffaf3] px-3 py-2">
                <div className="font-black text-[#1e1712]">{selectedSession.totalItemQty}</div>
                <div>إجمالي الأصناف</div>
              </div>
              <div className="rounded-[18px] bg-[#fffaf3] px-3 py-2">
                <div className="font-black text-[#1e1712]">{selectedSession.readyCount}</div>
                <div>جاهز</div>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <div className="space-y-3">
        <section id="sessions-panel" className={[opsSurface, 'p-3'].join(' ')}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {sessionCards.length ? <div className={opsBadge('info')}>{sessionCards.length}</div> : null}
              <div className="text-sm font-semibold text-[#3d3128]">الجلسات المفتوحة</div>
            </div>
            <button type="button" onClick={beginNewSession} className={opsAccentButton}>
              + جلسة جديدة
            </button>
          </div>

          {sessionCards.length ? (
            <div className="grid grid-cols-2 gap-2">
              {sessionCards.map((session) => {
                const active = !creatingNew && effectiveSessionId === session.id;
                return (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => selectExistingSession(session.id)}
                    disabled={composerOpen || submitCommand.busy}
                    className={[
                      'rounded-[20px] border px-3 py-3 text-right transition disabled:opacity-60',
                      active
                        ? 'border-[#1e1712] bg-[#1e1712] text-white shadow-[0_14px_28px_rgba(30,23,18,0.16)]'
                        : 'border-[#decebb] bg-[#fffdf8] text-[#1e1712]',
                    ].join(' ')}
                  >
                    <div className="truncate text-sm font-bold">{session.label}</div>
                    <div className={['mt-1 text-xs', active ? 'text-white/75' : 'text-[#7d6a59]'].join(' ')}>
                      {session.totalItemQty} صنف • جاهز {session.readyCount}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}

          {!sessionCards.length ? (
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
              <div className={opsBadge('accent')}>{label ? `جلسة جديدة: ${label}` : 'جلسة جديدة'}</div>
            ) : selectedSession ? (
              <div className={opsBadge('info')}>{selectedSession.label}</div>
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
              items={liveData?.readyItems ?? []}
              selectedQty={readySelection}
              onChangeQty={(orderItemId, nextQty, maxQty) => {
                setReadySelection((state) => ({ ...state, [orderItemId]: clampPositive(nextQty, maxQty) }));
              }}
              onDeliver={(orderItemId, quantity) => void deliverCommand.run(orderItemId, quantity).catch(() => undefined)}
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
              onRemake={(item, quantity, notes) => void remakeCommand.run(item, quantity, notes).catch(() => undefined)}
              busy={remakeCommand.busy}
              emptyLabel={effectiveSessionId ? 'لا توجد أصناف في الجلسة الحالية.' : 'اختر جلسة أولًا.'}
              compact
            />
          </section>
        ) : null}
      </div>

      {composerOpen ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[#1e1712]/45 p-3 sm:items-center">
          <div className="w-full max-w-md rounded-[28px] border border-[#dccbb7] bg-[#fffdf9] p-4 shadow-[0_24px_60px_rgba(30,23,18,0.22)]">
            <div className="text-right">
              <div className="text-base font-black text-[#1e1712]">تعريف جلسة جديدة</div>
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

      {submitCommand.busy ? (
        <div className="pointer-events-auto fixed inset-0 z-[60] flex items-center justify-center bg-[#1e1712]/12 p-6">
          <div className="rounded-[22px] bg-white/95 px-4 py-3 text-center shadow-[0_18px_45px_rgba(30,23,18,0.18)]">
            <div className="text-sm font-black text-[#1e1712]">جارٍ إرسال الطلب</div>
            <div className="mt-1 text-xs text-[#7d6a59]">يتم تثبيت الطلب على الجلسة الحالية الآن.</div>
          </div>
        </div>
      ) : null}
    </MobileShell>
  );
}
