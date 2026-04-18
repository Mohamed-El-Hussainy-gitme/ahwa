'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MobileShell } from '@/ui/MobileShell';
import { useAuthz } from '@/lib/authz';
import { opsClient } from '@/lib/ops/client';
import { OPS_CACHE_TAGS } from '@/lib/ops/cache-tags';
import { isOfflineLikeError } from '@/lib/pwa/admin-queue';
import { buildQueuedMutation, useOpsPwa } from '@/lib/pwa/provider';
import { usePersistentDraft } from '@/lib/pwa/use-persistent-draft';
import { useWorkspaceSnapshot } from '@/lib/pwa/workspace-snapshot';
import type { ComplaintItemCandidate, ComplaintRecord, ComplaintsWorkspace, ItemIssueRecord } from '@/lib/ops/types';
import { AccessDenied, ShiftRequired } from '@/ui/AccessState';
import { useOpsCommand } from '@/lib/ops/hooks';
import { QuantityStepper } from '@/ui/ops/QuantityStepper';

type ItemAction = 'none' | 'remake' | 'cancel_undelivered' | 'waive_delivered';
type QualityTab = 'active' | 'log' | 'done' | 'history';

const COMPLAINTS_DRAFT_KEYS = {
  workspace: 'ahwa:workspace:complaints:v1',
  generalSessionId: 'ahwa:draft:complaints:general-session:v1',
  itemSessionId: 'ahwa:draft:complaints:item-session:v1',
  generalKind: 'ahwa:draft:complaints:general-kind:v1',
  generalNotes: 'ahwa:draft:complaints:general-notes:v1',
  qualityTab: 'ahwa:draft:complaints:quality-tab:v1',
  selectedQty: 'ahwa:draft:complaints:selected-qty:v1',
  notesByItem: 'ahwa:draft:complaints:notes-by-item:v1',
} as const;

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
  if (item.status === 'dismissed') return 'أغلقت';
  if (item.status === 'resolved') return 'تم التحقق';
  return 'تحتاج متابعة';
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
      return 'إجراء نُفذ';
    case 'verified':
      return 'تم التحقق';
    case 'dismissed':
      return 'أغلقت';
    default:
      return 'تحتاج متابعة';
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

function metricTone(active: boolean) {
  return active ? 'border-[#ecd9bd] bg-[#fcf3e7] text-[#7c4a10]' : 'border-[#decdb9] bg-[#f8f1e7] text-[#5e4d3f]';
}

function formatIssueTime(value: string) {
  return new Date(value).toLocaleString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });
}

export default function ComplaintsPage() {
  const { can, shift, effectiveRole } = useAuthz();
  const { enqueueMutation, isOnline } = useOpsPwa();
  const [localError, setLocalError] = useState<string | null>(null);
  const [selectedQty, setSelectedQty, selectedQtyDraft] = usePersistentDraft<Record<string, number>>(COMPLAINTS_DRAFT_KEYS.selectedQty, {});
  const [notesByItem, setNotesByItem, notesByItemDraft] = usePersistentDraft<Record<string, string>>(COMPLAINTS_DRAFT_KEYS.notesByItem, {});
  const [expandedByItem, setExpandedByItem] = useState<Record<string, boolean>>({});
  const [generalSessionId, setGeneralSessionId, generalSessionDraft] = usePersistentDraft(COMPLAINTS_DRAFT_KEYS.generalSessionId, '');
  const [itemSessionId, setItemSessionId, itemSessionDraft] = usePersistentDraft(COMPLAINTS_DRAFT_KEYS.itemSessionId, '');
  const [generalKind, setGeneralKind, generalKindDraft] = usePersistentDraft<ComplaintRecord['complaintKind']>(COMPLAINTS_DRAFT_KEYS.generalKind, 'other');
  const [generalNotes, setGeneralNotes, generalNotesDraft] = usePersistentDraft(COMPLAINTS_DRAFT_KEYS.generalNotes, '');
  const [qualityTab, setQualityTab] = usePersistentDraft<QualityTab>(COMPLAINTS_DRAFT_KEYS.qualityTab, 'active');

  const complaintsWorkspace = useWorkspaceSnapshot<ComplaintsWorkspace>(useCallback(() => opsClient.complaintsWorkspace(), []), {
    cacheKey: 'workspace:complaints',
    staleTimeMs: 20_000,
    enabled: Boolean(shift),
    invalidationTags: [OPS_CACHE_TAGS.complaints, OPS_CACHE_TAGS.orders, OPS_CACHE_TAGS.sessions, OPS_CACHE_TAGS.billing, OPS_CACHE_TAGS.reports],
    storageKey: COMPLAINTS_DRAFT_KEYS.workspace,
  });
  const data = complaintsWorkspace.data;
  const error = complaintsWorkspace.error;

  const canManageComplaintActions = can.owner || can.billing;
  const sessions = data?.sessions ?? [];
  const currentShiftId = data?.shift?.id ?? '';
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

  const complaints = data?.complaints ?? [];
  const itemIssues = data?.itemIssues ?? [];

  const activeGeneral = complaints.filter((item) => item.status === 'open');
  const activeItemIssues = itemIssues.filter((item) => item.status === 'logged' || item.status === 'applied');
  const doneGeneralToday = complaints.filter((item) => item.shiftId === currentShiftId && item.status !== 'open');
  const doneItemIssuesToday = itemIssues.filter((item) => item.shiftId === currentShiftId && (item.status === 'applied' || item.status === 'verified' || item.status === 'dismissed'));
  const historyGeneral = complaints.filter((item) => item.status !== 'open' || item.isCarryOver).slice(0, 30);
  const historyItemIssues = itemIssues.filter((item) => item.status !== 'logged' || item.isCarryOver).slice(0, 40);
  const carryOverCount = activeGeneral.filter((item) => item.isCarryOver).length + activeItemIssues.filter((item) => item.isCarryOver).length;

  const queueTags = [OPS_CACHE_TAGS.complaints, OPS_CACHE_TAGS.orders, OPS_CACHE_TAGS.sessions, OPS_CACHE_TAGS.billing, OPS_CACHE_TAGS.reports] as const;

  const runQueueableComplaintMutation = useCallback(async (options: {
    url: string;
    body: unknown;
    successMessage: string;
    queuedMessage: string;
    onSuccess?: () => void;
    onQueued?: () => void;
  }) => {
    if (!isOnline) {
      await enqueueMutation(buildQueuedMutation({ url: options.url, method: 'POST', body: options.body, label: options.queuedMessage, invalidateTags: queueTags }));
      options.onQueued?.();
      setLocalError(options.queuedMessage);
      return;
    }
    try {
      const response = await fetch(options.url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(options.body),
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || payload?.message || 'REQUEST_FAILED');
      }
      await complaintsWorkspace.reload();
      options.onSuccess?.();
      setLocalError(options.successMessage);
    } catch (error) {
      if (!isOfflineLikeError(error)) {
        throw error;
      }
      await enqueueMutation(buildQueuedMutation({ url: options.url, method: 'POST', body: options.body, label: options.queuedMessage, invalidateTags: queueTags }));
      options.onQueued?.();
      setLocalError(options.queuedMessage);
    }
  }, [complaintsWorkspace, enqueueMutation, isOnline]);

  const generalComplaintCommand = useOpsCommand(
    async () => {
      if (!effectiveGeneralSessionId || !generalNotes.trim()) throw new Error('INVALID_INPUT');
      await runQueueableComplaintMutation({
        url: '/api/ops/complaints/create',
        body: {
          mode: 'general',
          serviceSessionId: effectiveGeneralSessionId,
          complaintKind: generalKind,
          notes: generalNotes.trim(),
          action: 'none',
        },
        successMessage: 'تم تسجيل الملاحظة العامة.',
        queuedMessage: 'تم حفظ الملاحظة العامة في الطابور المحلي.',
        onSuccess: () => {
          generalNotesDraft.resetDraft();
        },
        onQueued: () => {
          generalNotesDraft.resetDraft();
        },
      });
    },
    { onError: setLocalError },
  );

  const actionCommand = useOpsCommand(
    async (item: ComplaintItemCandidate, action: ItemAction) => {
      const quantity = clampQty(selectedQty[item.orderItemId] ?? 1, maxQtyForAction(item, action));
      await runQueueableComplaintMutation({
        url: '/api/ops/complaints/create',
        body: {
          mode: 'item',
          serviceSessionId: item.serviceSessionId,
          orderItemId: item.orderItemId,
          complaintKind: action === 'none' ? 'other' : complaintKindForAction(action),
          quantity: action === 'none' ? undefined : quantity,
          notes: notesByItem[item.orderItemId]?.trim() || undefined,
          action,
        },
        successMessage: 'تم حفظ الإجراء على الصنف.',
        queuedMessage: 'تم حفظ الإجراء على الصنف في الطابور المحلي.',
        onSuccess: () => {
          setSelectedQty((state) => ({ ...state, [item.orderItemId]: 1 }));
          setNotesByItem((state) => ({ ...state, [item.orderItemId]: '' }));
          setExpandedByItem((state) => ({ ...state, [item.orderItemId]: false }));
        },
        onQueued: () => {
          setSelectedQty((state) => ({ ...state, [item.orderItemId]: 1 }));
          setNotesByItem((state) => ({ ...state, [item.orderItemId]: '' }));
          setExpandedByItem((state) => ({ ...state, [item.orderItemId]: false }));
        },
      });
    },
    { onError: setLocalError },
  );

  const resolveCommand = useOpsCommand(
    async (complaint: ComplaintRecord, resolutionKind: 'resolved' | 'dismissed') => {
      await runQueueableComplaintMutation({
        url: '/api/ops/complaints/resolve',
        body: { complaintId: complaint.id, resolutionKind },
        successMessage: resolutionKind === 'resolved' ? 'تم اعتماد معالجة الملاحظة.' : 'تم إغلاق الملاحظة.',
        queuedMessage: resolutionKind === 'resolved' ? 'تم حفظ اعتماد الملاحظة في الطابور المحلي.' : 'تم حفظ إغلاق الملاحظة في الطابور المحلي.',
      });
    },
    { onError: setLocalError },
  );

  const updateItemIssueCommand = useOpsCommand(
    async (itemIssue: ItemIssueRecord, status: 'applied' | 'verified' | 'dismissed') => {
      await runQueueableComplaintMutation({
        url: '/api/ops/complaints/item-issues/update',
        body: { itemIssueId: itemIssue.id, status },
        successMessage: status === 'verified' ? 'تم التحقق من الإجراء.' : status === 'dismissed' ? 'تم إغلاق الإجراء.' : 'تم تثبيت الإجراء على الصنف.',
        queuedMessage: status === 'verified' ? 'تم حفظ التحقق من الإجراء في الطابور المحلي.' : status === 'dismissed' ? 'تم حفظ إغلاق الإجراء في الطابور المحلي.' : 'تم حفظ تحديث الإجراء في الطابور المحلي.',
      });
    },
    { onError: setLocalError },
  );

  if (!shift) return <ShiftRequired title="الملاحظات والجودة" />;
  if (!(can.owner || can.takeOrders || can.billing || effectiveRole === 'shisha')) {
    return <AccessDenied title="الملاحظات والجودة" message="هذه الصفحة لمشرف التشغيل أو مضيف الصالة أو مختص الشيشة أو المالك فقط." />;
  }

  const effectiveError = localError ?? error;
  const backHref = effectiveRole === 'barista' ? '/kitchen' : effectiveRole === 'shisha' ? '/shisha' : can.billing ? '/billing' : '/orders';

  return (
    <MobileShell
      title="الملاحظات والجودة"
      backHref={backHref}
      topRight={<Link href="/support?source=in_app&page=/complaints" className="ahwa-btn-secondary px-3 py-2 text-xs">دعم</Link>}
      desktopMode={can.owner ? 'admin' : 'mobile'}
    >
      {effectiveError ? (
        <div className={`mb-3 p-3 text-sm ${effectiveError === 'INVALID_INPUT' ? 'ahwa-alert-danger' : (effectiveError.includes('تم ') || effectiveError.includes('الطابور المحلي')) ? 'ahwa-alert-success' : 'ahwa-alert-danger'}`}>
          {effectiveError === 'INVALID_INPUT' ? 'أكمل البيانات المطلوبة أولاً.' : effectiveError}
        </div>
      ) : null}
      {complaintsWorkspace.usingSnapshotFallback ? <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">تعرض الصفحة آخر نسخة جودة محفوظة محليًا لحين عودة الاتصال.</div> : null}

      <div className="space-y-4">
        <section className="ahwa-card p-3">
          <div className="mb-3 text-sm font-semibold text-[#2f241b]">لوحة الجودة الآن</div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <div className={`rounded-2xl border px-3 py-3 text-center ${metricTone(activeGeneral.length > 0)}`}>
              <div className="text-[11px]">ملاحظات عامة مفتوحة</div>
              <div className="mt-1 text-lg font-bold">{activeGeneral.length}</div>
            </div>
            <div className={`rounded-2xl border px-3 py-3 text-center ${metricTone(activeItemIssues.length > 0)}`}>
              <div className="text-[11px]">إجراءات أصناف تحتاج متابعة</div>
              <div className="mt-1 text-lg font-bold">{activeItemIssues.length}</div>
            </div>
            <div className={`rounded-2xl border px-3 py-3 text-center ${metricTone(carryOverCount > 0)}`}>
              <div className="text-[11px]">حالات مرحّلة من ورديات سابقة</div>
              <div className="mt-1 text-lg font-bold">{carryOverCount}</div>
            </div>
            <div className="rounded-2xl border border-[#decdb9] bg-[#f8f1e7] px-3 py-3 text-center text-[#5e4d3f]">
              <div className="text-[11px]">تم اليوم</div>
              <div className="mt-1 text-lg font-bold">{doneGeneralToday.length + doneItemIssuesToday.length}</div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
            {[
              { key: 'active', label: 'يحتاج متابعة الآن' },
              { key: 'log', label: 'تسجيل وتنفيذ' },
              { key: 'done', label: 'تم اليوم' },
              { key: 'history', label: 'أرشيف قريب' },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setQualityTab(tab.key as QualityTab)}
                className={[
                  'rounded-2xl border px-3 py-3 text-sm font-semibold',
                  qualityTab === tab.key ? 'border-neutral-900 bg-[#1e1712] text-white' : 'border-[#decdb9] bg-[#fffdf9] text-[#5e4d3f]',
                ].join(' ')}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </section>

        {qualityTab === 'active' ? (
          <section className="space-y-3">
            <div className="ahwa-card p-3">
              <div className="mb-2 text-sm font-semibold text-[#5e4d3f]">الملاحظات العامة المفتوحة</div>
              <div className="space-y-2">
                {activeGeneral.map((complaint) => (
                  <div key={complaint.id} className="rounded-2xl border border-[#decdb9] bg-[#fffdf9] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-[#1e1712]">{complaint.sessionLabel}{complaint.productName ? ` • ${complaint.productName}` : ''}</div>
                        <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-[#8a7763]">
                          <span>{complaintKindLabel(complaint.complaintKind)}</span>
                          <span>{formatIssueTime(complaint.createdAt)}</span>
                          {complaint.isCarryOver ? <span className="rounded-full bg-[#fcf3e7] px-2 py-1 font-semibold text-[#a5671e]">مرحّلة من وردية سابقة</span> : null}
                        </div>
                      </div>
                    </div>
                    {complaint.notes ? <div className="mt-2 whitespace-pre-wrap text-sm text-[#5e4d3f]">{complaint.notes}</div> : null}
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        disabled={!canManageComplaintActions || resolveCommand.busy}
                        onClick={() => void resolveCommand.run(complaint, 'resolved')}
                        className="ahwa-btn-success disabled:opacity-40"
                      >
                        تم التحقق
                      </button>
                      <button
                        disabled={!canManageComplaintActions || resolveCommand.busy}
                        onClick={() => void resolveCommand.run(complaint, 'dismissed')}
                        className="ahwa-btn-primary disabled:opacity-40"
                      >
                        إغلاق بدون متابعة
                      </button>
                    </div>
                  </div>
                ))}
                {!activeGeneral.length ? <div className="ahwa-card-dashed p-3 text-sm text-[#8a7763]">لا توجد ملاحظات عامة مفتوحة الآن.</div> : null}
              </div>
            </div>

            <div className="ahwa-card p-3">
              <div className="mb-2 text-sm font-semibold text-[#5e4d3f]">إجراءات الأصناف التي تحتاج متابعة</div>
              <div className="space-y-2">
                {activeItemIssues.map((issue) => (
                  <div key={issue.id} className="rounded-2xl border border-[#decdb9] bg-[#fffdf9] p-3">
                    <div className="font-semibold text-[#1e1712]">{issue.sessionLabel} • {issue.productName}</div>
                    <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-[#8a7763]">
                      <span>{itemIssueActionLabel(issue.actionKind)}</span>
                      <span>{complaintKindLabel(issue.issueKind)}</span>
                      <span>{itemIssueStatusLabel(issue.status)}</span>
                      <span>{formatIssueTime(issue.createdAt)}</span>
                      {issue.isCarryOver ? <span className="rounded-full bg-[#fcf3e7] px-2 py-1 font-semibold text-[#a5671e]">مرحّلة من وردية سابقة</span> : null}
                    </div>
                    {issue.notes ? <div className="mt-2 whitespace-pre-wrap text-sm text-[#5e4d3f]">{issue.notes}</div> : null}
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        disabled={!canManageComplaintActions || updateItemIssueCommand.busy}
                        onClick={() => void updateItemIssueCommand.run(issue, 'verified')}
                        className="ahwa-btn-success disabled:opacity-40"
                      >
                        تم التحقق
                      </button>
                      <button
                        disabled={!canManageComplaintActions || updateItemIssueCommand.busy}
                        onClick={() => void updateItemIssueCommand.run(issue, 'dismissed')}
                        className="ahwa-btn-primary disabled:opacity-40"
                      >
                        إغلاق
                      </button>
                    </div>
                  </div>
                ))}
                {!activeItemIssues.length ? <div className="ahwa-card-dashed p-3 text-sm text-[#8a7763]">لا توجد إجراءات أصناف مفتوحة الآن.</div> : null}
              </div>
            </div>
          </section>
        ) : null}

        {qualityTab === 'log' ? (
          <section className="space-y-4">
            <section className="ahwa-card p-3">
              <div className="mb-2 text-sm font-semibold text-[#5e4d3f]">ملاحظة عامة على الجلسة</div>
              <div className="grid gap-2 sm:grid-cols-2">
                <select value={effectiveGeneralSessionId} onChange={(event) => setGeneralSessionId(event.target.value)} className="ahwa-input text-right">
                  {sessions.map((session) => <option key={session.id} value={session.id}>{session.label}</option>)}
                </select>
                <select value={generalKind} onChange={(event) => setGeneralKind(event.target.value as ComplaintRecord['complaintKind'])} className="ahwa-input text-right">
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
                placeholder="اكتب الملاحظة العامة أو سبب المتابعة"
                className="mt-3 w-full ahwa-input text-right"
              />
              <button
                disabled={generalComplaintCommand.busy || !effectiveGeneralSessionId || !generalNotes.trim()}
                onClick={() => void generalComplaintCommand.run()}
                className="mt-3 w-full ahwa-btn-primary disabled:opacity-40"
              >
                حفظ الملاحظة العامة
              </button>
            </section>

            <section className="ahwa-card p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-[#2f241b]">إجراء أو ملاحظة على صنف</div>
                {sessions.length ? <div className="rounded-full bg-[#f4f7f9] px-3 py-1 text-xs font-semibold text-[#3c617c]">جلسات {sessions.length}</div> : null}
              </div>

              {!canManageComplaintActions ? (
                <div className="mb-3 ahwa-alert-warning p-3 text-xs">
                  يمكن لمضيف الصالة ومختص الشيشة تسجيل ملاحظات فقط. الإعادة والإلغاء والإسقاط متاحة لمشرف التشغيل أو المالك فقط.
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
                        اختر الجلسة ثم سجّل الملاحظة أو الإجراء
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="ahwa-card-dashed p-3 text-sm text-[#8a7763]">لا توجد جلسات مفتوحة الآن.</div>
              )}

              {effectiveItemSessionId ? (
                <div className="mt-3 rounded-2xl border border-[#decdb9] bg-[#f8f1e7] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 text-right">
                      <div className="text-sm font-bold text-[#1e1712]">{selectedSessionLabel}</div>
                      <div className="mt-1 text-xs text-[#8a7763]">الأصناف الخاصة بهذه الجلسة فقط</div>
                    </div>
                    <div className="rounded-full bg-[#f3eadf] px-3 py-1 text-xs font-semibold text-[#5e4d3f]">أصناف {sessionItems.length}</div>
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
                            <button type="button" disabled={actionCommand.busy} onClick={() => void actionCommand.run(item, 'none')} className="ahwa-btn-secondary px-2 py-2 text-xs disabled:opacity-40">ملاحظة</button>
                            <button type="button" disabled={!canManageComplaintActions || actionCommand.busy || item.availableRemakeQty <= 0} onClick={() => void actionCommand.run(item, 'remake')} className="ahwa-btn-accent px-2 py-2 text-xs disabled:opacity-40">إعادة</button>
                            <button type="button" disabled={!canManageComplaintActions || actionCommand.busy || item.availableCancelQty <= 0} onClick={() => void actionCommand.run(item, 'cancel_undelivered')} className="rounded-2xl border border-rose-200 bg-rose-50 px-2 py-2 text-xs font-semibold text-rose-700 disabled:opacity-40">إلغاء</button>
                            <button type="button" disabled={!canManageComplaintActions || actionCommand.busy || item.availableWaiveQty <= 0} onClick={() => void actionCommand.run(item, 'waive_delivered')} className="rounded-2xl border border-violet-200 bg-violet-50 px-2 py-2 text-xs font-semibold text-violet-700 disabled:opacity-40">إسقاط</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : effectiveItemSessionId ? (
                <div className="mt-3 ahwa-card-dashed p-3 text-sm text-[#8a7763]">لا توجد أصناف قابلة للتسجيل أو الإجراء في هذه الجلسة.</div>
              ) : null}
            </section>
          </section>
        ) : null}

        {qualityTab === 'done' ? (
          <section className="space-y-3">
            <div className="ahwa-card p-3">
              <div className="mb-2 text-sm font-semibold text-[#5e4d3f]">ما تم اليوم</div>
              <div className="space-y-2">
                {doneGeneralToday.map((complaint) => (
                  <div key={complaint.id} className="rounded-2xl border border-[#decdb9] p-3">
                    <div className="font-semibold">{complaint.sessionLabel}</div>
                    <div className="mt-1 text-xs text-[#8a7763]">{complaintKindLabel(complaint.complaintKind)} • {complaintStatusLabel(complaint)}</div>
                    {complaint.notes ? <div className="mt-2 whitespace-pre-wrap text-sm text-[#5e4d3f]">{complaint.notes}</div> : null}
                  </div>
                ))}
                {doneItemIssuesToday.map((issue) => (
                  <div key={issue.id} className="rounded-2xl border border-[#decdb9] p-3">
                    <div className="font-semibold">{issue.sessionLabel} • {issue.productName}</div>
                    <div className="mt-1 text-xs text-[#8a7763]">{itemIssueActionLabel(issue.actionKind)} • {itemIssueStatusLabel(issue.status)}</div>
                    {issue.notes ? <div className="mt-2 whitespace-pre-wrap text-sm text-[#5e4d3f]">{issue.notes}</div> : null}
                  </div>
                ))}
                {!doneGeneralToday.length && !doneItemIssuesToday.length ? <div className="ahwa-card-dashed p-3 text-sm text-[#8a7763]">لا توجد حالات مغلقة أو موثقة في الوردية الحالية بعد.</div> : null}
              </div>
            </div>
          </section>
        ) : null}

        {qualityTab === 'history' ? (
          <section className="space-y-3">
            <div className="ahwa-card p-3">
              <div className="mb-2 text-sm font-semibold text-[#5e4d3f]">أرشيف قريب للملاحظات العامة</div>
              <div className="space-y-2">
                {historyGeneral.map((complaint) => (
                  <div key={complaint.id} className="rounded-2xl border border-[#decdb9] p-3">
                    <div className="font-semibold">{complaint.sessionLabel}</div>
                    <div className="mt-1 text-xs text-[#8a7763]">{complaintKindLabel(complaint.complaintKind)} • {complaintStatusLabel(complaint)} {complaint.isCarryOver ? '• مرحّلة' : ''}</div>
                    {complaint.notes ? <div className="mt-2 whitespace-pre-wrap text-sm text-[#5e4d3f]">{complaint.notes}</div> : null}
                  </div>
                ))}
                {!historyGeneral.length ? <div className="ahwa-card-dashed p-3 text-sm text-[#8a7763]">لا يوجد أرشيف قريب للملاحظات العامة.</div> : null}
              </div>
            </div>
            <div className="ahwa-card p-3">
              <div className="mb-2 text-sm font-semibold text-[#5e4d3f]">أرشيف قريب لإجراءات الأصناف</div>
              <div className="space-y-2">
                {historyItemIssues.map((issue) => (
                  <div key={issue.id} className="rounded-2xl border border-[#decdb9] p-3">
                    <div className="font-semibold">{issue.sessionLabel} • {issue.productName}</div>
                    <div className="mt-1 text-xs text-[#8a7763]">{itemIssueActionLabel(issue.actionKind)} • {itemIssueStatusLabel(issue.status)} {issue.isCarryOver ? '• مرحّلة' : ''}</div>
                    {issue.notes ? <div className="mt-2 whitespace-pre-wrap text-sm text-[#5e4d3f]">{issue.notes}</div> : null}
                  </div>
                ))}
                {!historyItemIssues.length ? <div className="ahwa-card-dashed p-3 text-sm text-[#8a7763]">لا يوجد أرشيف قريب لإجراءات الأصناف.</div> : null}
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </MobileShell>
  );
}
