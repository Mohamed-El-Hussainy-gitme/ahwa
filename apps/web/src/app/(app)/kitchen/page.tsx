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
import { QuantityStepper } from '@/ui/ops/QuantityStepper';

export default function KitchenPage() {
  const { can, shift } = useAuthz();
  const [localError, setLocalError] = useState<string | null>(null);
  const [selectedQty, setSelectedQty] = useState<Record<string, number>>({});
  const loader = useCallback(() => opsClient.stationWorkspace('barista'), []);
  const { data, setData, error } = useOpsWorkspace<StationWorkspace>(loader, {
    enabled: Boolean(shift),
    pollIntervalMs: 1500,
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
    <MobileShell title="الباريستا" topRight={<Link href="/support?source=in_app&page=/kitchen" className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">دعم</Link>}>
      {localError ?? error ? (
        <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {localError ?? error}
        </div>
      ) : null}

      <section id="queue-panel" className="space-y-3">
        {(data?.queue ?? []).map((item) => {
          const qty = Math.max(1, Math.min(selectedQty[item.orderItemId] ?? 1, item.qtyWaiting));
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
                  <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">إعادة مجانية {item.qtyWaitingReplacement}</span>
                </div>
              ) : null}

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
        {!data?.queue?.length ? <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">لا يوجد طلبات للباريستا الآن.</div> : null}
      </section>
    </MobileShell>
  );
}
