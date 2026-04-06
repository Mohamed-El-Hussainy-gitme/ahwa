'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { useAuthz } from '@/lib/authz';
import { opsClient } from '@/lib/ops/client';
import { useOpsCommand, useOpsWorkspace } from '@/lib/ops/hooks';
import { READY_POLL_INTERVAL_MS, shouldReloadReadyWorkspace } from '@/lib/ops/reload-rules';
import type { WaiterWorkspace } from '@/lib/ops/types';
import { applyDeliverToWaiterWorkspace, applyRealtimeEventToWaiterWorkspace } from '@/lib/ops/workspacePatches';
import { AccessDenied, ShiftRequired } from '@/ui/AccessState';
import { MobileShell } from '@/ui/MobileShell';
import { ReadyDeliveryPanel } from '@/ui/ops/ReadyDeliveryPanel';
import { clampPositive } from '@/ui/ops/sessionHelpers';
import { opsBadge, opsGhostButton, opsMetricCard, opsSurface } from '@/ui/ops/premiumStyles';

export default function ReadyPage() {
  const { can, shift, effectiveRole } = useAuthz();
  const canAccess = effectiveRole === 'waiter' || effectiveRole === 'supervisor';
  const [readySelection, setReadySelection] = useState<Record<string, number>>({});
  const [localError, setLocalError] = useState<string | null>(null);

  const waiterLoader = useCallback(() => opsClient.waiterWorkspace(), []);
  const { data, setData, error } = useOpsWorkspace<WaiterWorkspace>(waiterLoader, {
    enabled: Boolean(shift) && canAccess,
    pollIntervalMs: canAccess ? READY_POLL_INTERVAL_MS : undefined,
    shouldReloadOnEvent: shouldReloadReadyWorkspace,
    applyRealtimeEvent: applyRealtimeEventToWaiterWorkspace,
  });

  const deliverCommand = useOpsCommand(
    async (orderItemId: string, quantity: number) => {
      await opsClient.deliver(orderItemId, quantity);
      setReadySelection((state) => ({ ...state, [orderItemId]: 1 }));
      setData((current) => applyDeliverToWaiterWorkspace(current, orderItemId, quantity));
    },
    { onError: setLocalError },
  );

  const readyItems = useMemo(() => data?.readyItems ?? [], [data?.readyItems]);
  const effectiveError = localError ?? error ?? null;
  const readyTotal = readyItems.reduce((sum, item) => sum + item.qtyReadyForDelivery, 0);
  const replacements = readyItems.reduce((sum, item) => sum + item.qtyReadyForReplacementDelivery, 0);

  if (!shift) return <ShiftRequired title="جاهز" />;
  if (can.owner || !canAccess) {
    return <AccessDenied title="جاهز" message="هذه الصفحة لمضيف الصالة أو مشرف التشغيل فقط." />;
  }

  return (
    <MobileShell
      title="جاهز"
      topRight={<Link href="/support?source=in_app&page=/ready" className={opsGhostButton}>دعم</Link>}
    >
      {effectiveError ? (
        <div className="mb-3 rounded-[22px] border border-[#e6c7c2] bg-[#fff7f5] p-3 text-sm text-[#9a3e35]">
          {effectiveError}
        </div>
      ) : null}

      <section className={[opsSurface, 'mb-3 p-3'].join(' ')}>
        <div className="flex items-start justify-between gap-3">
          <div className="text-right">
            <div className="text-sm font-semibold text-[#1e1712]">تسليم الجاهز</div>
            <div className="mt-1 text-xs leading-6 text-[#7d6a59]">
              راقب البنود الجاهزة وسلمها مباشرة إلى الجلسة الصحيحة مع المحافظة على وضوح البنود البديلة المجانية.
            </div>
          </div>
          <div className={opsBadge('success')}>خدمة الصالة</div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className={opsMetricCard('success')}>
            <div className="text-[11px] font-semibold opacity-70">عدد البنود</div>
            <div className="mt-1 text-xl font-black leading-none">{readyItems.length}</div>
          </div>
          <div className={opsMetricCard('info')}>
            <div className="text-[11px] font-semibold opacity-70">إجمالي الجاهز</div>
            <div className="mt-1 text-xl font-black leading-none">{readyTotal}</div>
          </div>
          <div className={opsMetricCard('warning')}>
            <div className="text-[11px] font-semibold opacity-70">بدائل مجانية</div>
            <div className="mt-1 text-xl font-black leading-none">{replacements}</div>
          </div>
        </div>
      </section>

      <section id="ready-panel">
        <ReadyDeliveryPanel
          title="جاهز للتسليم"
          items={readyItems}
          selectedQty={readySelection}
          onChangeQty={(orderItemId, nextQty, maxQty) => {
            setReadySelection((state) => ({ ...state, [orderItemId]: clampPositive(nextQty, maxQty) }));
          }}
          onDeliver={(orderItemId, quantity) => deliverCommand.run(orderItemId, quantity)}
          busy={deliverCommand.busy}
          emptyLabel="لا يوجد جاهز الآن"
          compact
        />
      </section>
    </MobileShell>
  );
}
