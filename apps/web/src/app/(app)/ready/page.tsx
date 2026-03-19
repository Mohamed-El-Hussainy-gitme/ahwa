'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { useAuthz } from '@/lib/authz';
import { opsClient } from '@/lib/ops/client';
import { useOpsCommand, useOpsWorkspace } from '@/lib/ops/hooks';
import type { WaiterWorkspace } from '@/lib/ops/types';
import { applyDeliverToWaiterWorkspace } from '@/lib/ops/workspacePatches';
import { AccessDenied, ShiftRequired } from '@/ui/AccessState';
import { MobileShell } from '@/ui/MobileShell';
import { ReadyDeliveryPanel } from '@/ui/ops/ReadyDeliveryPanel';
import { clampPositive } from '@/ui/ops/sessionHelpers';

export default function ReadyPage() {
  const { can, shift, effectiveRole } = useAuthz();
  const canAccess = effectiveRole === 'waiter' || effectiveRole === 'supervisor';
  const [readySelection, setReadySelection] = useState<Record<string, number>>({});
  const [localError, setLocalError] = useState<string | null>(null);

  const waiterLoader = useCallback(() => opsClient.waiterWorkspace(), []);
  const { data, setData, error } = useOpsWorkspace<WaiterWorkspace>(waiterLoader, {
    enabled: Boolean(shift) && canAccess,
    pollIntervalMs: canAccess ? 1500 : undefined,
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

  if (!shift) return <ShiftRequired title="جاهز" />;
  if (can.owner || !canAccess) {
    return <AccessDenied title="جاهز" message="هذه الصفحة للويتر أو المشرف فقط." />;
  }

  return (
    <MobileShell
      title="جاهز"
      topRight={<Link href="/support?source=in_app&page=/ready" className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">دعم</Link>}
    >
      {effectiveError ? (
        <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {effectiveError}
        </div>
      ) : null}

      <section id="ready-panel">
        <ReadyDeliveryPanel
          title="جاهز"
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
