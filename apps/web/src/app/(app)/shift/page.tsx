'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { MobileShell } from '@/ui/MobileShell';
import { useAuthz } from '@/lib/authz';
import { AccessDenied } from '@/ui/AccessState';
import { apiPost } from '@/lib/http/client';
import { isOfflineLikeError } from '@/lib/pwa/admin-queue';
import { buildQueuedMutation, useOpsPwa } from '@/lib/pwa/provider';
import { usePersistentDraft } from '@/lib/pwa/use-persistent-draft';
import type { OperatingSettings, ShiftAssignmentTemplate, ShiftChecklistFlags, ShiftChecklistRecord, ShiftChecklistStatus, ShiftInventorySnapshot } from '@/lib/ops/types';
import { extractApiErrorMessage } from '@/lib/api/errors';
import { emptyShiftChecklistFlags } from '@/lib/ops/shift-checklists';
import { RecoveryPanel } from '@/ui/ops/RecoveryPanel';
import {
  opsAccentButton,
  opsBadge,
  opsDashed,
  opsGhostButton,
  opsInset,
  opsMetricCard,
  opsPrimaryButton,
  opsSelect,
  opsSurface,
} from '@/ui/ops/premiumStyles';

type ShiftKind = 'morning' | 'evening';
type ShiftRole = 'supervisor' | 'waiter' | 'barista' | 'shisha' | 'american_waiter';
type ShiftStatus = 'open' | 'closing' | 'closed' | 'draft' | 'cancelled';

type StaffEmploymentStatus = 'active' | 'inactive' | 'left';

type AssignableActorRow = {
  id: string;
  fullName: string | null;
  employeeCode: string | null;
  accountKind: string;
  actorType: 'owner' | 'staff';
  isActive: boolean;
  employmentStatus?: StaffEmploymentStatus;
  isCurrentOwner?: boolean;
};

type AssignmentRow = {
  id: string;
  userId: string;
  role: ShiftRole;
  fullName?: string | null;
  isActive?: boolean;
  actorType?: 'owner' | 'staff';
};

type ShiftRow = {
  id: string;
  kind: ShiftKind;
  businessDate: string | null;
  status: ShiftStatus;
  isOpen: boolean;
  startedAt: string | null;
  closedAt: string | null;
  notes: string | null;
  supervisorUserId: string | null;
};

type ShiftHistoryRow = {
  id: string;
  kind: ShiftKind;
  isOpen: boolean;
  startedAt: string | null;
  endedAt: string | null;
};

type RawShiftSnapshot = {
  inventory?: ShiftInventorySnapshot | null;
  complaints?: Array<Record<string, unknown>>;
  item_issues?: Array<Record<string, unknown>>;
  shift?: {
    shift_id?: string;
    shift_kind?: string;
    business_date?: string;
    status?: string;
    opened_at?: string | null;
    closed_at?: string | null;
    snapshotTakenAt?: string | null;
    snapshotPhase?: string | null;
  };
  totals?: {
    cash_total?: string | number | null;
    deferred_total?: string | number | null;
    delivered_qty?: string | number | null;
    remade_qty?: string | number | null;
    item_net_sales?: string | number | null;
    net_sales?: string | number | null;
    recognized_sales?: string | number | null;
    sales_reconciliation_gap?: string | number | null;
    complaint_total?: string | number | null;
    complaint_open?: string | number | null;
    item_issue_total?: string | number | null;
    item_issue_note?: string | number | null;
    complaint_remake?: string | number | null;
    complaint_cancel?: string | number | null;
    complaint_waive?: string | number | null;
  };
  staff?: Array<{
    actor_label?: string | null;
    submitted_qty?: string | number | null;
    ready_qty?: string | number | null;
    delivered_qty?: string | number | null;
    payment_total?: string | number | null;
  }>;
  summary?: {
    netSales?: string | number | null;
    cashSales?: string | number | null;
    deferredSales?: string | number | null;
    deliveredItemCount?: string | number | null;
    remadeItemCount?: string | number | null;
  };
  employees?: Array<{
    userId?: string;
    fullName?: string | null;
    shiftRole?: ShiftRole;
    deliveredItemCount?: string | number | null;
    preparedItemCount?: string | number | null;
    cashCollected?: string | number | null;
    deferredBooked?: string | number | null;
  }>;
  checklists?: ShiftChecklistRecord[];
};

type NormalizedSnapshot = {
  inventory: ShiftInventorySnapshot | null;
  shift: {
    id: string;
    businessDate: string;
    status: string;
    openedAt?: string | null;
    closedAt?: string | null;
    snapshotTakenAt?: string | null;
    snapshotPhase?: string | null;
  };
  summary: {
    netSales: number;
    cashSales: number;
    deferredSales: number;
    deliveredItemCount: number;
    remadeItemCount: number;
    qualityNoteCount: number;
    qualityOpenCount: number;
    itemIssueCount: number;
    itemIssueNoteCount: number;
    remakeIssueCount: number;
    cancelIssueCount: number;
    waiveIssueCount: number;
  };
  employees: Array<{
    userId: string;
    fullName: string;
    shiftRole?: ShiftRole;
    deliveredItemCount: number;
    preparedItemCount: number;
    cashCollected: number;
    deferredBooked: number;
  }>;
  checklists: ShiftChecklistRecord[];
};

type ChecklistStage = 'opening' | 'closing';

type ShiftChecklistFormState = {
  checklist: ShiftChecklistFlags;
  quickCashCount: string;
  supervisorNotes: string;
  issuesSummary: string;
  status: ShiftChecklistStatus;
};

const SHIFT_DRAFT_KEYS = {
  openingChecklist: 'ahwa:draft:shift:opening-checklist:v1',
  closingChecklist: 'ahwa:draft:shift:closing-checklist:v1',
} as const;

function roleLabel(role: ShiftRole) {
  switch (role) {
    case 'supervisor':
      return 'مشرف التشغيل';
    case 'waiter':
      return 'مضيف الصالة';
    case 'barista':
      return 'الباريستا';
    case 'shisha':
      return 'مختص الشيشة';
    case 'american_waiter':
      return 'الكابتن كابتن';
  }
}

function kindLabel(kind: ShiftKind) {
  return kind === 'morning' ? 'صباحية' : 'مسائية';
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-';
  return new Date(value).toLocaleString('ar-EG');
}

function toNumber(value: string | number | null | undefined) {
  const numeric = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatMoney(value: string | number | null | undefined) {
  return toNumber(value).toLocaleString('ar-EG');
}

function formatQty(value: string | number | null | undefined) {
  return toNumber(value).toLocaleString('ar-EG', { maximumFractionDigits: 3 });
}

function checklistStageLabel(stage: ChecklistStage) {
  return stage === 'opening' ? 'Checklist الافتتاح' : 'Checklist الإغلاق';
}

function createChecklistFormState(): ShiftChecklistFormState {
  return {
    checklist: emptyShiftChecklistFlags(),
    quickCashCount: '',
    supervisorNotes: '',
    issuesSummary: '',
    status: 'draft',
  };
}

function mapChecklistToFormState(record: ShiftChecklistRecord | null | undefined): ShiftChecklistFormState {
  if (!record) return createChecklistFormState();
  return {
    checklist: { ...emptyShiftChecklistFlags(), ...(record.checklist ?? {}) },
    quickCashCount: record.quickCashCount == null ? '' : String(record.quickCashCount),
    supervisorNotes: record.supervisorNotes ?? '',
    issuesSummary: record.issuesSummary ?? '',
    status: record.status ?? 'draft',
  };
}

function buildChecklistPayload(form: ShiftChecklistFormState, status: ShiftChecklistStatus): {
  checklist: ShiftChecklistFlags;
  quickCashCount: number | null;
  supervisorNotes: string | null;
  issuesSummary: string | null;
  status: ShiftChecklistStatus;
} {
  const quickCashCount = form.quickCashCount.trim() ? Number(form.quickCashCount) : null;
  return {
    checklist: {
      ...form.checklist,
      supervisorSignoffName: form.checklist.supervisorSignoffName?.trim() ? form.checklist.supervisorSignoffName.trim() : null,
    },
    quickCashCount: quickCashCount != null && Number.isFinite(quickCashCount) ? quickCashCount : null,
    supervisorNotes: form.supervisorNotes.trim() || null,
    issuesSummary: form.issuesSummary.trim() || null,
    status,
  };
}

function findChecklistByStage(checklists: ShiftChecklistRecord[], stage: ChecklistStage) {
  return checklists.find((item) => item.stage === stage) ?? null;
}

function normalizeSnapshot(snapshot: RawShiftSnapshot | null): NormalizedSnapshot | null {
  if (!snapshot) return null;

  const cashSales = toNumber(snapshot.summary?.cashSales ?? snapshot.totals?.cash_total);
  const deferredSales = toNumber(snapshot.summary?.deferredSales ?? snapshot.totals?.deferred_total);

  const employees =
    Array.isArray(snapshot.employees) && snapshot.employees.length > 0
      ? snapshot.employees.map((item, index) => ({
          userId: item.userId ?? `employee-${index}`,
          fullName: item.fullName ?? item.userId ?? 'غير معروف',
          shiftRole: item.shiftRole,
          deliveredItemCount: toNumber(item.deliveredItemCount),
          preparedItemCount: toNumber(item.preparedItemCount),
          cashCollected: toNumber(item.cashCollected),
          deferredBooked: toNumber(item.deferredBooked),
        }))
      : Array.isArray(snapshot.staff)
        ? snapshot.staff.map((item, index) => ({
            userId: `staff-${index}`,
            fullName: item.actor_label ?? 'غير معروف',
            deliveredItemCount: toNumber(item.delivered_qty),
            preparedItemCount: toNumber(item.ready_qty),
            cashCollected: toNumber(item.payment_total),
            deferredBooked: 0,
          }))
        : [];

  const itemNetSales = toNumber(snapshot.summary?.netSales ?? snapshot.totals?.item_net_sales ?? snapshot.totals?.net_sales);
  const reconciledNetSales = Math.max(itemNetSales, cashSales + deferredSales);

  return {
    inventory: snapshot.inventory ?? null,
    shift: {
      id: snapshot.shift?.shift_id ?? '',
      businessDate: snapshot.shift?.business_date ?? '-',
      status: snapshot.shift?.status ?? '-',
      openedAt: snapshot.shift?.opened_at ?? null,
      closedAt: snapshot.shift?.closed_at ?? null,
      snapshotTakenAt: snapshot.shift?.snapshotTakenAt ?? snapshot.shift?.closed_at ?? null,
      snapshotPhase: snapshot.shift?.snapshotPhase ?? 'ops',
    },
    summary: {
      netSales: reconciledNetSales,
      cashSales,
      deferredSales,
      deliveredItemCount: toNumber(snapshot.summary?.deliveredItemCount ?? snapshot.totals?.delivered_qty),
      remadeItemCount: toNumber(snapshot.summary?.remadeItemCount ?? snapshot.totals?.remade_qty),
      qualityNoteCount: toNumber(snapshot.totals?.complaint_total),
      qualityOpenCount: toNumber(snapshot.totals?.complaint_open),
      itemIssueCount: toNumber(snapshot.totals?.item_issue_total),
      itemIssueNoteCount: toNumber(snapshot.totals?.item_issue_note),
      remakeIssueCount: toNumber(snapshot.totals?.complaint_remake),
      cancelIssueCount: toNumber(snapshot.totals?.complaint_cancel),
      waiveIssueCount: toNumber(snapshot.totals?.complaint_waive),
    },
    employees,
    checklists: Array.isArray(snapshot.checklists) ? snapshot.checklists : [],
  };
}

function submitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>, submit: () => void) {
  if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
  event.preventDefault();
  submit();
}

const CHECKLIST_TOGGLES: Array<{ key: keyof Omit<ShiftChecklistFlags, 'supervisorSignoffName'>; label: string; hint: string }> = [
  { key: 'cashVerified', label: 'جرد النقدية السريع', hint: 'تأكيد العد ومطابقة المبلغ الافتتاحي أو الختامي.' },
  { key: 'criticalInventoryReady', label: 'الخامات الحرجة', hint: 'تأكيد توفر اللبن والقهوة والفحم والجراك والمواد الأساسية.' },
  { key: 'machineReady', label: 'جاهزية الماكينة', hint: 'فحص التشغيل والحرارة والتنظيف السريع.' },
  { key: 'grinderReady', label: 'جاهزية المطحنة', hint: 'فحص الطحن والضبط والتنظيف.' },
  { key: 'shishaReady', label: 'جاهزية الشيشة', hint: 'فحص الرؤوس والفحم والتجهيز.' },
  { key: 'cleanlinessReady', label: 'النظافة والتجهيز', hint: 'الصالة والبار ومنطقة الشيشة جاهزة.' },
  { key: 'previousShiftIssuesReviewed', label: 'مراجعة مشاكل الوردية السابقة', hint: 'تم الاطلاع على المشكلات المفتوحة أو الـ carry-over.' },
  { key: 'supervisorApproved', label: 'اعتماد المشرف', hint: 'لا يكتمل الـ checklist بدون الاعتماد.' },
];

function ShiftChecklistEditor({
  title,
  description,
  form,
  onChange,
  onSaveDraft,
  saveBusy,
  allowSaveDraft,
}: {
  title: string;
  description: string;
  form: ShiftChecklistFormState;
  onChange: (next: ShiftChecklistFormState) => void;
  onSaveDraft?: () => void;
  saveBusy?: boolean;
  allowSaveDraft?: boolean;
}) {
  return (
    <div className={[opsInset, 'mt-4 p-3'].join(' ')}>
      <div className="flex items-start justify-between gap-3">
        <div className="text-right">
          <div className="text-sm font-semibold text-[#1e1712]">{title}</div>
          <div className="mt-1 text-xs leading-6 text-[#7d6a59]">{description}</div>
        </div>
        <div className={opsBadge(form.checklist.supervisorApproved ? 'success' : 'warning')}>
          {form.checklist.supervisorApproved ? 'معتمد' : 'بانتظار الاعتماد'}
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {CHECKLIST_TOGGLES.map((item) => {
          const checked = !!form.checklist[item.key];
          return (
            <label key={item.key} className={[opsInset, 'flex cursor-pointer items-start gap-3 p-3'].join(' ')}>
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) =>
                  onChange({
                    ...form,
                    checklist: { ...form.checklist, [item.key]: event.target.checked },
                  })
                }
                className="mt-1 h-4 w-4 rounded border-[#c8b59b]"
              />
              <div className="flex-1 text-right">
                <div className="text-sm font-semibold text-[#1e1712]">{item.label}</div>
                <div className="mt-1 text-[11px] leading-5 text-[#7d6a59]">{item.hint}</div>
              </div>
            </label>
          );
        })}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
        <div>
          <label className="block text-right text-xs font-semibold text-[#7d6a59]">عدّاد النقدية السريع</label>
          <input
            inputMode="decimal"
            className="mt-1 w-full rounded-[18px] border border-[#d7c7b2] bg-[#fffdf9] px-3 py-3 text-right text-sm text-[#1e1712] outline-none"
            value={form.quickCashCount}
            onChange={(event) => onChange({ ...form, quickCashCount: event.target.value })}
            placeholder="مثال: 1200"
          />
        </div>
        <div>
          <label className="block text-right text-xs font-semibold text-[#7d6a59]">اسم/توقيع المشرف</label>
          <input
            className="mt-1 w-full rounded-[18px] border border-[#d7c7b2] bg-[#fffdf9] px-3 py-3 text-right text-sm text-[#1e1712] outline-none"
            value={form.checklist.supervisorSignoffName ?? ''}
            onChange={(event) =>
              onChange({
                ...form,
                checklist: { ...form.checklist, supervisorSignoffName: event.target.value },
              })
            }
            placeholder="اسم المشرف المعتمد"
          />
        </div>
      </div>

      <div className="mt-3">
        <label className="block text-right text-xs font-semibold text-[#7d6a59]">مشاكل الوردية السابقة / نقاط التسليم</label>
        <textarea
          className="mt-1 min-h-20 w-full rounded-[18px] border border-[#d7c7b2] bg-[#fffdf9] p-3 text-right text-[#1e1712] outline-none placeholder:text-[#a08a75]"
          value={form.issuesSummary}
          onChange={(event) => onChange({ ...form, issuesSummary: event.target.value })}
          placeholder="أي مشاكل carry-over أو ملاحظات يلزم تمريرها"
        />
      </div>

      <div className="mt-3">
        <label className="block text-right text-xs font-semibold text-[#7d6a59]">ملاحظات المشرف</label>
        <textarea
          className="mt-1 min-h-24 w-full rounded-[18px] border border-[#d7c7b2] bg-[#fffdf9] p-3 text-right text-[#1e1712] outline-none placeholder:text-[#a08a75]"
          value={form.supervisorNotes}
          onChange={(event) => onChange({ ...form, supervisorNotes: event.target.value })}
          placeholder="تعليمات تشغيلية أو ملاحظات جودة أو مخزن"
        />
      </div>

      {allowSaveDraft && onSaveDraft ? (
        <button type="button" onClick={onSaveDraft} disabled={saveBusy} className={[opsGhostButton, 'mt-3 w-full disabled:opacity-50'].join(' ')}>
          {saveBusy ? '...' : 'حفظ checklist كمسودة'}
        </button>
      ) : null}
    </div>
  );
}

function ShiftChecklistSummaryCard({
  title,
  record,
}: {
  title: string;
  record: ShiftChecklistRecord | null | undefined;
}) {
  if (!record) {
    return (
      <div className={[opsDashed, 'p-3 text-right text-sm text-[#6b5a4c]'].join(' ')}>
        لا يوجد سجل محفوظ لهذا الـ checklist حتى الآن.
      </div>
    );
  }

  const checklist = { ...emptyShiftChecklistFlags(), ...(record.checklist ?? {}) };
  const completedCount = CHECKLIST_TOGGLES.filter((item) => checklist[item.key]).length;

  return (
    <div className={[opsInset, 'p-3'].join(' ')}>
      <div className="flex items-start justify-between gap-3">
        <div className="text-right">
          <div className="text-sm font-semibold text-[#1e1712]">{title}</div>
          <div className="mt-1 text-xs leading-6 text-[#7d6a59]">
            آخر تحديث {formatDateTime(record.updatedAt)} • الحالة {record.status === 'completed' ? 'مكتمل' : 'مسودة'}
          </div>
        </div>
        <div className={opsBadge(record.checklist.supervisorApproved ? 'success' : 'warning')}>
          {completedCount}/{CHECKLIST_TOGGLES.length}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-4">
        {CHECKLIST_TOGGLES.map((item) => (
          <div key={item.key} className={[opsInset, 'p-2 text-right'].join(' ')}>
            <div className="text-[11px] text-[#7d6a59]">{item.label}</div>
            <div className="mt-1 text-sm font-semibold text-[#1e1712]">{checklist[item.key] ? 'نعم' : 'لا'}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 xl:grid-cols-3">
        <div className={[opsInset, 'p-2 text-right'].join(' ')}>
          <div className="text-[11px] text-[#7d6a59]">النقدية السريعة</div>
          <div className="mt-1 text-sm font-semibold text-[#1e1712]">{record.quickCashCount == null ? '—' : `${formatMoney(record.quickCashCount)} ج`}</div>
        </div>
        <div className={[opsInset, 'p-2 text-right'].join(' ')}>
          <div className="text-[11px] text-[#7d6a59]">توقيع المشرف</div>
          <div className="mt-1 text-sm font-semibold text-[#1e1712]">{record.checklist.supervisorSignoffName ?? '—'}</div>
        </div>
        <div className={[opsInset, 'p-2 text-right'].join(' ')}>
          <div className="text-[11px] text-[#7d6a59]">اعتمد في</div>
          <div className="mt-1 text-sm font-semibold text-[#1e1712]">{record.approvedAt ? formatDateTime(record.approvedAt) : '—'}</div>
        </div>
      </div>
      {record.issuesSummary ? (
        <div className={[opsInset, 'mt-3 p-3 text-right text-sm text-[#1e1712]'].join(' ')}>
          <div className="text-xs font-semibold text-[#7d6a59]">مشاكل الوردية السابقة / التسليم</div>
          <div className="mt-1 whitespace-pre-wrap">{record.issuesSummary}</div>
        </div>
      ) : null}
      {record.supervisorNotes ? (
        <div className={[opsInset, 'mt-3 p-3 text-right text-sm text-[#1e1712]'].join(' ')}>
          <div className="text-xs font-semibold text-[#7d6a59]">ملاحظات المشرف</div>
          <div className="mt-1 whitespace-pre-wrap">{record.supervisorNotes}</div>
        </div>
      ) : null}
    </div>
  );
}

function buildAssignmentsFromTemplate(template: ShiftAssignmentTemplate | null | undefined, actors: AssignableActorRow[]) {
  const activeActorKeys = new Set(
    actors
      .filter((item) => item.isActive && (item.employmentStatus ?? 'active') === 'active')
      .map((item) => `${item.actorType}:${item.id}`),
  );

  const nextAssignments: Record<string, ShiftRole | ''> = {};
  for (const assignment of template?.assignments ?? []) {
    const actorKey = `${assignment.actorType}:${assignment.userId}`;
    if (!activeActorKeys.has(actorKey)) continue;
    nextAssignments[assignment.userId] = assignment.role as ShiftRole;
  }

  return nextAssignments;
}

export default function ShiftPage() {
  const { can, effectiveRole } = useAuthz();
  const { enqueueMutation, isOnline, lastSyncAt } = useOpsPwa();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [actors, setActors] = useState<AssignableActorRow[]>([]);
  const [shift, setShift] = useState<ShiftRow | null>(null);
  const [history, setHistory] = useState<ShiftHistoryRow[]>([]);
  const [operatingSettings, setOperatingSettings] = useState<OperatingSettings | null>(null);
  const [templates, setTemplates] = useState<ShiftAssignmentTemplate[]>([]);
  const [businessDayStartTime, setBusinessDayStartTime] = useState('00:00');
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [templateBusy, setTemplateBusy] = useState(false);
  const [assignments, setAssignments] = useState<Record<string, ShiftRole | ''>>({});
  const [currentAssignments, setCurrentAssignments] = useState<AssignmentRow[]>([]);
  const [kind, setKind] = useState<ShiftKind>('morning');
  const [openNotes, setOpenNotes] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [snapshotBusyFor, setSnapshotBusyFor] = useState<string | null>(null);
  const [selectedSnapshot, setSelectedSnapshot] = useState<RawShiftSnapshot | null>(null);
  const [checklists, setChecklists] = useState<ShiftChecklistRecord[]>([]);
  const [openingChecklist, setOpeningChecklist, openingChecklistDraft] = usePersistentDraft<ShiftChecklistFormState>(SHIFT_DRAFT_KEYS.openingChecklist, createChecklistFormState);
  const [closingChecklist, setClosingChecklist, closingChecklistDraft] = usePersistentDraft<ShiftChecklistFormState>(SHIFT_DRAFT_KEYS.closingChecklist, createChecklistFormState);
  const [checklistBusyStage, setChecklistBusyStage] = useState<ChecklistStage | null>(null);
  const lastQueueSyncAtRef = useRef<number | null>(null);

  const activeAssignableActors = useMemo(
    () => actors.filter((item) => item.isActive && (item.employmentStatus ?? 'active') === 'active'),
    [actors],
  );

  const selectedSupervisorId = useMemo(
    () => Object.entries(assignments).find(([, role]) => role === 'supervisor')?.[0] ?? '',
    [assignments],
  );

  const templateByKind = useMemo(() => new Map(templates.map((item) => [item.kind, item] as const)), [templates]);
  const selectedTemplateKind = shift?.kind ?? kind;
  const selectedTemplate = useMemo(() => templateByKind.get(selectedTemplateKind) ?? null, [selectedTemplateKind, templateByKind]);
  const snapshotView = useMemo(() => normalizeSnapshot(selectedSnapshot), [selectedSnapshot]);
  const openingChecklistRecord = useMemo(() => findChecklistByStage(checklists, 'opening'), [checklists]);
  const closingChecklistRecord = useMemo(() => findChecklistByStage(checklists, 'closing'), [checklists]);

  const canViewShift = can.viewShift;
  const canManageShift = can.owner;

  const load = useCallback(async () => {
    setMessage(null);

    const requests: Array<Promise<Response>> = [fetch('/api/owner/operating-settings', { cache: 'no-store' })];

    if (canManageShift) {
      requests.push(fetch('/api/owner/shift/assignable-actors', { cache: 'no-store' }));
      requests.push(fetch('/api/owner/shift/templates', { cache: 'no-store' }));
    }

    requests.push(fetch('/api/owner/shift/state', { cache: 'no-store' }));
    requests.push(fetch('/api/owner/shift/history', { cache: 'no-store' }));

    const responses = await Promise.all(requests);
    const payloads = await Promise.all(responses.map((response) => response.json().catch(() => null)));

    let index = 0;
    const settingsJson = payloads[index++];
    const actorsJson = canManageShift ? payloads[index++] : null;
    const templatesJson = canManageShift ? payloads[index++] : null;
    const stateJson = payloads[index++];
    const historyJson = payloads[index];

    if (!settingsJson?.ok) {
      setOperatingSettings(null);
      setBusinessDayStartTime('00:00');
      setMessage(extractApiErrorMessage(settingsJson, 'FAILED_TO_LOAD_OPERATING_SETTINGS'));
      return;
    }

    if (canManageShift && !actorsJson?.ok) {
      setActors([]);
      setTemplates([]);
      setMessage(extractApiErrorMessage(actorsJson, 'FAILED_TO_LOAD_SHIFT_ASSIGNABLE_ACTORS'));
      return;
    }

    if (canManageShift && !templatesJson?.ok) {
      setTemplates([]);
      setMessage(extractApiErrorMessage(templatesJson, 'FAILED_TO_LOAD_SHIFT_TEMPLATES'));
      return;
    }

    if (!stateJson?.ok) {
      setShift(null);
      setCurrentAssignments([]);
      setMessage(extractApiErrorMessage(stateJson, 'FAILED_TO_LOAD_SHIFT'));
      return;
    }

    const nextOperatingSettings = (settingsJson.settings as OperatingSettings | null) ?? null;
    setOperatingSettings(nextOperatingSettings);
    setBusinessDayStartTime(nextOperatingSettings?.businessDayStartTime ?? '00:00');
    setActors(canManageShift && Array.isArray(actorsJson?.actors) ? (actorsJson.actors as AssignableActorRow[]) : []);
    setTemplates(canManageShift && Array.isArray(templatesJson?.templates) ? (templatesJson.templates as ShiftAssignmentTemplate[]) : []);
    const nextChecklists = Array.isArray(stateJson?.checklists) ? (stateJson.checklists as ShiftChecklistRecord[]) : [];
    setShift((stateJson.shift as ShiftRow | null) ?? null);
    setCurrentAssignments(Array.isArray(stateJson?.assignments) ? (stateJson.assignments as AssignmentRow[]) : []);
    setChecklists(nextChecklists);
    const nextOpeningChecklist = findChecklistByStage(nextChecklists, 'opening');
    const nextClosingChecklist = findChecklistByStage(nextChecklists, 'closing');
    setOpeningChecklist((current) => nextOpeningChecklist ? mapChecklistToFormState(nextOpeningChecklist) : current);
    setClosingChecklist((current) => nextClosingChecklist ? mapChecklistToFormState(nextClosingChecklist) : current);
    setHistory(Array.isArray(historyJson?.shifts) ? (historyJson.shifts as ShiftHistoryRow[]) : []);
    setSelectedSnapshot(null);

    if (stateJson.shift?.kind) {
      setKind(stateJson.shift.kind as ShiftKind);
    }

    const nextAssignments: Record<string, ShiftRole | ''> = {};
    for (const item of (stateJson.assignments as AssignmentRow[] | undefined) ?? []) {
      nextAssignments[item.userId] = item.role;
    }
    setAssignments(nextAssignments);
  }, [canManageShift]);

  useEffect(() => {
    if (!canViewShift) return;
    void load();
  }, [canViewShift, load]);

  useEffect(() => {
    if (!canViewShift || lastSyncAt === null) return;
    if (lastQueueSyncAtRef.current === null) {
      lastQueueSyncAtRef.current = lastSyncAt;
      return;
    }
    if (lastQueueSyncAtRef.current === lastSyncAt) {
      return;
    }
    lastQueueSyncAtRef.current = lastSyncAt;
    void load();
  }, [canViewShift, lastSyncAt, load]);

  useEffect(() => {
    if (!canManageShift || !!shift) return;
    setAssignments(buildAssignmentsFromTemplate(templateByKind.get(kind), activeAssignableActors));
  }, [activeAssignableActors, canManageShift, kind, shift, templateByKind]);

  function setRole(userId: string, role: ShiftRole | '') {
    setAssignments((current) => ({ ...current, [userId]: role }));
  }

  function buildPayloadAssignments() {
    const actorTypeById = new Map(actors.map((item) => [item.id, item.actorType] as const));
    return Object.entries(assignments)
      .filter(([, role]) => !!role)
      .map(([userId, role]) => ({
        userId,
        role: role as ShiftRole,
        actorType: actorTypeById.get(userId) ?? 'staff',
      }));
  }

  function applySavedTemplate(nextKind: ShiftKind) {
    setAssignments(buildAssignmentsFromTemplate(templateByKind.get(nextKind), activeAssignableActors));
  }

  async function saveTemplate(nextKind: ShiftKind) {
    const payloadAssignments = buildPayloadAssignments();
    if (payloadAssignments.length === 0) {
      setMessage('اختر أعضاء الوردية أولًا ثم احفظهم كنمط متكرر.');
      return;
    }

    if (payloadAssignments.filter((item) => item.role === 'supervisor').length !== 1) {
      setMessage('يجب تحديد مشرف واحد فقط قبل حفظ النمط.');
      return;
    }

    setTemplateBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/owner/shift/templates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: nextKind,
          assignments: payloadAssignments,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        setMessage(extractApiErrorMessage(json, 'FAILED_TO_SAVE_SHIFT_TEMPLATE'));
        return;
      }

      const nextTemplate = (json.template as ShiftAssignmentTemplate | null) ?? null;
      setTemplates((current) => {
        const filtered = current.filter((item) => item.kind !== nextKind);
        return nextTemplate ? [...filtered, nextTemplate] : filtered;
      });
      if (!shift && nextKind === kind) {
        applySavedTemplate(nextKind);
      }
      setMessage(typeof json?.message === 'string' ? json.message : 'تم حفظ النمط.');
    } finally {
      setTemplateBusy(false);
    }
  }

  async function deleteTemplate(nextKind: ShiftKind) {
    setTemplateBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/owner/shift/templates', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: nextKind }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        setMessage(extractApiErrorMessage(json, 'FAILED_TO_DELETE_SHIFT_TEMPLATE'));
        return;
      }

      setTemplates((current) => current.filter((item) => item.kind !== nextKind));
      if (!shift && nextKind === kind) {
        setAssignments({});
      }
      setMessage(typeof json?.message === 'string' ? json.message : 'تم حذف النمط.');
    } finally {
      setTemplateBusy(false);
    }
  }

  async function saveOperatingSettings() {
    if (!canManageShift) return;
    setSettingsBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/owner/operating-settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ businessDayStartTime }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        setMessage(extractApiErrorMessage(json, 'FAILED_TO_SAVE_OPERATING_SETTINGS'));
        return;
      }
      const nextSettings = (json.settings as OperatingSettings | null) ?? null;
      setOperatingSettings(nextSettings);
      setBusinessDayStartTime(nextSettings?.businessDayStartTime ?? businessDayStartTime);
      setMessage('تم حفظ بداية اليوم التشغيلي. سيتم استخدام التاريخ الجديد عند فتح الوردية التالية وعرض التقارير.');
    } finally {
      setSettingsBusy(false);
    }
  }

  async function openShift() {
    const payloadAssignments = buildPayloadAssignments();

    if (payloadAssignments.filter((item) => item.role === 'supervisor').length !== 1) {
      setMessage('يجب تحديد مشرف واحد فقط قبل فتح الوردية.');
      return;
    }

    if (!openingChecklist.checklist.supervisorApproved) {
      setMessage('اعتمد Checklist الافتتاح أولًا قبل فتح الوردية.');
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/owner/shift/open', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind,
          notes: openNotes || undefined,
          assignments: payloadAssignments,
          openingChecklist: buildChecklistPayload(openingChecklist, 'completed'),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        setMessage(extractApiErrorMessage(json, 'FAILED_TO_OPEN_SHIFT'));
        return;
      }
      setOpenNotes('');
      openingChecklistDraft.resetDraft();
      await load();
      const warnings = Array.isArray(json?.warnings) ? json.warnings.filter((item: unknown) => typeof item === 'string' && item.trim()) : [];
      if (warnings.length > 0) {
        setMessage(`تم فتح الوردية مع تنبيه: ${warnings.join(' • ')}`);
      } else if (typeof json?.message === 'string' && json.message.trim()) {
        setMessage(json.message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function updateAssignments() {
    if (!shift) return;
    const payloadAssignments = buildPayloadAssignments();
    if (payloadAssignments.filter((item) => item.role === 'supervisor').length !== 1) {
      setMessage('يجب تحديد مشرف واحد فقط داخل الوردية.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/owner/shift/update-assignments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ shiftId: shift.id, assignments: payloadAssignments }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        setMessage(extractApiErrorMessage(json, 'FAILED_TO_UPDATE_SHIFT_ASSIGNMENTS'));
        return;
      }
      await load();
      setMessage('تم تحديث فريق الوردية الحالي.');
    } finally {
      setBusy(false);
    }
  }

  async function saveChecklistDraft(stage: ChecklistStage) {
    if (!shift) return;
    const form = stage === 'opening' ? openingChecklist : closingChecklist;
    const payload = {
      shiftId: shift.id,
      stage,
      payload: buildChecklistPayload(form, 'draft'),
    };
    setChecklistBusyStage(stage);
    setMessage(null);
    try {
      if (!isOnline) {
        await enqueueMutation(buildQueuedMutation({
          url: '/api/owner/shift/checklists',
          method: 'POST',
          body: payload,
          label: `${checklistStageLabel(stage)} محفوظ محليًا حتى عودة الاتصال.`,
          clearDraftKeys: [stage === 'opening' ? SHIFT_DRAFT_KEYS.openingChecklist : SHIFT_DRAFT_KEYS.closingChecklist],
        }));
        setMessage(`${checklistStageLabel(stage)} محفوظ محليًا حتى عودة الاتصال.`);
        return;
      }
      const res = await fetch('/api/owner/shift/checklists', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        setMessage(extractApiErrorMessage(json, 'FAILED_TO_SAVE_SHIFT_CHECKLIST'));
        return;
      }
      const nextChecklist = (json.checklist as ShiftChecklistRecord | null) ?? null;
      if (nextChecklist) {
        setChecklists((current) => [...current.filter((item) => item.stage !== stage), nextChecklist]);
        if (stage === 'opening') {
          setOpeningChecklist(mapChecklistToFormState(nextChecklist));
        } else {
          setClosingChecklist(mapChecklistToFormState(nextChecklist));
        }
      }
      setMessage(`${checklistStageLabel(stage)} تم حفظه كمسودة.`);
    } catch (error) {
      if (isOfflineLikeError(error)) {
        await enqueueMutation(buildQueuedMutation({
          url: '/api/owner/shift/checklists',
          method: 'POST',
          body: payload,
          label: `${checklistStageLabel(stage)} محفوظ محليًا حتى عودة الاتصال.`,
          clearDraftKeys: [stage === 'opening' ? SHIFT_DRAFT_KEYS.openingChecklist : SHIFT_DRAFT_KEYS.closingChecklist],
        }));
        setMessage(`${checklistStageLabel(stage)} محفوظ محليًا حتى عودة الاتصال.`);
        return;
      }
      setMessage(error instanceof Error ? error.message : 'FAILED_TO_SAVE_SHIFT_CHECKLIST');
    } finally {
      setChecklistBusyStage(null);
    }
  }

  async function closeShift() {
    if (!shift) return;
    if (!closingChecklist.checklist.supervisorApproved) {
      setMessage('اعتمد Checklist الإغلاق أولًا قبل تقفيل الوردية.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await apiPost<{ ok: true; warnings?: string[] }>(
        '/api/owner/shift/close',
        { shiftId: shift.id, notes: closeNotes || undefined, closingChecklist: buildChecklistPayload(closingChecklist, 'completed') },
        { idempotency: { scope: 'owner.shift.close' } },
      );
      setCloseNotes('');
      closingChecklistDraft.resetDraft();
      await load();
      await loadSnapshot(shift.id);
      const warnings = Array.isArray(response?.warnings) ? response.warnings.filter((item) => typeof item === 'string' && item.trim()) : [];
      if (warnings.length > 0) {
        setMessage(`تم تقفيل الوردية مع تنبيه: ${warnings.join(' • ')}`);
      }
    } catch (error) {
      setMessage(error instanceof Error && error.message ? error.message : 'FAILED_TO_CLOSE_SHIFT');
    } finally {
      setBusy(false);
    }
  }

  async function loadSnapshot(shiftId: string) {
    setSnapshotBusyFor(shiftId);
    setMessage(null);
    try {
      const res = await fetch('/api/owner/shift/close-snapshot', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ shiftId }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        setMessage(extractApiErrorMessage(json, 'FAILED_TO_LOAD_SHIFT_SNAPSHOT'));
        return;
      }
      setSelectedSnapshot((json.snapshot as RawShiftSnapshot) ?? null);
    } finally {
      setSnapshotBusyFor(null);
    }
  }

  if (!canViewShift) {
    return <AccessDenied title="الوردية" message="هذه الصفحة متاحة للمالك ومشرف التشغيل فقط." />;
  }

  return (
    <MobileShell title="الوردية" backHref={can.owner ? '/owner' : '/dashboard'} desktopMode={can.owner ? 'admin' : 'wide'}>
      {message ? (
        <div className="mb-3 rounded-[22px] border border-[#e6c7c2] bg-[#fff7f5] p-3 text-right text-sm text-[#9a3e35]">
          {message}
        </div>
      ) : null}

      {!canManageShift && (effectiveRole === 'supervisor' || effectiveRole === 'american_waiter') ? (
        <div className="mb-3 rounded-[22px] border border-[#d6dee5] bg-[#f4f7f9] p-3 text-right text-sm text-[#3c617c]">
          يمكنك متابعة حالة الوردية الحالية والسناب شوت فقط، بينما الفتح والتقفيل وتوزيع الأدوار متاحة لصلاحيات الإدارة فقط.
        </div>
      ) : null}

      <section className={[opsSurface, 'mb-3 p-3'].join(' ')}>
        <div className="flex items-start justify-between gap-3">
          <div className="text-right">
            <div className="text-sm font-semibold text-[#1e1712]">حالة الوردية</div>
            <div className="mt-1 text-xs leading-6 text-[#7d6a59]">
              {!shift
                ? 'ابدأ من هنا: اختر نوع الوردية، حدّد مشرف التشغيل وبقية الفريق، ثم افتح الوردية.'
                : canManageShift
                  ? 'راجع التعيينات الحالية ثم نفّذ تقفيل الوردية بعد إنهاء الجلسات والحسابات.'
                  : 'هذه الصفحة للمتابعة فقط بالنسبة لك الآن. راقب حالة الوردية الحالية والسناب شوت، ولأي تعديل ارجع إلى المالك.'}
            </div>
          </div>
          <div className={opsBadge(shift ? 'success' : 'accent')}>{shift ? 'وردية قائمة' : 'جاهز للفتح'}</div>
        </div>
      </section>

      <section className={[opsSurface, 'mb-3 p-4'].join(' ')}>
        <div className="flex items-start justify-between gap-3">
          <div className="text-right">
            <div className="text-sm font-semibold text-[#1e1712]">اليوم التشغيلي</div>
            <div className="mt-1 text-xs leading-6 text-[#7d6a59]">
              تاريخ التشغيل الحالي: <b>{operatingSettings?.currentBusinessDate ?? '--'}</b>
            </div>
            <div className="mt-1 text-xs leading-6 text-[#7d6a59]">
              بداية اليوم: <b>{operatingSettings?.businessDayStartTime ?? '--'}</b> • {operatingSettings?.operationalWindowLabel ?? '---'}
            </div>
          </div>
          <div className={opsBadge('info')}>مرجع التقارير</div>
        </div>

        {canManageShift ? (
          <div className={[opsInset, 'mt-4 p-3'].join(' ')}>
            <div className="text-right text-sm font-semibold text-[#1e1712]">بداية اليوم التشغيلي</div>
            <div className="mt-1 text-right text-xs leading-6 text-[#7d6a59]">
              هذه الساعة تحدد تاريخ الوردية والتقارير. مثال: إذا كانت البداية 07:00 فالفترة من 07:00 حتى 06:59 في اليوم التالي تُحسب كيوم تشغيل واحد.
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                disabled={settingsBusy}
                onClick={saveOperatingSettings}
                className={[opsAccentButton, 'shrink-0'].join(' ')}
              >
                {settingsBusy ? '...' : 'حفظ'}
              </button>
              <input
                type="time"
                step={60}
                className="w-full rounded-[18px] border border-[#d7c7b2] bg-[#fffdf9] px-3 py-3 text-right text-sm text-[#1e1712] outline-none"
                value={businessDayStartTime}
                onChange={(event) => setBusinessDayStartTime(event.target.value)}
              />
            </div>
          </div>
        ) : null}
      </section>

      {shift ? (
        <>
          <section className={[opsSurface, 'p-4'].join(' ')}>
            <div className="flex items-center justify-between gap-3">
              <div className="text-right">
                <div className="text-sm font-bold text-[#1e1712]">وردية مفتوحة</div>
                <div className="mt-1 text-xs text-[#7d6a59]">
                  {kindLabel(shift.kind)} • {shift.businessDate ?? '-'}
                </div>
                <div className="mt-1 text-xs text-[#7d6a59]">بدأت: {formatDateTime(shift.startedAt)}</div>
              </div>
              <div className={opsBadge(shift.status === 'closing' ? 'warning' : 'success')}>
                {shift.status === 'closing' ? 'قيد الإغلاق' : 'مفتوحة'}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className={opsMetricCard('info')}>
                <div className="text-[11px] font-semibold opacity-70">التعيينات النشطة</div>
                <div className="mt-1 text-xl font-black leading-none">{currentAssignments.length}</div>
              </div>
              <div className={opsMetricCard('accent')}>
                <div className="text-[11px] font-semibold opacity-70">نوع الوردية</div>
                <div className="mt-1 text-xl font-black leading-none">{kindLabel(shift.kind)}</div>
              </div>
            </div>

            <div className={[opsInset, 'mt-4 p-3'].join(' ')}>
              <div className="text-right text-sm font-semibold text-[#1e1712]">تعيينات الوردية الحالية</div>
              <div className="mt-3 space-y-2">
                {currentAssignments.length > 0 ? currentAssignments.map((item) => (
                  <div key={item.id} className={[opsInset, 'flex items-center justify-between gap-2 p-2'].join(' ')}>
                    <div className={opsBadge('accent')}>{roleLabel(item.role)}</div>
                    <div className="text-right text-sm font-semibold text-[#1e1712]">
                      {item.fullName ?? item.id}
                      {item.actorType === 'owner' ? ' • المالك' : ''}
                    </div>
                  </div>
                )) : (
                  <div className={[opsDashed, 'p-3 text-right text-sm text-[#6b5a4c]'].join(' ')}>
                    لا توجد تعيينات نشطة داخل هذه الوردية.
                  </div>
                )}
              </div>
            </div>

            {canManageShift ? (
              <>
                <div className={[opsInset, 'mt-4 p-3'].join(' ')}>
                  <div className="mb-2 text-right text-sm font-semibold text-[#1e1712]">النمط المحفوظ لـ {kindLabel(shift.kind)}</div>
                  {selectedTemplate ? (
                    <>
                      <div className="text-right text-xs leading-6 text-[#7d6a59]">
                        آخر تحديث: <b>{formatDateTime(selectedTemplate.updatedAt)}</b> • الأسماء الجاهزة الآن: <b>{selectedTemplate.availableAssignmentsCount}</b>
                        {selectedTemplate.inactiveAssignmentsCount > 0 ? (
                          <>
                            {' '}• خارج الخدمة أو غير نشط: <b>{selectedTemplate.inactiveAssignmentsCount}</b>
                          </>
                        ) : null}
                      </div>
                      <div className="mt-3 space-y-2">
                        {selectedTemplate.assignments.map((item) => (
                          <div key={`${item.actorType}-${item.userId}-${item.role}`} className={[opsInset, 'flex items-center justify-between gap-2 p-2'].join(' ')}>
                            <div className={opsBadge(item.isActive ? 'accent' : 'warning')}>{roleLabel(item.role as ShiftRole)}</div>
                            <div className="flex-1 text-right text-sm text-[#1e1712]">
                              {item.fullName ?? item.userId}
                              {!item.isActive ? ' • يحتاج مراجعة' : ''}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className={[opsDashed, 'p-3 text-right text-sm text-[#6b5a4c]'].join(' ')}>
                      لا يوجد نمط محفوظ لهذه الوردية بعد.
                    </div>
                  )}
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      disabled={!selectedTemplate || templateBusy}
                      onClick={() => applySavedTemplate(shift.kind)}
                      className={[opsGhostButton, 'w-full disabled:opacity-50'].join(' ')}
                    >
                      تحميل النمط
                    </button>
                    <button
                      type="button"
                      disabled={templateBusy}
                      onClick={() => void saveTemplate(shift.kind)}
                      className={[opsAccentButton, 'w-full disabled:opacity-50'].join(' ')}
                    >
                      {templateBusy ? '...' : 'حفظ الحالي'}
                    </button>
                    <button
                      type="button"
                      disabled={!selectedTemplate || templateBusy}
                      onClick={() => void deleteTemplate(shift.kind)}
                      className={[opsGhostButton, 'w-full text-[#9a3e35] disabled:opacity-50'].join(' ')}
                    >
                      حذف النمط
                    </button>
                  </div>
                </div>

                <div className={[opsInset, 'mt-4 p-3'].join(' ')}>
                  <div className="mb-2 text-right text-sm font-semibold text-[#1e1712]">تعديل فريق الوردية المفتوحة</div>
                  <div className="mb-2 text-right text-xs leading-6 text-[#7d6a59]">يمكنك إضافة عضو أو إخراجه أو تغيير دوره أثناء الوردية دون تعطيل التشغيل، مع بقاء مشرف واحد فقط.</div>
                  <div className="space-y-2">
                    {activeAssignableActors.map((item) => {
                      const currentRole = assignments[item.id] ?? '';
                      return (
                        <div key={`open-${item.id}`} className={[opsInset, 'flex items-center gap-2 p-2'].join(' ')}>
                          <select
                            aria-label={item.actorType === 'owner' ? 'اختر دور الحساب الإداري في الوردية' : 'اختر دور عضو الفريق في الوردية'}
                            className={[opsSelect, 'w-1/2'].join(' ')}
                            value={currentRole}
                            onChange={(event) => setRole(item.id, event.target.value as ShiftRole | '')}
                          >
                            <option value="">خارج الوردية</option>
                            <option value="supervisor">مشرف التشغيل</option>
                            <option value="waiter">مضيف الصالة</option>
                            <option value="barista">الباريستا</option>
                            <option value="shisha">مختص الشيشة</option>
                            <option value="american_waiter">أميركان كابتن</option>
                          </select>
                          <div className="flex-1 text-right">
                            <div className="text-sm font-semibold text-[#1e1712]">
                              {item.fullName ?? item.id}
                              {item.actorType === 'owner' ? ' • إدارة' : ''}
                            </div>
                            <div className="text-[11px] text-[#8b7866]">
                              {currentRole ? `الدور الحالي: ${roleLabel(currentRole as ShiftRole)}` : 'خارج الوردية'}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <button disabled={busy || activeAssignableActors.length === 0} onClick={updateAssignments} className={[opsAccentButton, 'mt-4 w-full'].join(' ')}>
                    {busy ? '...' : 'حفظ تعديل الوردية'}
                  </button>
                </div>

                <div className="mt-4 space-y-3">
                  <ShiftChecklistSummaryCard title="سجل Checklist الافتتاح" record={openingChecklistRecord} />
                  <ShiftChecklistEditor
                    title="Checklist الإغلاق"
                    description="يُستخدم قبل تقفيل الوردية مباشرة، مع إمكانية حفظه كمسودة أثناء التشغيل."
                    form={closingChecklist}
                    onChange={setClosingChecklist}
                    onSaveDraft={() => void saveChecklistDraft('closing')}
                    saveBusy={checklistBusyStage === 'closing'}
                    allowSaveDraft
                  />
                  {closingChecklistRecord ? <ShiftChecklistSummaryCard title="آخر سجل محفوظ للإغلاق" record={closingChecklistRecord} /> : null}
                </div>

                <div className="mt-4">
                  <label className="block text-right text-xs font-semibold text-[#7d6a59]">ملاحظات الإغلاق</label>
                  <textarea
                    className="mt-1 min-h-24 w-full rounded-[18px] border border-[#d7c7b2] bg-[#fffdf9] p-3 text-right text-[#1e1712] outline-none placeholder:text-[#a08a75]"
                    value={closeNotes}
                    onChange={(event) => setCloseNotes(event.target.value)}
                    placeholder="ملاحظات اختيارية تحفظ مع سناب شوت الإغلاق"
                    enterKeyHint="done"
                    onKeyDown={(event) => submitOnEnter(event, closeShift)}
                  />
                </div>

                <button disabled={busy} onClick={closeShift} className={[opsPrimaryButton, 'mt-4 w-full bg-[#9a3e35]'].join(' ')}>
                  {busy ? '...' : 'تقفيل الوردية'}
                </button>
              </>
            ) : null}

            <div className="mt-3 text-right text-xs leading-6 text-[#7d6a59]">
              الإغلاق يرفض وجود جلسات أو حسابات غير محسومة، ثم يأخذ سناب شوت للتقارير قبل قفل الوردية.
            </div>
          </section>

          {canManageShift ? <RecoveryPanel onResync={load} /> : null}
        </>
      ) : canManageShift ? (
        <section className={[opsSurface, 'p-4'].join(' ')}>
          <div className="text-right font-bold text-[#1e1712]">فتح وردية جديدة</div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setKind('morning')}
              className={[
                'rounded-[18px] border px-3 py-3 text-sm font-semibold',
                kind === 'morning' ? 'border-[#1e1712] bg-[#1e1712] text-white' : 'border-[#dac9b6] bg-[#fffaf3] text-[#5e4d3f]',
              ].join(' ')}
            >
              صباحية
            </button>
            <button
              type="button"
              onClick={() => setKind('evening')}
              className={[
                'rounded-[18px] border px-3 py-3 text-sm font-semibold',
                kind === 'evening' ? 'border-[#1e1712] bg-[#1e1712] text-white' : 'border-[#dac9b6] bg-[#fffaf3] text-[#5e4d3f]',
              ].join(' ')}
            >
              مسائية
            </button>
          </div>

          <div className={[opsInset, 'mt-4 p-3'].join(' ')}>
            <div className="mb-2 text-right text-sm font-semibold text-[#1e1712]">النمط المحفوظ لـ {kindLabel(kind)}</div>
            {selectedTemplate ? (
              <>
                <div className="text-right text-xs leading-6 text-[#7d6a59]">
                  آخر تحديث: <b>{formatDateTime(selectedTemplate.updatedAt)}</b> • الأسماء الجاهزة الآن: <b>{selectedTemplate.availableAssignmentsCount}</b>
                  {selectedTemplate.inactiveAssignmentsCount > 0 ? (
                    <>
                      {' '}• خارج الخدمة أو غير نشط: <b>{selectedTemplate.inactiveAssignmentsCount}</b>
                    </>
                  ) : null}
                </div>
                <div className="mt-3 space-y-2">
                  {selectedTemplate.assignments.map((item) => (
                    <div key={`${item.actorType}-${item.userId}-${item.role}`} className={[opsInset, 'flex items-center justify-between gap-2 p-2'].join(' ')}>
                      <div className={opsBadge(item.isActive ? 'accent' : 'warning')}>{roleLabel(item.role as ShiftRole)}</div>
                      <div className="flex-1 text-right text-sm text-[#1e1712]">
                        {item.fullName ?? item.userId}
                        {!item.isActive ? ' • يحتاج مراجعة' : ''}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className={[opsDashed, 'p-3 text-right text-sm text-[#6b5a4c]'].join(' ')}>
                لا يوجد نمط محفوظ لهذه الوردية بعد. اختر الأسماء مرة واحدة ثم احفظها لتظهر تلقائيًا بعد ذلك.
              </div>
            )}
            <div className="mt-3 grid grid-cols-4 gap-2">
              <button
                type="button"
                disabled={!selectedTemplate || templateBusy}
                onClick={() => applySavedTemplate(kind)}
                className={[opsGhostButton, 'w-full disabled:opacity-50'].join(' ')}
              >
                تحميل
              </button>
              <button
                type="button"
                disabled={templateBusy}
                onClick={() => void saveTemplate(kind)}
                className={[opsAccentButton, 'w-full disabled:opacity-50'].join(' ')}
              >
                {templateBusy ? '...' : 'حفظ'}
              </button>
              <button
                type="button"
                disabled={!selectedTemplate || templateBusy}
                onClick={() => void deleteTemplate(kind)}
                className={[opsGhostButton, 'w-full text-[#9a3e35] disabled:opacity-50'].join(' ')}
              >
                حذف
              </button>
              <button
                type="button"
                disabled={templateBusy}
                onClick={() => setAssignments({})}
                className={[opsGhostButton, 'w-full disabled:opacity-50'].join(' ')}
              >
                مسح
              </button>
            </div>
          </div>

          <ShiftChecklistEditor
            title="Checklist الافتتاح"
            description="يرتبط بفتح الوردية ويُحفظ كسجل تشغيلي مع الاعتماد."
            form={openingChecklist}
            onChange={setOpeningChecklist}
          />

          <div className="mt-4">
            <label className="block text-right text-xs font-semibold text-[#7d6a59]">ملاحظات الافتتاح</label>
            <textarea
              className="mt-1 min-h-24 w-full rounded-[18px] border border-[#d7c7b2] bg-[#fffdf9] p-3 text-right text-[#1e1712] outline-none placeholder:text-[#a08a75]"
              value={openNotes}
              onChange={(event) => setOpenNotes(event.target.value)}
              placeholder="ملاحظات اختيارية مع بداية الوردية"
              enterKeyHint="done"
              onKeyDown={(event) => submitOnEnter(event, openShift)}
            />
          </div>

          <div className="mt-3 rounded-[20px] border border-[#ead7bc] bg-[#f8ecdb] p-3 text-right text-xs leading-6 text-[#7c5222]">
            يمكنك تعيين نفسك داخل الوردية كمالك من نفس الشاشة. هذا التعيين يدخل في التقارير وسجل الوردية مثل باقي الأدوار.
          </div>

          <div className={[opsInset, 'mt-4 p-3'].join(' ')}>
            <div className="mb-2 text-right text-sm font-semibold text-[#1e1712]">تعيين الأدوار</div>
            <div className="space-y-2">
              {activeAssignableActors.map((item) => {
                const currentRole = assignments[item.id] ?? '';
                return (
                  <div key={item.id} className={[opsInset, 'flex items-center gap-2 p-2'].join(' ')}>
                    <select
                      aria-label={item.actorType === 'owner' ? 'اختر دورك أنت كمالك في الوردية' : 'اختر دور عضو الفريق في الوردية'}
                      className={[opsSelect, 'w-1/2'].join(' ')}
                      value={currentRole}
                      onChange={(event) => setRole(item.id, event.target.value as ShiftRole | '')}
                    >
                      <option value="">بدون دور</option>
                      <option value="supervisor">مشرف التشغيل</option>
                      <option value="waiter">مضيف الصالة</option>
                      <option value="barista">الباريستا</option>
                      <option value="shisha">مختص الشيشة</option>
                      <option value="american_waiter">أميركان كابتن</option>
                    </select>
                    <div className="flex-1 text-right">
                      <div className="text-sm font-semibold text-[#1e1712]">
                        {item.fullName ?? item.id}
                        {item.actorType === 'owner' ? ' • المالك' : ''}
                      </div>
                      <div className="text-[11px] text-[#8b7866]">
                        {currentRole ? `الدور الحالي: ${roleLabel(currentRole as ShiftRole)}` : 'بدون دور'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-3 rounded-[20px] border border-[#e5d7c7] bg-[#f8f1e7] p-3 text-right text-xs leading-6 text-[#6b5a4c]">
            الوردية الجديدة ستُفتح على تاريخ التشغيل <b>{operatingSettings?.currentBusinessDate ?? '--'}</b> حسب بداية اليوم <b>{operatingSettings?.businessDayStartTime ?? '--'}</b>.
          </div>

          <div className="mt-3 rounded-[20px] border border-[#e5d7c7] bg-[#f8f1e7] p-3 text-right text-xs leading-6 text-[#6b5a4c]">
            المشرف المختار:{' '}
            <b>
              {selectedSupervisorId
                ? activeAssignableActors.find((item) => item.id === selectedSupervisorId)?.fullName ?? selectedSupervisorId
                : 'غير محدد'}
            </b>
          </div>

          <button disabled={busy || activeAssignableActors.length === 0} onClick={openShift} className={[opsAccentButton, 'mt-4 w-full'].join(' ')}>
            {busy ? '...' : 'فتح الوردية'}
          </button>
        </section>
      ) : (
        <section className={[opsSurface, 'p-4'].join(' ')}>
          <div className="text-right text-sm text-[#6b5a4c]">لا توجد وردية مفتوحة حاليًا.</div>
        </section>
      )}

      {snapshotView ? (
        <section className={[opsSurface, 'mt-4 p-4'].join(' ')}>
          <div className="flex items-center justify-between gap-3">
            <div className="text-right">
              <div className="text-sm font-bold text-[#1e1712]">سناب شوت الإغلاق</div>
              <div className="mt-1 text-xs text-[#7d6a59]">
                {snapshotView.shift.businessDate} • أُخذت اللقطة {formatDateTime(snapshotView.shift.snapshotTakenAt)}
              </div>
            </div>
            <div className={opsBadge('info')}>{snapshotView.shift.snapshotPhase ?? 'ops'}</div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className={opsMetricCard('accent')}>
              <div className="text-xs opacity-70">صافي المبيعات</div>
              <div className="mt-1 text-base font-bold">{formatMoney(snapshotView.summary.netSales)} ج</div>
            </div>
            <div className={opsMetricCard('success')}>
              <div className="text-xs opacity-70">نقدي</div>
              <div className="mt-1 text-base font-bold">{formatMoney(snapshotView.summary.cashSales)} ج</div>
            </div>
            <div className={opsMetricCard('info')}>
              <div className="text-xs opacity-70">آجل</div>
              <div className="mt-1 text-base font-bold">{formatMoney(snapshotView.summary.deferredSales)} ج</div>
            </div>
            <div className={opsMetricCard('warning')}>
              <div className="text-xs opacity-70">المسلّم / المرتجع</div>
              <div className="mt-1 text-base font-bold">
                {snapshotView.summary.deliveredItemCount} / {snapshotView.summary.remadeItemCount}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <div className={opsMetricCard(snapshotView.summary.qualityOpenCount > 0 ? 'warning' : 'neutral')}>
              <div className="text-xs text-[#8a7763]">ملاحظات عامة مفتوحة</div>
              <div className="mt-1 text-base font-bold">{formatQty(snapshotView.summary.qualityOpenCount)}</div>
            </div>
            <div className={opsMetricCard(snapshotView.summary.qualityNoteCount > 0 ? 'accent' : 'neutral')}>
              <div className="text-xs text-[#8a7763]">إجمالي الملاحظات العامة</div>
              <div className="mt-1 text-base font-bold">{formatQty(snapshotView.summary.qualityNoteCount)}</div>
            </div>
            <div className={opsMetricCard(snapshotView.summary.itemIssueCount > 0 ? 'warning' : 'neutral')}>
              <div className="text-xs text-[#8a7763]">إجراءات وملاحظات الأصناف</div>
              <div className="mt-1 text-base font-bold">{formatQty(snapshotView.summary.itemIssueCount)}</div>
            </div>
            <div className={opsMetricCard((snapshotView.summary.remakeIssueCount + snapshotView.summary.cancelIssueCount + snapshotView.summary.waiveIssueCount) > 0 ? 'warning' : 'neutral')}>
              <div className="text-xs text-[#8a7763]">إجراءات تنفيذية</div>
              <div className="mt-1 text-base font-bold">{formatQty(snapshotView.summary.remakeIssueCount + snapshotView.summary.cancelIssueCount + snapshotView.summary.waiveIssueCount)}</div>
            </div>
          </div>

          <div className="mt-3 grid gap-3 xl:grid-cols-2">
            <ShiftChecklistSummaryCard
              title="Checklist الافتتاح داخل السناب شوت"
              record={findChecklistByStage(snapshotView.checklists, 'opening')}
            />
            <ShiftChecklistSummaryCard
              title="Checklist الإغلاق داخل السناب شوت"
              record={findChecklistByStage(snapshotView.checklists, 'closing')}
            />
          </div>

          {snapshotView.inventory ? (
            <div className={[opsInset, 'mt-3 p-3'].join(' ')}>
              <div className="flex items-start justify-between gap-3">
                <div className="text-right">
                  <div className="text-sm font-semibold text-[#1e1712]">سناب شوت المخزن</div>
                  <div className="mt-1 text-xs text-[#7d6a59]">الملخص محسوب من الوردية فقط. عند تقفيل الوردية يتم ترحيله للمخزن مرة واحدة إذا كانت الوصفات جاهزة.</div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className={opsBadge(snapshotView.inventory.snapshotPhase === 'closed' ? 'success' : 'warning')}>
                    {snapshotView.inventory.snapshotPhase === 'closed' ? 'مقفلة' : 'معاينة'}
                  </div>
                  <div className={opsBadge(snapshotView.inventory.posting.isPosted ? 'accent' : 'info')}>
                    {snapshotView.inventory.posting.isPosted ? 'مرحل للمخزن' : 'غير مرحل'}
                  </div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-6">
                <div className={opsMetricCard('accent')}>
                  <div className="text-xs opacity-70">إجمالي الاستهلاك</div>
                  <div className="mt-1 text-base font-bold">{formatQty(snapshotView.inventory.summary.totalConsumptionQty)}</div>
                </div>
                <div className={opsMetricCard('info')}>
                  <div className="text-xs opacity-70">من المنتجات</div>
                  <div className="mt-1 text-base font-bold">{formatQty(snapshotView.inventory.summary.productConsumptionQty)}</div>
                </div>
                <div className={opsMetricCard('success')}>
                  <div className="text-xs opacity-70">من الإضافات</div>
                  <div className="mt-1 text-base font-bold">{formatQty(snapshotView.inventory.summary.addonConsumptionQty)}</div>
                </div>
                <div className={opsMetricCard(snapshotView.inventory.summary.remakeWasteQty > 0 ? 'warning' : 'accent')}>
                  <div className="text-xs opacity-70">Remake هالك / جديد</div>
                  <div className="mt-1 text-base font-bold">{formatQty(snapshotView.inventory.summary.remakeWasteQty)} / {formatQty(snapshotView.inventory.summary.remakeReplacementQty)}</div>
                </div>
                <div className={opsMetricCard(snapshotView.inventory.posting.isPosted ? 'success' : 'info')}>
                  <div className="text-xs opacity-70">ترحيل المخزن</div>
                  <div className="mt-1 text-base font-bold">{snapshotView.inventory.posting.isPosted ? formatQty(snapshotView.inventory.posting.totalConsumptionQty) : '—'}</div>
                </div>
                <div className={opsMetricCard(snapshotView.inventory.posting.isPosted ? 'accent' : 'neutral')}>
                  <div className="text-xs opacity-70">وقت الترحيل</div>
                  <div className="mt-1 text-[11px] font-bold">{snapshotView.inventory.posting.postedAt ? formatDateTime(snapshotView.inventory.posting.postedAt) : 'غير مرحل'}</div>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {snapshotView.inventory.lines.slice(0, 6).map((line) => (
                  <div key={line.inventoryItemId} className={[opsInset, 'flex items-center justify-between gap-2 p-2'].join(' ')}>
                    <div className="flex-1 text-right">
                      <div className="text-sm font-semibold text-[#1e1712]">{line.itemName}</div>
                      <div className="mt-1 text-[11px] text-[#7d6a59]">منتج {formatQty(line.fromProducts)} • إضافات {formatQty(line.fromAddons)}</div>
                    </div>
                    <div className="text-left text-[11px] text-[#7d6a59]">
                      <div className="text-sm font-black text-[#1e1712]">{formatQty(line.totalConsumption)} {line.unitLabel}</div>
                      <div className="mt-1">هالك {formatQty(line.remakeWasteQty)} • جديد {formatQty(line.remakeReplacementQty)}</div>
                    </div>
                  </div>
                ))}
                {snapshotView.inventory.lines.length === 0 ? (
                  <div className={[opsDashed, 'p-3 text-right text-sm text-[#6b5a4c]'].join(' ')}>
                    لا توجد خامات مرتبطة بوصفات في هذه اللقطة.
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className={[opsInset, 'mt-3 p-3'].join(' ')}>
            <div className="text-right text-sm font-semibold text-[#1e1712]">ملخص الفريق</div>
            <div className="mt-2 space-y-2">
              {snapshotView.employees.map((item) => (
                <div key={item.userId} className={[opsInset, 'flex items-center justify-between gap-2 p-2'].join(' ')}>
                  <div className={opsBadge(item.shiftRole ? 'accent' : 'neutral')}>
                    {item.shiftRole ? roleLabel(item.shiftRole) : 'ملخص'}
                  </div>
                  <div className="flex-1 text-right">
                    <div className="text-sm font-semibold text-[#1e1712]">{item.fullName}</div>
                    <div className="mt-1 text-[11px] text-[#7d6a59]">
                      تجهيز {item.preparedItemCount} • تسليم {item.deliveredItemCount} • نقدي {formatMoney(item.cashCollected)} • آجل {formatMoney(item.deferredBooked)}
                    </div>
                  </div>
                </div>
              ))}
              {snapshotView.employees.length === 0 ? (
                <div className={[opsDashed, 'p-3 text-right text-sm text-[#6b5a4c]'].join(' ')}>
                  لا يوجد ملخص فريق في هذه اللقطة.
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      <section className={[opsSurface, 'mt-4 p-4'].join(' ')}>
        <div className="mb-2 text-right text-sm font-semibold text-[#1e1712]">آخر الورديات</div>
        {history.length === 0 ? (
          <div className="text-right text-sm text-[#6b5a4c]">لا توجد ورديات سابقة.</div>
        ) : (
          <div className="space-y-2">
            {history.slice(0, 6).map((item) => (
              <div key={item.id} className={[opsInset, 'p-3 text-right'].join(' ')}>
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => void loadSnapshot(item.id)}
                    disabled={snapshotBusyFor === item.id || !item.endedAt}
                    className={[opsGhostButton, 'disabled:opacity-50'].join(' ')}
                  >
                    {snapshotBusyFor === item.id ? '...' : 'عرض السناب شوت'}
                  </button>
                  <div>
                    <div className="text-sm font-semibold text-[#1e1712]">{kindLabel(item.kind)}</div>
                    <div className="mt-1 text-xs text-[#7d6a59]">بدأت: {formatDateTime(item.startedAt)}</div>
                    <div className="mt-1 text-xs text-[#7d6a59]">انتهت: {formatDateTime(item.endedAt)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </MobileShell>
  );
}
