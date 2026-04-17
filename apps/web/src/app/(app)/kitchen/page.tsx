'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MobileShell } from '@/ui/MobileShell';
import { useAuthz } from '@/lib/authz';
import { opsClient } from '@/lib/ops/client';
import type { StationQueueItem, StationWorkspace } from '@/lib/ops/types';
import { applyReadyToStationWorkspace } from '@/lib/ops/workspacePatches';
import { AccessDenied, ShiftRequired } from '@/ui/AccessState';
import { useOpsCommand, useOpsWorkspace } from '@/lib/ops/hooks';
import { playOpsNotificationSignal } from '@/lib/ops/notifications';
import { shouldReloadStationWorkspace } from '@/lib/ops/reload-rules';
import { QuantityStepper } from '@/ui/ops/QuantityStepper';
import { parseOrderItemNotes } from '@/lib/ops/orderItemNotes';
import {
  opsAlert,
  opsBadge,
  opsEmptyState,
  opsGhostButton,
  opsMetricCard,
  opsPrimaryButton,
  opsSectionHint,
  opsSectionTitle,
  opsSurface,
} from '@/ui/ops/premiumStyles';

export default function KitchenPage() {
  const { can, shift } = useAuthz();
  const [localError, setLocalError] = useState<string | null>(null);
  const [selectedQty, setSelectedQty] = useState<Record<string, number>>({});
  const loader = useCallback(() => opsClient.stationWorkspace('barista'), []);
  const { data, setData, error } = useOpsWorkspace<StationWorkspace>(loader, {
    enabled: Boolean(shift),
    cacheKey: 'workspace:kitchen:barista',
    staleTimeMs: 10_000,
    pollIntervalMs: 4000,
    shouldReloadOnEvent: (event) => shouldReloadStationWorkspace(event, 'barista'),
  });
  const previousWaitingQtyRef = useRef(0);
  const readyCommand = useOpsCommand(
    async (item: StationQueueItem, quantity: number) => {
      await opsClient.markReady(item.orderItemId, quantity);
      setSelectedQty((state) => ({ ...state, [item.orderItemId]: 0 }));
      setData((current) => applyReadyToStationWorkspace(current, item, quantity));
    },
    { onError: setLocalError },
  );

  if (!shift) return <ShiftRequired title="الباريستا" />;
  if (!can.kitchen && !can.owner) return <AccessDenied title="الباريستا" />;

  const totalWaiting = (data?.queue ?? []).reduce((sum, item) => sum + item.qtyWaiting, 0);
  const totalReplacement = (data?.queue ?? []).reduce((sum, item) => sum + item.qtyWaitingReplacement, 0);

  useEffect(() => {
    if (document.visibilityState !== 'visible') {
      previousWaitingQtyRef.current = totalWaiting;
      return;
    }

    if (!can.owner && totalWaiting > previousWaitingQtyRef.current) {
      void playOpsNotificationSignal('station-order');
    }

    previousWaitingQtyRef.current = totalWaiting;
  }, [can.owner, totalWaiting]);

  function setQty(orderItemId: string, qty: number, max: number) {
    setSelectedQty((state) => ({
      ...state,
      [orderItemId]: Math.max(1, Math.min(qty, max)),
    }));
  }

  return (
    <MobileShell
      title="الباريستا"
      topRight={<Link href="/support?source=in_app&page=/kitchen" className={opsGhostButton}>دعم</Link>}
      desktopMode="ops"
    >
      {localError ?? error ? <div className={`mb-3 ${opsAlert('danger')}`}>{localError ?? error}</div> : null}

      <section className={`${opsSurface} mb-3 p-3`}>
        <div className="flex items-start justify-between gap-3">
          <div className="text-right">
            <div className={opsSectionTitle}>محطة الباريستا</div>
            <div className={`mt-1 ${opsSectionHint}`}>
              راقب الطابور الحالي، وابدأ بتجهيز البنود الأعلى أولوية للحفاظ على إيقاع الخدمة.
            </div>
          </div>
          <div className={opsBadge('accent')}>تحضير مباشر</div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className={opsMetricCard('warning')}>
            <div className="text-[11px] font-semibold opacity-70">قيد الانتظار</div>
            <div className="mt-1 text-xl font-black leading-none">{totalWaiting}</div>
          </div>
          <div className={opsMetricCard('info')}>
            <div className="text-[11px] font-semibold opacity-70">البنود</div>
            <div className="mt-1 text-xl font-black leading-none">{data?.queue?.length ?? 0}</div>
          </div>
          <div className={opsMetricCard(totalReplacement > 0 ? 'warning' : 'success')}>
            <div className="text-[11px] font-semibold opacity-70">إعادة مجانية</div>
            <div className="mt-1 text-xl font-black leading-none">{totalReplacement}</div>
          </div>
        </div>
      </section>

      <section id="queue-panel" className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-3">
        {(data?.queue ?? []).map((item) => {
          const qty = Math.max(1, Math.min(selectedQty[item.orderItemId] ?? 1, item.qtyWaiting));
          const parsedNotes = parseOrderItemNotes(item.notes);
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

              {item.qtyWaitingReplacement > 0 || parsedNotes.addonSummary || parsedNotes.freeformNotes ? (
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                  {item.qtyWaitingReplacement > 0 ? <span className={opsBadge('warning')}>إعادة مجانية {item.qtyWaitingReplacement}</span> : null}
                  {parsedNotes.addonSummary ? <span className={opsBadge('accent')}>إضافات: {parsedNotes.addonSummary}</span> : null}
                  {parsedNotes.freeformNotes ? <span className={opsBadge('info')}>ملاحظة مرفقة</span> : null}
                </div>
              ) : null}

              {parsedNotes.freeformNotes ? <div className="mt-2 rounded-[16px] bg-[#fff8ef] px-3 py-2 text-right text-xs font-semibold text-[#6b5a4c]">{parsedNotes.freeformNotes}</div> : null}

              <QuantityStepper
                label="تجهيز الآن"
                value={qty}
                onDecrement={() => setQty(item.orderItemId, qty - 1, item.qtyWaiting)}
                onIncrement={() => setQty(item.orderItemId, qty + 1, item.qtyWaiting)}
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

        {!data?.queue?.length ? (
          <div className={[opsEmptyState(), 'xl:col-span-2 2xl:col-span-3'].join(' ')}>
            لا توجد طلبات للباريستا الآن.
          </div>
        ) : null}
      </section>
    </MobileShell>
  );
}
