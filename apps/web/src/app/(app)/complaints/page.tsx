'use client';

import { useCallback, useMemo, useState } from 'react';
import { MobileShell } from '@/ui/MobileShell';
import { useAuthz } from '@/lib/authz';
import { opsClient } from '@/lib/ops/client';
import type { ComplaintItemCandidate, ComplaintRecord, ComplaintsWorkspace, ItemIssueRecord } from '@/lib/ops/types';
import { AccessDenied, ShiftRequired } from '@/ui/AccessState';
import { useOpsCommand, useOpsWorkspace } from '@/lib/ops/hooks';

function complaintKindForAction(action: 'remake' | 'cancel_undelivered' | 'waive_delivered') {
  if (action === 'remake') return 'quality_issue' as const;
  if (action === 'cancel_undelivered') return 'wrong_item' as const;
  return 'billing_issue' as const;
}

function complaintKindLabel(kind: ComplaintRecord['complaintKind'] | ItemIssueRecord['issueKind']) {
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

function complaintStatusLabel(item: ComplaintRecord) {
  if (item.status === 'dismissed') return 'مغلقة';
  if (item.status === 'resolved') return 'تمت المعالجة';
  return 'مفتوحة';
}

function itemIssueActionLabel(kind: ItemIssueRecord['actionKind']) {
  switch (kind) {
    case 'note':
      return 'ملاحظة على الصنف';
    case 'remake':
      return 'إعادة مجانية';
    case 'cancel_undelivered':
      return 'إلغاء غير مسلم';
    case 'waive_delivered':
      return 'إسقاط من الحساب';
    default:
      return kind;
  }
}

function itemIssueStatusLabel(kind: ItemIssueRecord['status']) {
  switch (kind) {
    case 'applied':
      return 'تم التنفيذ';
    case 'dismissed':
      return 'مرفوضة';
    default:
      return 'مسجلة';
  }
}

export default function ComplaintsPage() {
  const { can, shift, effectiveRole } = useAuthz();
  const [localError, setLocalError] = useState<string | null>(null);
  const [selectedQty, setSelectedQty] = useState<Record<string, number>>({});
  const [notesByItem, setNotesByItem] = useState<Record<string, string>>({});
  const [generalSessionId, setGeneralSessionId] = useState('');
  const [generalKind, setGeneralKind] = useState<ComplaintRecord['complaintKind']>('other');
  const [generalNotes, setGeneralNotes] = useState('');

  const loader = useCallback(() => opsClient.complaintsWorkspace(), []);
  const { data, error } = useOpsWorkspace<ComplaintsWorkspace>(loader, {
    enabled: Boolean(shift),
  });

  const itemById = useMemo(() => new Map((data?.items ?? []).map((item) => [item.orderItemId, item])), [data?.items]);
  const sessions = data?.sessions ?? [];
  const effectiveSessionId = generalSessionId || sessions[0]?.id || '';

  const generalComplaintCommand = useOpsCommand(
    async () => {
      if (!effectiveSessionId || !generalNotes.trim()) {
        throw new Error('INVALID_INPUT');
      }
      await opsClient.createComplaint({
        mode: 'general',
        serviceSessionId: effectiveSessionId,
        complaintKind: generalKind,
        notes: generalNotes.trim(),
        action: 'none',
      });
      setGeneralNotes('');
    },
    { onError: setLocalError },
  );

  const actionCommand = useOpsCommand(
    async (item: ComplaintItemCandidate, action: 'none' | 'remake' | 'cancel_undelivered' | 'waive_delivered') => {
      const max = action === 'remake'
        ? item.availableRemakeQty
        : action === 'cancel_undelivered'
          ? item.availableCancelQty
          : action === 'waive_delivered'
            ? item.availableWaiveQty
            : Math.max(item.availableCancelQty, item.availableRemakeQty, item.availableWaiveQty, 1);
      const quantity = Math.max(1, Math.min(selectedQty[item.orderItemId] ?? 1, max));
      await opsClient.createComplaint({
        mode: 'item',
        serviceSessionId: item.serviceSessionId,
        orderItemId: item.orderItemId,
        complaintKind: action === 'none' ? 'other' : complaintKindForAction(action),
        quantity,
        notes: notesByItem[item.orderItemId]?.trim() || undefined,
        action,
      });
      setSelectedQty((state) => ({ ...state, [item.orderItemId]: 1 }));
      setNotesByItem((state) => ({ ...state, [item.orderItemId]: '' }));
    },
    { onError: setLocalError },
  );

  const resolveCommand = useOpsCommand(
    async (complaint: ComplaintRecord, resolutionKind: 'resolved' | 'dismissed') => {
      await opsClient.resolveComplaint({
        complaintId: complaint.id,
        resolutionKind,
      });
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
  const itemIssues = data?.itemIssues ?? [];

  return (
    <MobileShell title="الشكاوى" backHref={backHref}>
      {effectiveError ? (
        <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {effectiveError === 'INVALID_INPUT' ? 'أكمل البيانات المطلوبة أولاً.' : effectiveError}
        </div>
      ) : null}

      <div className="space-y-4">
        <section className="rounded-2xl border border-slate-200 p-3">
          <div className="mb-2 text-sm font-semibold text-slate-700">شكوى عامة</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <select
              value={effectiveSessionId}
              onChange={(event) => setGeneralSessionId(event.target.value)}
              className="rounded-2xl border border-slate-200 px-3 py-3 text-right"
            >
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>{session.label}</option>
              ))}
            </select>
            <select
              value={generalKind}
              onChange={(event) => setGeneralKind(event.target.value as ComplaintRecord['complaintKind'])}
              className="rounded-2xl border border-slate-200 px-3 py-3 text-right"
            >
              <option value="quality_issue">جودة</option>
              <option value="wrong_item">صنف خطأ</option>
              <option value="delay">تأخير</option>
              <option value="billing_issue">حساب</option>
              <option value="other">أخرى</option>
            </select>
          </div>
          <textarea
            value={generalNotes}
            onChange={(event) => setGeneralNotes(event.target.value)}
            rows={3}
            placeholder="اكتب الشكوى العامة أو ملاحظة الخدمة"
            className="mt-3 w-full rounded-2xl border border-slate-200 px-3 py-3 text-right"
          />
          <button
            disabled={generalComplaintCommand.busy || !effectiveSessionId || !generalNotes.trim()}
            onClick={() => void generalComplaintCommand.run()}
            className="mt-3 w-full rounded-2xl bg-slate-900 px-3 py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            تسجيل شكوى عامة
          </button>
        </section>

        <section className="rounded-2xl border border-slate-200 p-3">
          <div className="mb-2 text-sm font-semibold text-slate-700">إجراءات مرتبطة بالصنف</div>
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
                    placeholder="سبب الإجراء أو ملاحظة على الصنف"
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
                      تسجيل ملاحظة
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
          <div className="mb-2 text-sm font-semibold text-slate-700">شكاوى عامة مفتوحة</div>
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
                    {linkedItem ? ` • ${linkedItem.productName}` : ''}
                  </div>
                  {complaint.notes ? <div className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">{complaint.notes}</div> : null}
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      disabled={resolveCommand.busy}
                      onClick={() => void resolveCommand.run(complaint, 'resolved')}
                      className="rounded-2xl border border-emerald-200 px-3 py-3 text-sm font-semibold text-emerald-700 disabled:opacity-40"
                    >
                      تمت المعالجة
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
            {!openComplaints.length ? <div className="text-sm text-slate-500">لا توجد شكاوى عامة مفتوحة.</div> : null}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 p-3">
          <div className="mb-2 text-sm font-semibold text-slate-700">آخر إجراءات الأصناف</div>
          <div className="space-y-2">
            {itemIssues.map((issue) => (
              <div key={issue.id} className="rounded-2xl border border-slate-200 p-3">
                <div className="font-semibold">{issue.sessionLabel} • {issue.productName}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {itemIssueActionLabel(issue.actionKind)} • {itemIssueStatusLabel(issue.status)} • {complaintKindLabel(issue.issueKind)}
                  {issue.resolvedQuantity ? ` • كمية ${issue.resolvedQuantity}` : issue.requestedQuantity ? ` • كمية ${issue.requestedQuantity}` : ''}
                </div>
                {issue.notes ? <div className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">{issue.notes}</div> : null}
              </div>
            ))}
            {!itemIssues.length ? <div className="text-sm text-slate-500">لا توجد إجراءات أو ملاحظات أصناف حتى الآن.</div> : null}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 p-3">
          <div className="mb-2 text-sm font-semibold text-slate-700">آخر الشكاوى العامة</div>
          <div className="space-y-2">
            {closedComplaints.map((complaint) => (
              <div key={complaint.id} className="rounded-2xl border border-slate-200 p-3">
                <div className="font-semibold">
                  {complaint.sessionLabel}
                  {complaint.productName ? ` • ${complaint.productName}` : ''}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {complaintKindLabel(complaint.complaintKind)} • {complaintStatusLabel(complaint)}
                </div>
                {complaint.notes ? <div className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">{complaint.notes}</div> : null}
              </div>
            ))}
            {!closedComplaints.length ? <div className="text-sm text-slate-500">لا توجد شكاوى عامة مغلقة بعد.</div> : null}
          </div>
        </section>
      </div>
    </MobileShell>
  );
}
