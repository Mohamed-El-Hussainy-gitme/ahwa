'use client';

import { useCallback, useMemo, useState } from 'react';
import { MobileShell } from '@/ui/MobileShell';
import { useAuthz } from '@/lib/authz';
import { opsClient } from '@/lib/ops/client';
import type { ComplaintItemCandidate, ComplaintRecord, ComplaintsWorkspace } from '@/lib/ops/types';
import { AccessDenied, ShiftRequired } from '@/ui/AccessState';
import { useOpsCommand, useOpsWorkspace } from '@/lib/ops/hooks';

function complaintKindForAction(action: 'remake' | 'cancel_undelivered' | 'waive_delivered') {
  if (action === 'remake') return 'quality_issue' as const;
  if (action === 'cancel_undelivered') return 'wrong_item' as const;
  return 'billing_issue' as const;
}

function complaintKindLabel(kind: ComplaintRecord['complaintKind']) {
  switch (kind) {
    case 'quality_issue':
      return 'جودة';
    case 'wrong_item':
      return 'صنف خطأ';
    case 'delay':
      return 'تأخير';
    case 'billing_issue':
      return 'حساب';
    default:
      return 'أخرى';
  }
}

function resolutionLabel(kind: ComplaintRecord['resolutionKind']) {
  switch (kind) {
    case 'remake':
      return 'إعادة مجانية';
    case 'cancel_undelivered':
      return 'إلغاء غير مسلم';
    case 'waive_delivered':
      return 'إسقاط من الحساب';
    case 'dismissed':
      return 'إغلاق بدون إجراء';
    default:
      return 'مفتوحة';
  }
}

export default function ComplaintsPage() {
  const { can, shift, effectiveRole } = useAuthz();
  const [localError, setLocalError] = useState<string | null>(null);
  const [selectedQty, setSelectedQty] = useState<Record<string, number>>({});
  const [notesByItem, setNotesByItem] = useState<Record<string, string>>({});

  const loader = useCallback(() => opsClient.complaintsWorkspace(), []);
  const { data, error, reload } = useOpsWorkspace<ComplaintsWorkspace>(loader, { enabled: Boolean(shift) });

  const itemById = useMemo(
    () => new Map((data?.items ?? []).map((item) => [item.orderItemId, item])),
    [data?.items],
  );

  const actionCommand = useOpsCommand(
    async (item: ComplaintItemCandidate, action: 'remake' | 'cancel_undelivered' | 'waive_delivered' | 'none') => {
      const max = action === 'remake'
        ? item.availableRemakeQty
        : action === 'cancel_undelivered'
          ? item.availableCancelQty
          : action === 'waive_delivered'
            ? item.availableWaiveQty
            : Math.max(item.availableCancelQty, item.availableRemakeQty, item.availableWaiveQty, 1);
      const quantity = Math.max(1, Math.min(selectedQty[item.orderItemId] ?? 1, max));
      await opsClient.createComplaint({
        serviceSessionId: item.serviceSessionId,
        orderItemId: item.orderItemId,
        complaintKind: action === 'none' ? 'other' : complaintKindForAction(action),
        quantity,
        notes: notesByItem[item.orderItemId]?.trim() || undefined,
        action,
      });
      setSelectedQty((state) => ({ ...state, [item.orderItemId]: 1 }));
      setNotesByItem((state) => ({ ...state, [item.orderItemId]: '' }));
      await reload();
    },
    { onError: setLocalError },
  );

  const resolveCommand = useOpsCommand(
    async (complaint: ComplaintRecord, resolutionKind: 'remake' | 'cancel_undelivered' | 'waive_delivered' | 'dismissed') => {
      const linkedItem = complaint.orderItemId ? itemById.get(complaint.orderItemId) : undefined;
      let quantity: number | undefined;
      if (resolutionKind !== 'dismissed' && linkedItem) {
        const requested = complaint.requestedQuantity ?? 1;
        const max = resolutionKind === 'remake'
          ? linkedItem.availableRemakeQty
          : resolutionKind === 'cancel_undelivered'
            ? linkedItem.availableCancelQty
            : linkedItem.availableWaiveQty;
        quantity = Math.max(1, Math.min(requested, max || requested));
      }
      await opsClient.resolveComplaint({
        complaintId: complaint.id,
        resolutionKind,
        quantity,
      });
      await reload();
    },
    { onError: setLocalError },
  );

  function setQty(orderItemId: string, next: number, max: number) {
    setSelectedQty((state) => ({
      ...state,
      [orderItemId]: Math.max(1, Math.min(next, Math.max(1, max))),
    }));
  }

  function setNotes(orderItemId: string, value: string) {
    setNotesByItem((state) => ({ ...state, [orderItemId]: value }));
  }

  if (!shift) return <ShiftRequired title="الشكاوى" />;
  if (!(can.owner || can.takeOrders || can.billing || effectiveRole === 'shisha')) {
    return <AccessDenied title="الشكاوى" message="هذه الصفحة للمشرف أو الويتر أو الشيشة أو المعلم فقط." />;
  }

  const effectiveError = localError ?? error;
  const backHref = effectiveRole === 'barista' ? '/kitchen' : effectiveRole === 'shisha' ? '/shisha' : can.billing ? '/billing' : '/orders';
  const openComplaints = (data?.complaints ?? []).filter((item) => item.status === 'open');
  const closedComplaints = (data?.complaints ?? []).filter((item) => item.status !== 'open');

  return (
    <MobileShell title="الشكاوى" backHref={backHref}>
      {effectiveError ? (
        <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {effectiveError}
        </div>
      ) : null}

      <div className="space-y-4">
        <section className="rounded-2xl border border-slate-200 p-3">
          <div className="mb-2 text-sm font-semibold text-slate-700">إجراءات مباشرة</div>
          <div className="space-y-3">
            {(data?.items ?? []).map((item) => {
              const maxQty = Math.max(item.availableCancelQty, item.availableRemakeQty, item.availableWaiveQty, 1);
              const quantity = Math.max(1, Math.min(selectedQty[item.orderItemId] ?? 1, maxQty));
              return (
                <div key={item.orderItemId} className="rounded-2xl border border-slate-200 p-3">
                  <div className="font-semibold">{item.sessionLabel} • {item.productName}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    إلغاء غير مسلم {item.availableCancelQty} • إعادة مجانية {item.availableRemakeQty} • إسقاط {item.availableWaiveQty}
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <button
                      onClick={() => setQty(item.orderItemId, quantity - 1, maxQty)}
                      className="h-10 w-10 rounded-2xl border border-slate-200"
                    >
                      -
                    </button>
                    <div className="text-lg font-bold">{quantity}</div>
                    <button
                      onClick={() => setQty(item.orderItemId, quantity + 1, maxQty)}
                      className="h-10 w-10 rounded-2xl bg-slate-900 text-white"
                    >
                      +
                    </button>
                  </div>
                  <textarea
                    value={notesByItem[item.orderItemId] ?? ''}
                    onChange={(event) => setNotes(item.orderItemId, event.target.value)}
                    rows={2}
                    placeholder="ملاحظات الشكوى"
                    className="mt-3 w-full rounded-2xl border border-slate-200 px-3 py-3 text-right"
                  />
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <button
                      disabled={actionCommand.busy || item.availableCancelQty <= 0}
                      onClick={() => void actionCommand.run(item, 'cancel_undelivered')}
                      className="rounded-2xl border border-red-200 px-3 py-3 text-sm font-semibold text-red-700 disabled:opacity-40"
                    >
                      إلغاء غير مسلم
                    </button>
                    <button
                      disabled={actionCommand.busy || item.availableRemakeQty <= 0}
                      onClick={() => void actionCommand.run(item, 'remake')}
                      className="rounded-2xl border border-amber-200 px-3 py-3 text-sm font-semibold text-amber-700 disabled:opacity-40"
                    >
                      إعادة مجانية
                    </button>
                    <button
                      disabled={actionCommand.busy || item.availableWaiveQty <= 0}
                      onClick={() => void actionCommand.run(item, 'waive_delivered')}
                      className="rounded-2xl border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-800 disabled:opacity-40"
                    >
                      إسقاط من الحساب
                    </button>
                    <button
                      disabled={actionCommand.busy}
                      onClick={() => void actionCommand.run(item, 'none')}
                      className="rounded-2xl bg-slate-900 px-3 py-3 text-sm font-semibold text-white disabled:opacity-40"
                    >
                      تسجيل فقط
                    </button>
                  </div>
                </div>
              );
            })}
            {!data?.items?.length ? (
              <div className="text-sm text-slate-500">لا توجد عناصر قابلة للإلغاء أو الإعادة أو الإسقاط الآن.</div>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 p-3">
          <div className="mb-2 text-sm font-semibold text-slate-700">شكاوى مفتوحة</div>
          <div className="space-y-2">
            {openComplaints.map((complaint) => {
              const linkedItem = complaint.orderItemId ? itemById.get(complaint.orderItemId) : undefined;
              return (
                <div key={complaint.id} className="rounded-2xl border border-slate-200 p-3">
                  <div className="font-semibold">
                    {complaint.sessionLabel}
                    {complaint.productName ? ` • ${complaint.productName}` : ''}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {complaintKindLabel(complaint.complaintKind)}
                    {complaint.requestedQuantity ? ` • كمية ${complaint.requestedQuantity}` : ''}
                  </div>
                  {complaint.notes ? <div className="mt-2 text-sm text-slate-700">{complaint.notes}</div> : null}
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <button
                      disabled={resolveCommand.busy || !linkedItem || linkedItem.availableRemakeQty <= 0}
                      onClick={() => void resolveCommand.run(complaint, 'remake')}
                      className="rounded-2xl border border-amber-200 px-3 py-3 text-sm font-semibold text-amber-700 disabled:opacity-40"
                    >
                      إعادة مجانية
                    </button>
                    <button
                      disabled={resolveCommand.busy || !linkedItem || linkedItem.availableCancelQty <= 0}
                      onClick={() => void resolveCommand.run(complaint, 'cancel_undelivered')}
                      className="rounded-2xl border border-red-200 px-3 py-3 text-sm font-semibold text-red-700 disabled:opacity-40"
                    >
                      إلغاء غير مسلم
                    </button>
                    <button
                      disabled={resolveCommand.busy || !linkedItem || linkedItem.availableWaiveQty <= 0}
                      onClick={() => void resolveCommand.run(complaint, 'waive_delivered')}
                      className="rounded-2xl border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-800 disabled:opacity-40"
                    >
                      إسقاط من الحساب
                    </button>
                    <button
                      disabled={resolveCommand.busy}
                      onClick={() => void resolveCommand.run(complaint, 'dismissed')}
                      className="rounded-2xl bg-slate-900 px-3 py-3 text-sm font-semibold text-white disabled:opacity-40"
                    >
                      إغلاق
                    </button>
                  </div>
                </div>
              );
            })}
            {!openComplaints.length ? <div className="text-sm text-slate-500">لا توجد شكاوى مفتوحة.</div> : null}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 p-3">
          <div className="mb-2 text-sm font-semibold text-slate-700">آخر الشكاوى</div>
          <div className="space-y-2">
            {closedComplaints.map((complaint) => (
              <div key={complaint.id} className="rounded-2xl border border-slate-200 p-3">
                <div className="font-semibold">
                  {complaint.sessionLabel}
                  {complaint.productName ? ` • ${complaint.productName}` : ''}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {complaintKindLabel(complaint.complaintKind)} • {resolutionLabel(complaint.resolutionKind)}
                  {complaint.resolvedQuantity ? ` • كمية ${complaint.resolvedQuantity}` : ''}
                </div>
                {complaint.notes ? <div className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">{complaint.notes}</div> : null}
              </div>
            ))}
            {!closedComplaints.length ? <div className="text-sm text-slate-500">لا توجد سجلات مغلقة بعد.</div> : null}
          </div>
        </section>
      </div>
    </MobileShell>
  );
}
