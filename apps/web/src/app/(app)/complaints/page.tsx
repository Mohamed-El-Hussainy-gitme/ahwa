'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MobileShell } from '@/ui/MobileShell';
import { useAuthz } from '@/lib/authz';
import { opsClient } from '@/lib/ops/client';
import type { ComplaintItemCandidate, ComplaintRecord, ComplaintsWorkspace, ItemIssueRecord } from '@/lib/ops/types';
import { AccessDenied, ShiftRequired } from '@/ui/AccessState';
import { useOpsCommand, useOpsWorkspace } from '@/lib/ops/hooks';
import { QuantityStepper } from '@/ui/ops/QuantityStepper';

type ItemAction = 'none' | 'remake' | 'cancel_undelivered' | 'waive_delivered';

function complaintKindForAction(action: Exclude<ItemAction, 'none'>) {
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
      return 'ملاحظة';
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

function maxQtyForAction(item: ComplaintItemCandidate, action: ItemAction) {
  if (action === 'remake') return item.availableRemakeQty;
  if (action === 'cancel_undelivered') return item.availableCancelQty;
  if (action === 'waive_delivered') return item.availableWaiveQty;
  return Math.max(item.availableCancelQty, item.availableRemakeQty, item.availableWaiveQty, 1);
}

function clampQty(next: number, max: number) {
  return Math.max(1, Math.min(next, Math.max(max, 1)));
}

export default function ComplaintsPage() {
  const { can, shift, effectiveRole } = useAuthz();
  const [localError, setLocalError] = useState<string | null>(null);
  const [selectedQty, setSelectedQty] = useState<Record<string, number>>({});
  const [notesByItem, setNotesByItem] = useState<Record<string, string>>({});
  const [expandedByItem, setExpandedByItem] = useState<Record<string, boolean>>({});
  const [generalSessionId, setGeneralSessionId] = useState('');
  const [itemSessionId, setItemSessionId] = useState('');
  const [generalKind, setGeneralKind] = useState<ComplaintRecord['complaintKind']>('other');
  const [generalNotes, setGeneralNotes] = useState('');

  const loader = useCallback(() => opsClient.complaintsWorkspace(), []);
  const { data, error } = useOpsWorkspace<ComplaintsWorkspace>(loader, {
    cacheKey: 'workspace:complaints',
    staleTimeMs: 20_000,
    enabled: Boolean(shift),
  });

  const canManageComplaintActions = can.owner || can.billing;
  const sessions = data?.sessions ?? [];
  const effectiveGeneralSessionId = generalSessionId || sessions[0]?.id || '';
  const effectiveItemSessionId = itemSessionId || sessions[0]?.id || '';

  useEffect(() => {
    const firstSessionId = sessions[0]?.id ?? '';

    if (!firstSessionId) {
      if (generalSessionId) setGeneralSessionId('');
      if (itemSessionId) setItemSessionId('');
      return;
    }

    if (generalSessionId && !sessions.some((session) => session.id === generalSessionId)) {
      setGeneralSessionId(firstSessionId);
    }
    if (itemSessionId && !sessions.some((session) => session.id === itemSessionId)) {
      setItemSessionId(firstSessionId);
    }
  }, [sessions, generalSessionId, itemSessionId]);

  const sessionItems = useMemo(
    () => (data?.items ?? []).filter((item) => item.serviceSessionId === effectiveItemSessionId),
    [data?.items, effectiveItemSessionId],
  );
  const selectedSessionLabel = sessions.find((session) => session.id === effectiveItemSessionId)?.label ?? '';
  const selectedSessionIssueHistory = useMemo(
    () => (data?.itemIssues ?? []).filter((issue) => issue.serviceSessionId === effectiveItemSessionId),
    [data?.itemIssues, effectiveItemSessionId],
  );

  const generalComplaintCommand = useOpsCommand(
    async () => {
      if (!effectiveGeneralSessionId || !generalNotes.trim()) {
        throw new Error('INVALID_INPUT');
      }
      await opsClient.createComplaint({
        mode: 'general',
        serviceSessionId: effectiveGeneralSessionId,
        complaintKind: generalKind,
        notes: generalNotes.trim(),
        action: 'none',
      });
      setGeneralNotes('');
    },
    { onError: setLocalError },
  );

  const actionCommand = useOpsCommand(
    async (item: ComplaintItemCandidate, action: ItemAction) => {
      const quantity = clampQty(selectedQty[item.orderItemId] ?? 1, maxQtyForAction(item, action));
      await opsClient.createComplaint({
        mode: 'item',
        serviceSessionId: item.serviceSessionId,
        orderItemId: item.orderItemId,
        complaintKind: action === 'none' ? 'other' : complaintKindForAction(action),
        quantity: action === 'none' ? undefined : quantity,
        notes: notesByItem[item.orderItemId]?.trim() || undefined,
        action,
      });
      setSelectedQty((state) => ({ ...state, [item.orderItemId]: 1 }));
      setNotesByItem((state) => ({ ...state, [item.orderItemId]: '' }));
      setExpandedByItem((state) => ({ ...state, [item.orderItemId]: false }));
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

  if (!shift) return <ShiftRequired title="الشكاوى" />;
  if (!(can.owner || can.takeOrders || can.billing || effectiveRole === 'shisha')) {
    return <AccessDenied title="الشكاوى" message="هذه الصفحة لمشرف التشغيل أو مضيف الصالة أو مختص الشيشة أو المالك فقط." />;
  }

  const effectiveError = localError ?? error;
  const backHref = effectiveRole === 'barista' ? '/kitchen' : effectiveRole === 'shisha' ? '/shisha' : can.billing ? '/billing' : '/orders';
  const openComplaints = (data?.complaints ?? []).filter((item) => item.status === 'open');
  const closedComplaints = (data?.complaints ?? []).filter((item) => item.status !== 'open');

  return (
    <MobileShell
      title="الشكاوى"
      backHref={backHref}
      topRight={<Link href="/support?source=in_app&page=/complaints" className="ahwa-btn-secondary px-3 py-2 text-xs">دعم</Link>}
      desktopMode={can.owner ? 'admin' : 'mobile'}
    >
      {effectiveError ? (
        <div className="mb-3 ahwa-alert-danger p-3 text-sm">
          {effectiveError === 'INVALID_INPUT' ? 'أكمل البيانات المطلوبة أولاً.' : effectiveError}
        </div>
      ) : null}

      <div className="space-y-4">
        <section className="ahwa-card p-3">
          <div className="mb-2 text-sm font-semibold text-[#5e4d3f]">بلاغ عام</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <select
              value={effectiveGeneralSessionId}
              onChange={(event) => setGeneralSessionId(event.target.value)}
              className="ahwa-input text-right"
            >
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>{session.label}</option>
              ))}
            </select>
            <select
              value={generalKind}
              onChange={(event) => setGeneralKind(event.target.value as ComplaintRecord['complaintKind'])}
              className="ahwa-input text-right"
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
            className="mt-3 w-full ahwa-input text-right"
          />
          <button
            disabled={generalComplaintCommand.busy || !effectiveGeneralSessionId || !generalNotes.trim()}
            onClick={() => void generalComplaintCommand.run()}
            className="mt-3 w-full ahwa-btn-primary disabled:opacity-40"
          >
            تسجيل بلاغ عام
          </button>
        </section>

        <section className="ahwa-card p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-[#2f241b]">بلاغ على طلب</div>
            {sessions.length ? <div className="rounded-full bg-[#f4f7f9] px-3 py-1 text-xs font-semibold text-[#3c617c]">جلسات {sessions.length}</div> : null}
          </div>

          {!canManageComplaintActions ? (
            <div className="mb-3 ahwa-alert-warning p-3 text-xs">
              يمكن لمضيف الصالة ومختص الشيشة تسجيل ملاحظات فقط. الإلغاء والإعادة المجانية وإسقاط الحساب متاحة لمشرف التشغيل أو المالك فقط.
            </div>
          ) : null}

          {sessions.length ? (
            <div className="grid grid-cols-2 gap-2">
              {sessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => setItemSessionId(session.id)}
                  className={[
                    'rounded-2xl border px-3 py-3 text-right',
                    effectiveItemSessionId === session.id ? 'border-slate-900 bg-[#1e1712] text-white' : 'border-[#decdb9] bg-[#f8f1e7] text-[#2f241b]',
                  ].join(' ')}
                >
                  <div className="truncate text-sm font-bold">{session.label}</div>
                  <div className={['mt-1 text-xs', effectiveItemSessionId === session.id ? 'text-slate-200' : 'text-[#8a7763]'].join(' ')}>
                    {effectiveItemSessionId === session.id ? 'الجلسة الحالية للشكاوى' : 'اضغط لعرض أصناف الجلسة'}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="ahwa-card-dashed p-3 text-sm text-[#8a7763]">
              لا توجد جلسات مفتوحة الآن.
            </div>
          )}

          {effectiveItemSessionId ? (
            <div className="mt-3 rounded-2xl border border-[#decdb9] bg-[#f8f1e7] p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 text-right">
                  <div className="text-sm font-bold text-[#1e1712]">{selectedSessionLabel}</div>
                  <div className="mt-1 text-xs text-[#8a7763]">الأصناف الخاصة بهذه الجلسة فقط</div>
                </div>
                <div className="flex flex-wrap justify-end gap-2 text-xs font-semibold">
                  <span className="rounded-full bg-[#f3eadf] px-3 py-1 text-[#5e4d3f]">أصناف {sessionItems.length}</span>
                  {selectedSessionIssueHistory.length ? <span className="rounded-full bg-[#fcf3e7] px-3 py-1 text-[#a5671e]">سجل {selectedSessionIssueHistory.length}</span> : null}
                </div>
              </div>
            </div>
          ) : null}

          {sessionItems.length ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {sessionItems.map((item) => {
                const maxQty = maxQtyForAction(item, 'none');
                const quantity = clampQty(selectedQty[item.orderItemId] ?? 1, maxQty);
                const expanded = Boolean(expandedByItem[item.orderItemId]);
                return (
                  <div key={item.orderItemId} className="rounded-2xl border border-[#decdb9] bg-[#f8f1e7]/80 p-3">
                    <div className="text-right">
                      <div className="min-h-[2.5rem] text-sm font-bold leading-5 text-[#1e1712]">{item.productName}</div>
                      <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] font-semibold">
                        {item.availableRemakeQty > 0 ? <span className="rounded-full bg-[#fcf3e7] px-2 py-1 text-[#a5671e]">إعادة {item.availableRemakeQty}</span> : null}
                        {item.availableCancelQty > 0 ? <span className="rounded-full bg-rose-50 px-2 py-1 text-rose-700">إلغاء {item.availableCancelQty}</span> : null}
                        {item.availableWaiveQty > 0 ? <span className="rounded-full bg-violet-50 px-2 py-1 text-violet-700">إسقاط {item.availableWaiveQty}</span> : null}
                      </div>
                    </div>

                    <QuantityStepper
                      compact
                      label="الكمية"
                      value={quantity}
                      onDecrement={() => setSelectedQty((state) => ({ ...state, [item.orderItemId]: clampQty(quantity - 1, maxQty) }))}
                      onIncrement={() => setSelectedQty((state) => ({ ...state, [item.orderItemId]: clampQty(quantity + 1, maxQty) }))}
                    />

                    <div className="mt-2 space-y-2">
                      <button
                        type="button"
                        onClick={() => setExpandedByItem((state) => ({ ...state, [item.orderItemId]: !expanded }))}
                        className={[
                          'w-full rounded-2xl border px-2 py-2 text-[11px] font-semibold',
                          expanded || (notesByItem[item.orderItemId] ?? '').trim() ? 'border-[#ecd9bd] bg-[#fcf3e7] text-[#8a5a18]' : 'border-[#decdb9] bg-[#fffdf9] text-[#5e4d3f]',
                        ].join(' ')}
                      >
                        {(notesByItem[item.orderItemId] ?? '').trim() ? 'السبب محفوظ' : expanded ? 'إخفاء السبب' : 'إضافة سبب'}
                      </button>

                      {expanded ? (
                        <textarea
                          value={notesByItem[item.orderItemId] ?? ''}
                          onChange={(event) => setNotesByItem((state) => ({ ...state, [item.orderItemId]: event.target.value }))}
                          rows={2}
                          placeholder="اكتب السبب أو الملاحظة"
                          className="w-full rounded-2xl border border-[#ecd9bd] bg-[#fffdf9] px-2 py-2 text-right text-xs"
                        />
                      ) : null}

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={actionCommand.busy}
                          onClick={() => void actionCommand.run(item, 'none')}
                          className="ahwa-btn-secondary px-2 py-2 text-xs disabled:opacity-40"
                        >
                          ملاحظة
                        </button>
                        <button
                          type="button"
                          disabled={!canManageComplaintActions || actionCommand.busy || item.availableRemakeQty <= 0}
                          onClick={() => void actionCommand.run(item, 'remake')}
                          className="ahwa-btn-accent px-2 py-2 text-xs disabled:opacity-40"
                        >
                          إعادة
                        </button>
                        <button
                          type="button"
                          disabled={!canManageComplaintActions || actionCommand.busy || item.availableCancelQty <= 0}
                          onClick={() => void actionCommand.run(item, 'cancel_undelivered')}
                          className="rounded-2xl border border-rose-200 bg-rose-50 px-2 py-2 text-xs font-semibold text-rose-700 disabled:opacity-40"
                        >
                          إلغاء
                        </button>
                        <button
                          type="button"
                          disabled={!canManageComplaintActions || actionCommand.busy || item.availableWaiveQty <= 0}
                          onClick={() => void actionCommand.run(item, 'waive_delivered')}
                          className="rounded-2xl border border-violet-200 bg-violet-50 px-2 py-2 text-xs font-semibold text-violet-700 disabled:opacity-40"
                        >
                          إسقاط
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : effectiveItemSessionId ? (
            <div className="mt-3 ahwa-card-dashed p-3 text-sm text-[#8a7763]">
              لا توجد أصناف قابلة لتسجيل شكوى أو إعادة أو إسقاط في هذه الجلسة.
            </div>
          ) : null}

          {effectiveItemSessionId ? (
            <div className="mt-4 rounded-2xl border border-[#decdb9] bg-[#fffdf9] p-3">
              <div className="mb-2 text-sm font-semibold text-[#5e4d3f]">سجل هذه الجلسة</div>
              {selectedSessionIssueHistory.length ? (
                <div className="space-y-2">
                  {selectedSessionIssueHistory.map((issue) => (
                    <div key={issue.id} className="rounded-2xl border border-[#decdb9] bg-[#f8f1e7] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 text-right">
                          <div className="text-sm font-bold text-[#1e1712]">{issue.productName}</div>
                          <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] font-semibold">
                            <span className="rounded-full bg-[#f3eadf] px-2 py-1 text-[#5e4d3f]">{itemIssueActionLabel(issue.actionKind)}</span>
                            <span className="rounded-full bg-[#f4f7f9] px-2 py-1 text-[#3c617c]">{complaintKindLabel(issue.issueKind)}</span>
                            <span className="rounded-full bg-[#eff7f1] px-2 py-1 text-[#2e6a4e]">{itemIssueStatusLabel(issue.status)}</span>
                            {issue.resolvedQuantity ? <span className="rounded-full bg-[#fcf3e7] px-2 py-1 text-[#a5671e]">كمية {issue.resolvedQuantity}</span> : issue.requestedQuantity ? <span className="rounded-full bg-[#fcf3e7] px-2 py-1 text-[#a5671e]">كمية {issue.requestedQuantity}</span> : null}
                          </div>
                        </div>
                      </div>
                      {issue.notes ? <div className="mt-2 whitespace-pre-wrap text-sm text-[#5e4d3f]">{issue.notes}</div> : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="ahwa-card-dashed p-3 text-sm text-[#8a7763]">
                  لا يوجد سجل شكاوى أو إعادة عمل لهذه الجلسة بعد.
                </div>
              )}
            </div>
          ) : null}
        </section>

        <section className="ahwa-card p-3">
          <div className="mb-2 text-sm font-semibold text-[#5e4d3f]">البلاغات العامة المفتوحة</div>
          <div className="space-y-2">
            {openComplaints.map((complaint) => (
              <div key={complaint.id} className="rounded-2xl border border-[#decdb9] p-3">
                <div className="font-semibold">
                  {complaint.sessionLabel}
                  {complaint.productName ? ` • ${complaint.productName}` : ''}
                </div>
                <div className="mt-1 text-xs text-[#8a7763]">{complaintKindLabel(complaint.complaintKind)}</div>
                {complaint.notes ? <div className="mt-2 whitespace-pre-wrap text-sm text-[#5e4d3f]">{complaint.notes}</div> : null}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    disabled={!canManageComplaintActions || resolveCommand.busy}
                    onClick={() => void resolveCommand.run(complaint, 'resolved')}
                    className="ahwa-btn-success disabled:opacity-40"
                  >
                    تمت المعالجة
                  </button>
                  <button
                    disabled={!canManageComplaintActions || resolveCommand.busy}
                    onClick={() => void resolveCommand.run(complaint, 'dismissed')}
                    className="ahwa-btn-primary disabled:opacity-40"
                  >
                    إغلاق
                  </button>
                </div>
              </div>
            ))}
            {!openComplaints.length ? <div className="text-sm text-[#8a7763]">لا توجد البلاغات العامة المفتوحة.</div> : null}
          </div>
        </section>

        <section className="ahwa-card p-3">
          <div className="mb-2 text-sm font-semibold text-[#5e4d3f]">آخر البلاغات العامة</div>
          <div className="space-y-2">
            {closedComplaints.map((complaint) => (
              <div key={complaint.id} className="rounded-2xl border border-[#decdb9] p-3">
                <div className="font-semibold">
                  {complaint.sessionLabel}
                  {complaint.productName ? ` • ${complaint.productName}` : ''}
                </div>
                <div className="mt-1 text-xs text-[#8a7763]">
                  {complaintKindLabel(complaint.complaintKind)} • {complaintStatusLabel(complaint)}
                </div>
                {complaint.notes ? <div className="mt-2 whitespace-pre-wrap text-sm text-[#5e4d3f]">{complaint.notes}</div> : null}
              </div>
            ))}
            {!closedComplaints.length ? <div className="text-sm text-[#8a7763]">لا توجد بلاغات عامة مغلقة بعد.</div> : null}
          </div>
        </section>
      </div>
    </MobileShell>
  );
}
