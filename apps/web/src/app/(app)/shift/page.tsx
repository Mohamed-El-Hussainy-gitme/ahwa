'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import { MobileShell } from "@/ui/MobileShell";
import { useAuthz } from "@/lib/authz";
import { AccessDenied } from "@/ui/AccessState";

type ShiftKind = "morning" | "evening";
type ShiftRole = "supervisor" | "waiter" | "barista" | "shisha";
type ShiftStatus = "open" | "closing" | "closed" | "draft" | "cancelled";

type StaffRow = {
  id: string;
  fullName: string | null;
  employeeCode: string | null;
  accountKind: string;
  isActive: boolean;
};

type AssignmentRow = {
  id: string;
  userId: string;
  role: ShiftRole;
  fullName?: string | null;
  isActive?: boolean;
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
};

type NormalizedSnapshot = {
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
};

function roleLabel(role: ShiftRole) {
  switch (role) {
    case "supervisor":
      return "مشرف";
    case "waiter":
      return "ويتر";
    case "barista":
      return "باريستا";
    case "shisha":
      return "شيشة";
  }
}

function kindLabel(kind: ShiftKind) {
  return kind === "morning" ? "صباحية" : "مسائية";
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ar-EG");
}

function toNumber(value: string | number | null | undefined) {
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatMoney(value: string | number | null | undefined) {
  return toNumber(value).toLocaleString("ar-EG");
}

function normalizeSnapshot(snapshot: RawShiftSnapshot | null): NormalizedSnapshot | null {
  if (!snapshot) return null;

  const cashSales = toNumber(snapshot.summary?.cashSales ?? snapshot.totals?.cash_total);
  const deferredSales = toNumber(snapshot.summary?.deferredSales ?? snapshot.totals?.deferred_total);

  const employees =
    Array.isArray(snapshot.employees) && snapshot.employees.length > 0
      ? snapshot.employees.map((item, index) => ({
          userId: item.userId ?? `employee-${index}`,
          fullName: item.fullName ?? item.userId ?? "غير معروف",
          shiftRole: item.shiftRole,
          deliveredItemCount: toNumber(item.deliveredItemCount),
          preparedItemCount: toNumber(item.preparedItemCount),
          cashCollected: toNumber(item.cashCollected),
          deferredBooked: toNumber(item.deferredBooked),
        }))
      : Array.isArray(snapshot.staff)
        ? snapshot.staff.map((item, index) => ({
            userId: `staff-${index}`,
            fullName: item.actor_label ?? "غير معروف",
            deliveredItemCount: toNumber(item.delivered_qty),
            preparedItemCount: toNumber(item.ready_qty),
            cashCollected: toNumber(item.payment_total),
            deferredBooked: 0,
          }))
        : [];

  return {
    shift: {
      id: snapshot.shift?.shift_id ?? "",
      businessDate: snapshot.shift?.business_date ?? "-",
      status: snapshot.shift?.status ?? "-",
      openedAt: snapshot.shift?.opened_at ?? null,
      closedAt: snapshot.shift?.closed_at ?? null,
      snapshotTakenAt: snapshot.shift?.snapshotTakenAt ?? snapshot.shift?.closed_at ?? null,
      snapshotPhase: snapshot.shift?.snapshotPhase ?? "ops",
    },
    summary: {
      netSales: toNumber(snapshot.summary?.netSales) || cashSales + deferredSales,
      cashSales,
      deferredSales,
      deliveredItemCount: toNumber(
        snapshot.summary?.deliveredItemCount ?? snapshot.totals?.delivered_qty,
      ),
      remadeItemCount: toNumber(
        snapshot.summary?.remadeItemCount ?? snapshot.totals?.remade_qty,
      ),
    },
    employees,
  };
}

export default function ShiftPage() {
  const { can, effectiveRole } = useAuthz();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [shift, setShift] = useState<ShiftRow | null>(null);
  const [history, setHistory] = useState<ShiftHistoryRow[]>([]);
  const [assignments, setAssignments] = useState<Record<string, ShiftRole | "">>({});
  const [kind, setKind] = useState<ShiftKind>("morning");
  const [openNotes, setOpenNotes] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [snapshotBusyFor, setSnapshotBusyFor] = useState<string | null>(null);
  const [selectedSnapshot, setSelectedSnapshot] = useState<RawShiftSnapshot | null>(null);

  const activeStaff = useMemo(() => staff.filter((item) => item.isActive), [staff]);
  const selectedSupervisorId = useMemo(
    () => Object.entries(assignments).find(([, role]) => role === "supervisor")?.[0] ?? "",
    [assignments],
  );

  const snapshotView = useMemo(
    () => normalizeSnapshot(selectedSnapshot),
    [selectedSnapshot],
  );
  const canViewShift = can.viewShift;
  const canManageShift = can.owner;

  const load = useCallback(async () => {
    setMessage(null);
    const [staffRes, stateRes, historyRes] = await Promise.all([
      fetch("/api/owner/staff/list", { cache: "no-store" }),
      fetch("/api/owner/shift/state", { cache: "no-store" }),
      fetch("/api/owner/shift/history", { cache: "no-store" }),
    ]);

    const [staffJson, stateJson, historyJson] = await Promise.all([
      staffRes.json().catch(() => null),
      stateRes.json().catch(() => null),
      historyRes.json().catch(() => null),
    ]);

    if (!staffJson?.ok) {
      setStaff([]);
      setMessage(
        typeof staffJson?.error === "string"
          ? staffJson.error
          : staffJson?.error?.message ?? "FAILED_TO_LOAD_STAFF",
      );
      return;
    }

    if (!stateJson?.ok) {
      setShift(null);
      setMessage(
        typeof stateJson?.error === "string"
          ? stateJson.error
          : stateJson?.error?.message ?? "FAILED_TO_LOAD_SHIFT",
      );
      return;
    }

    setStaff(staffJson.staff as StaffRow[]);
    setShift((stateJson.shift as ShiftRow | null) ?? null);
    setHistory(Array.isArray(historyJson?.shifts) ? (historyJson.shifts as ShiftHistoryRow[]) : []);
    setSelectedSnapshot(null);

    if (stateJson.shift?.kind) {
      setKind(stateJson.shift.kind as ShiftKind);
    }

    const nextAssignments: Record<string, ShiftRole | ""> = {};
    for (const item of (stateJson.assignments as AssignmentRow[] | undefined) ?? []) {
      nextAssignments[item.userId] = item.role;
    }
    setAssignments(nextAssignments);
  }, []);

  useEffect(() => {
    if (!canViewShift) return;
    void load();
  }, [canViewShift, load]);

  function setRole(userId: string, role: ShiftRole | "") {
    setAssignments((current) => ({ ...current, [userId]: role }));
  }

  async function openShift() {
    const payloadAssignments = Object.entries(assignments)
      .filter(([, role]) => !!role)
      .map(([userId, role]) => ({ userId, role: role as ShiftRole }));

    if (payloadAssignments.filter((item) => item.role === "supervisor").length !== 1) {
      setMessage("يجب تحديد مشرف واحد فقط قبل فتح الوردية.");
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/owner/shift/open", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          notes: openNotes || undefined,
          assignments: payloadAssignments,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        setMessage(
          typeof json?.error === "string"
            ? json.error
            : json?.error?.message ?? "FAILED_TO_OPEN_SHIFT",
        );
        return;
      }
      setOpenNotes("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function closeShift() {
    if (!shift) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/owner/shift/close", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ shiftId: shift.id, notes: closeNotes || undefined }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        setMessage(
          typeof json?.error === "string"
            ? json.error
            : json?.error?.message ?? "FAILED_TO_CLOSE_SHIFT",
        );
        return;
      }
      setCloseNotes("");
      await load();
      await loadSnapshot(shift.id);
    } finally {
      setBusy(false);
    }
  }

  async function loadSnapshot(shiftId: string) {
    setSnapshotBusyFor(shiftId);
    setMessage(null);
    try {
      const res = await fetch("/api/owner/shift/close-snapshot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ shiftId }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        setMessage(
          typeof json?.error === "string"
            ? json.error
            : json?.error?.message ?? "FAILED_TO_LOAD_SHIFT_SNAPSHOT",
        );
        return;
      }
      setSelectedSnapshot((json.snapshot as RawShiftSnapshot) ?? null);
    } finally {
      setSnapshotBusyFor(null);
    }
  }

  if (!canViewShift) {
    return <AccessDenied title="الوردية" message="هذه الصفحة متاحة للمعلم والمشرف فقط." />;
  }

  return (
    <MobileShell title="الوردية" backHref={can.owner ? '/owner' : '/dashboard'}>
      {message ? (
        <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-right text-sm text-red-700">
          {message}
        </div>
      ) : null}

      {!canManageShift && effectiveRole === 'supervisor' ? (
        <div className="mb-3 rounded-2xl border border-sky-200 bg-sky-50 p-3 text-right text-sm text-sky-900">
          يمكنك متابعة حالة الوردية الحالية والسناب شوت فقط، بينما الفتح والتقفيل وتوزيع الأدوار للمعلم فقط.
        </div>
      ) : null}

      {shift ? (
        <section className="rounded-3xl border border-emerald-200/70 bg-emerald-50 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="text-right">
              <div className="text-sm font-bold text-emerald-950">وردية مفتوحة</div>
              <div className="mt-1 text-xs text-emerald-900/70">
                {kindLabel(shift.kind)} • {shift.businessDate ?? '-'}
              </div>
              <div className="mt-1 text-xs text-emerald-900/70">
                بدأت: {formatDateTime(shift.startedAt)}
              </div>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-900">
              {shift.status === 'closing' ? 'قيد الإغلاق' : 'مفتوحة'}
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-emerald-200/70 bg-white p-3">
            <div className="text-right text-sm font-semibold text-emerald-950">
              تعيينات الوردية الحالية
            </div>
            <div className="mt-3 space-y-2">
              {activeStaff
                .filter((item) => !!assignments[item.id])
                .map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-2 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-2"
                  >
                    <div className="rounded-xl bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-900">
                      {roleLabel(assignments[item.id] as ShiftRole)}
                    </div>
                    <div className="text-right text-sm font-semibold text-emerald-950">
                      {item.fullName ?? item.employeeCode ?? item.id}
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {canManageShift ? (
            <>
              <div className="mt-4">
                <label className="block text-right text-xs font-semibold text-emerald-900/70">
                  ملاحظات الإغلاق
                </label>
                <textarea
                  className="mt-1 min-h-24 w-full rounded-2xl border border-emerald-200/70 bg-white p-3 text-right"
                  value={closeNotes}
                  onChange={(event) => setCloseNotes(event.target.value)}
                  placeholder="ملاحظات اختيارية تحفظ مع سناب شوت الإغلاق"
                />
              </div>

              <button
                disabled={busy}
                onClick={closeShift}
                className="mt-4 w-full rounded-2xl bg-red-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? '...' : 'تقفيل الوردية'}
              </button>
            </>
          ) : null}

          <div className="mt-3 text-right text-xs text-emerald-900/70">
            الإغلاق يرفض وجود جلسات أو حسابات غير محسومة، ثم يأخذ سناب شوت للتقارير قبل قفل الوردية.
          </div>
        </section>
      ) : canManageShift ? (
        <section className="rounded-3xl border border-amber-200/70 bg-white p-4 shadow-sm">
          <div className="text-right font-bold text-amber-950">فتح وردية جديدة</div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setKind('morning')}
              className={[
                'rounded-2xl border px-3 py-3 text-sm font-semibold',
                kind === 'morning'
                  ? 'border-amber-600 bg-amber-600 text-white'
                  : 'border-amber-200/70 bg-amber-50 text-amber-950',
              ].join(' ')}
            >
              صباحية
            </button>
            <button
              type="button"
              onClick={() => setKind('evening')}
              className={[
                'rounded-2xl border px-3 py-3 text-sm font-semibold',
                kind === 'evening'
                  ? 'border-amber-600 bg-amber-600 text-white'
                  : 'border-amber-200/70 bg-amber-50 text-amber-950',
              ].join(' ')}
            >
              مسائية
            </button>
          </div>

          <div className="mt-4">
            <label className="block text-right text-xs font-semibold text-amber-900/70">
              ملاحظات الافتتاح
            </label>
            <textarea
              className="mt-1 min-h-24 w-full rounded-2xl border border-amber-200/70 bg-amber-50/50 p-3 text-right"
              value={openNotes}
              onChange={(event) => setOpenNotes(event.target.value)}
              placeholder="ملاحظات اختيارية مع بداية الوردية"
            />
          </div>

          <div className="mt-4 rounded-3xl border border-amber-200/70 bg-amber-50/40 p-3">
            <div className="mb-2 text-right text-sm font-semibold text-amber-950">
              تعيين الأدوار
            </div>
            <div className="space-y-2">
              {activeStaff.map((item) => {
                const currentRole = assignments[item.id] ?? '';
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 rounded-2xl border border-amber-200/70 bg-white p-2"
                  >
                    <select
                      aria-label="اختر دور الموظف في الوردية"
                      className="w-1/2 rounded-2xl border border-amber-200/70 bg-amber-50/50 p-2"
                      value={currentRole}
                      onChange={(event) => setRole(item.id, event.target.value as ShiftRole | '')}
                    >
                      <option value="">بدون دور</option>
                      <option value="supervisor">مشرف</option>
                      <option value="waiter">ويتر</option>
                      <option value="barista">باريستا</option>
                      <option value="shisha">شيشة</option>
                    </select>
                    <div className="flex-1 text-right">
                      <div className="text-sm font-semibold text-amber-950">
                        {item.fullName ?? item.employeeCode ?? item.id}
                      </div>
                      <div className="text-[11px] text-amber-900/60">
                        {currentRole ? `الدور الحالي: ${roleLabel(currentRole as ShiftRole)}` : 'بدون دور'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-3 rounded-2xl border border-amber-200/70 bg-amber-50/60 p-3 text-right text-xs text-amber-900/80">
            المشرف المختار:{' '}
            <b>
              {selectedSupervisorId
                ? activeStaff.find((item) => item.id === selectedSupervisorId)?.fullName ?? selectedSupervisorId
                : 'غير محدد'}
            </b>
          </div>

          <button
            disabled={busy || activeStaff.length === 0}
            onClick={openShift}
            className="mt-4 w-full rounded-2xl bg-amber-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? '...' : 'فتح الوردية'}
          </button>
        </section>
      ) : (
        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-right text-sm text-slate-600">لا توجد وردية مفتوحة حاليًا.</div>
        </section>
      )}
      {snapshotView ? (
        <section className="mt-4 rounded-3xl border border-sky-200 bg-sky-50/60 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="text-right">
              <div className="text-sm font-bold text-sky-950">سناب شوت الإغلاق</div>
              <div className="mt-1 text-xs text-sky-900/70">
                {snapshotView.shift.businessDate} • أُخذت اللقطة{" "}
                {formatDateTime(snapshotView.shift.snapshotTakenAt)}
              </div>
            </div>
            <div className="rounded-2xl border border-sky-200 bg-white px-3 py-2 text-xs font-semibold text-sky-900">
              {snapshotView.shift.snapshotPhase ?? "ops"}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-sky-200 bg-white p-3 text-center">
              <div className="text-xs text-sky-900/60">صافي المبيعات</div>
              <div className="mt-1 text-base font-bold text-sky-950">
                {formatMoney(snapshotView.summary.netSales)} ج
              </div>
            </div>
            <div className="rounded-2xl border border-sky-200 bg-white p-3 text-center">
              <div className="text-xs text-sky-900/60">نقدي</div>
              <div className="mt-1 text-base font-bold text-sky-950">
                {formatMoney(snapshotView.summary.cashSales)} ج
              </div>
            </div>
            <div className="rounded-2xl border border-sky-200 bg-white p-3 text-center">
              <div className="text-xs text-sky-900/60">آجل</div>
              <div className="mt-1 text-base font-bold text-sky-950">
                {formatMoney(snapshotView.summary.deferredSales)} ج
              </div>
            </div>
            <div className="rounded-2xl border border-sky-200 bg-white p-3 text-center">
              <div className="text-xs text-sky-900/60">المسلّم / المرتجع</div>
              <div className="mt-1 text-base font-bold text-sky-950">
                {snapshotView.summary.deliveredItemCount} /{" "}
                {snapshotView.summary.remadeItemCount}
              </div>
            </div>
          </div>

          <div className="mt-3 rounded-2xl border border-sky-200 bg-white p-3">
            <div className="text-right text-sm font-semibold text-sky-950">
              ملخص الموظفين
            </div>
            <div className="mt-2 space-y-2">
              {snapshotView.employees.map((item) => (
                <div
                  key={item.userId}
                  className="flex items-center justify-between gap-2 rounded-2xl border border-sky-100 bg-sky-50/40 p-2"
                >
                  <div className="rounded-xl bg-sky-100 px-2 py-1 text-xs font-semibold text-sky-900">
                    {item.shiftRole ? roleLabel(item.shiftRole) : "ملخص"}
                  </div>
                  <div className="flex-1 text-right">
                    <div className="text-sm font-semibold text-sky-950">
                      {item.fullName}
                    </div>
                    <div className="mt-1 text-[11px] text-sky-900/70">
                      تجهيز {item.preparedItemCount} • تسليم {item.deliveredItemCount} •
                      نقدي {formatMoney(item.cashCollected)} • آجل{" "}
                      {formatMoney(item.deferredBooked)}
                    </div>
                  </div>
                </div>
              ))}
              {snapshotView.employees.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-sky-200 bg-sky-50/30 p-3 text-right text-sm text-sky-900/70">
                  لا يوجد ملخص موظفين في هذه اللقطة.
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      <section className="mt-4 rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="mb-2 text-right text-sm font-semibold text-neutral-950">
          آخر الورديات
        </div>
        {history.length === 0 ? (
          <div className="text-right text-sm text-neutral-500">لا توجد ورديات سابقة.</div>
        ) : (
          <div className="space-y-2">
            {history.slice(0, 6).map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3 text-right"
              >
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => void loadSnapshot(item.id)}
                    disabled={snapshotBusyFor === item.id || !item.endedAt}
                    className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 disabled:opacity-50"
                  >
                    {snapshotBusyFor === item.id ? "..." : "عرض السناب شوت"}
                  </button>
                  <div>
                    <div className="text-sm font-semibold text-neutral-950">
                      {kindLabel(item.kind)}
                    </div>
                    <div className="mt-1 text-xs text-neutral-600">
                      بدأت: {formatDateTime(item.startedAt)}
                    </div>
                    <div className="mt-1 text-xs text-neutral-600">
                      انتهت: {formatDateTime(item.endedAt)}
                    </div>
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