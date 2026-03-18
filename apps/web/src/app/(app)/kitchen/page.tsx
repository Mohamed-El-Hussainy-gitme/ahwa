'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { MobileShell } from '@/ui/MobileShell';
import { useAuthz } from '@/lib/authz';
import { opsClient } from '@/lib/ops/client';
import type { StationWorkspace } from '@/lib/ops/types';
import { AccessDenied, ShiftRequired } from '@/ui/AccessState';
import { useOpsPendingCommand, useOpsWorkspace } from '@/lib/ops/hooks';
import { useOpsChrome } from '@/lib/ops/chrome';
import { QueueHealthStrip } from '@/ui/ops/QueueHealthStrip';
import { OPS_SCOPE_STATION_BARISTA } from '@/lib/ops/workspaceScopes';
import { patchStationReady } from '@/lib/ops/workspacePatches';

export default function KitchenPage() {
  const { can, shift } = useAuthz();
  const [localError, setLocalError] = useState<string | null>(null);
  const [selectedQty, setSelectedQty] = useState<Record<string, number>>({});
  const loader = useCallback(() => opsClient.stationWorkspace('barista'), []);
  const { data, setData, error } = useOpsWorkspace<StationWorkspace>(loader, {
    enabled: Boolean(shift),
    scopes: [OPS_SCOPE_STATION_BARISTA],
  });
  const { summary } = useOpsChrome();
  const readyCommand = useOpsPendingCommand(
    (orderItemId: string, _quantity: number) => orderItemId,
    async (orderItemId: string, quantity: number) => {
      const previousWorkspace = data;
      setData((current) => (current ? patchStationReady(current, orderItemId, quantity) : current));
      setSelectedQty((state) => ({ ...state, [orderItemId]: 1 }));
      try {
        await opsClient.markReady(orderItemId, quantity);
      } catch (commandError) {
        setData(previousWorkspace);
        throw commandError;
      }
    },
    { onError: setLocalError },
  );

  if (!shift) return <ShiftRequired title="الباريستا" />;
  if (!can.kitchen && !can.owner) return <AccessDenied title="الباريستا" />;

  const totalWaiting = (data?.queue ?? []).reduce((sum, item) => sum + item.qtyWaiting, 0);

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
      <QueueHealthStrip health={summary?.queueHealth ?? null} className="mb-3" />
      <div className="mb-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
        انتظار الباريستا الآن: <span className="font-semibold">{totalWaiting}</span>
      </div>
      <div className="space-y-2">
        {(data?.queue ?? []).map((item) => {
          const qty = Math.max(1, Math.min(selectedQty[item.orderItemId] ?? 1, item.qtyWaiting));
          const itemBusy = readyCommand.isPending(item.orderItemId);
          return (
            <div key={item.orderItemId} className="rounded-2xl border border-slate-200 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold">
                  {item.sessionLabel} • {item.productName}
                </div>
                {itemBusy ? (
                  <div className="rounded-xl bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                    جارٍ التثبيت
                  </div>
                ) : null}
              </div>
              <div className="mt-1 text-xs text-slate-500">بانتظار {item.qtyWaiting} • أصلي {item.qtyWaitingOriginal} • إعادة {item.qtyWaitingReplacement}</div>
              <div className="mt-3 flex items-center justify-between">
                <button
                  disabled={itemBusy}
                  onClick={() => setQty(item.orderItemId, qty - 1, item.qtyWaiting)}
                  className="h-10 w-10 rounded-2xl border border-slate-200 disabled:opacity-40"
                >
                  -
                </button>
                <div className="text-lg font-bold">{qty}</div>
                <button
                  disabled={itemBusy}
                  onClick={() => setQty(item.orderItemId, qty + 1, item.qtyWaiting)}
                  className="h-10 w-10 rounded-2xl bg-slate-900 text-white disabled:opacity-40"
                >
                  +
                </button>
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
        {!data?.queue?.length ? <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">لا يوجد طلبات للباريستا الآن. عندما تصل طلبات جديدة ستظهر هنا مباشرة.</div> : null}
      </div>
    </MobileShell>
  );
}
