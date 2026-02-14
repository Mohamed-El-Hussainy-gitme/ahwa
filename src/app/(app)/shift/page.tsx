"use client";

import { useEffect, useMemo, useState } from "react";
import { MobileShell } from "@/ui/MobileShell";

type ShiftKind = "morning" | "evening";

type StaffRow = {
  id: string;
  name: string | null;
  display_name: string | null;
  login_name: string | null;
  base_role: string;
  is_active: boolean;
};

type ShiftRow = {
  id: string;
  kind: ShiftKind;
  is_open: boolean;
  started_at: string;
  supervisor_user_id: string | null;
};

type AssignmentRow = {
  id: string;
  user_id: string;
  role: string;
};

function kindLabel(k: ShiftKind) {
  return k === "morning" ? "صباحية" : "مسائية";
}

function roleLabel(r: string) {
  if (r === "supervisor") return "مشرف";
  if (r === "waiter") return "ويتر";
  if (r === "barista") return "باريستا";
  if (r === "shisha") return "شيشة";
  return r;
}

export default function ShiftPage() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [shift, setShift] = useState<ShiftRow | null>(null);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);

  const [kind, setKind] = useState<ShiftKind>("morning");
  const [supervisorUserId, setSupervisorUserId] = useState<string>("");
  const activeStaff = useMemo(() => staff.filter((s) => s.is_active), [staff]);

  async function loadAll() {
    setMsg(null);

    const staffRes = await fetch("/api/owner/staff/list", { cache: "no-store" });
    const staffJson = await staffRes.json().catch(() => null);

    if (!staffJson?.ok) {
      setStaff([]);
      setMsg(staffJson?.error ?? "FAILED_TO_LOAD_STAFF");
      return;
    }
    setStaff(staffJson.staff as StaffRow[]);

    const stateRes = await fetch("/api/owner/shift/state", { cache: "no-store" });
    const stateJson = await stateRes.json().catch(() => null);

    if (!stateJson?.ok) {
      setShift(null);
      setAssignments([]);
      setMsg(stateJson?.error ?? "FAILED_TO_LOAD_SHIFT");
      return;
    }

    setShift((stateJson.shift as ShiftRow | null) ?? null);
    setAssignments((stateJson.assignments as AssignmentRow[]) ?? []);

    if (stateJson.shift?.kind) setKind(stateJson.shift.kind as ShiftKind);
    setSupervisorUserId(stateJson.shift?.supervisor_user_id ?? "");
  }

  useEffect(() => {
    loadAll();
  }, []);

  function setRole(userId: string, role: string) {
    setAssignments((prev) => {
      const found = prev.find((a) => a.user_id === userId);
      if (!found) return [...prev, { id: `tmp-${userId}`, user_id: userId, role }];
      return prev.map((a) => (a.user_id === userId ? { ...a, role } : a));
    });
  }

  async function openShift() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/owner/shift/open", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          supervisorUserId: supervisorUserId || null,
          assignments: assignments
            .filter((a) => !!a.role)
            .map((a) => ({ userId: a.user_id, role: a.role })),
        }),
      });

      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        setMsg(json?.error ?? "FAILED_TO_OPEN_SHIFT");
        return;
      }
      await loadAll();
    } finally {
      setBusy(false);
    }
  }

  async function closeShift() {
    if (!shift) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/owner/shift/close", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ shiftId: shift.id }),
      });

      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        setMsg(json?.error ?? "FAILED_TO_CLOSE_SHIFT");
        return;
      }
      await loadAll();
    } finally {
      setBusy(false);
    }
  }

  return (
    <MobileShell title="الوردية" backHref="/owner">
      {msg ? (
        <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-right text-sm text-red-700">
          {msg}
        </div>
      ) : null}

      {shift ? (
        <div className="rounded-3xl border border-emerald-200/70 bg-emerald-50 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-right">
              <div className="text-sm font-bold text-emerald-950">وردية مفتوحة</div>
              <div className="mt-1 text-xs text-emerald-900/70">
                {kindLabel(shift.kind)} • بدأت {new Date(shift.started_at).toLocaleString("ar-EG")}
              </div>
            </div>
            <div className="rounded-2xl bg-white px-3 py-2 text-xs font-semibold text-emerald-900 border border-emerald-200/70">
              مفتوحة
            </div>
          </div>

          <button
            disabled={busy}
            onClick={closeShift}
            className="mt-4 w-full rounded-2xl bg-red-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "..." : "تقفيل وردية"}
          </button>

          <div className="mt-3 text-right text-xs text-emerald-900/70">
            ملاحظة: عند تقفيل الوردية، كل الموظفين يحتاجوا تسجيل الدخول من جديد لوردية جديدة.
          </div>
        </div>
      ) : (
        <div className="rounded-3xl border border-amber-200/70 bg-white p-4 shadow-sm">
          <div className="text-right font-bold text-amber-950">فتح وردية جديدة</div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setKind("morning")}
              className={[
                "rounded-2xl border px-3 py-3 text-sm font-semibold",
                kind === "morning" ? "bg-amber-600 text-white border-amber-600" : "bg-amber-50 border-amber-200/70 text-amber-950",
              ].join(" ")}
            >
              صباحية
            </button>
            <button
              type="button"
              onClick={() => setKind("evening")}
              className={[
                "rounded-2xl border px-3 py-3 text-sm font-semibold",
                kind === "evening" ? "bg-amber-600 text-white border-amber-600" : "bg-amber-50 border-amber-200/70 text-amber-950",
              ].join(" ")}
            >
              مسائية
            </button>
          </div>

          <div className="mt-3">
            <label className="block text-right text-xs font-semibold text-amber-900/70">مشرف (اختياري)</label>
            <select
              className="mt-1 w-full rounded-2xl border border-amber-200/70 bg-amber-50/50 p-3 text-right"
              value={supervisorUserId}
              onChange={(e) => setSupervisorUserId(e.target.value)}
            >
              <option value="">بدون مشرف</option>
              {activeStaff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name ?? s.display_name ?? s.login_name ?? s.id}
                </option>
              ))}
            </select>
            <div className="mt-1 text-right text-[11px] text-amber-900/60">
              المشرف يستطيع التحصيل/الخصم، ويقدر يأخذ الطلبات أيضًا.
            </div>
          </div>

          <div className="mt-4 rounded-3xl border border-amber-200/70 bg-amber-50/40 p-3">
            <div className="mb-2 text-right text-sm font-semibold text-amber-950">تعيين الأدوار داخل الوردية</div>

            {activeStaff.length === 0 ? (
              <div className="text-right text-sm text-amber-900/70">لا يوجد موظفين فعّالين.</div>
            ) : (
              <div className="space-y-2">
                {activeStaff.map((s) => {
                  const current = assignments.find((a) => a.user_id === s.id)?.role ?? "";
                  return (
                    <div key={s.id} className="flex items-center gap-2 rounded-2xl bg-white p-2 border border-amber-200/70">
                      <select
                        className="w-1/2 rounded-2xl border border-amber-200/70 bg-amber-50/50 p-2"
                        value={current}
                        onChange={(e) => setRole(s.id, e.target.value)}
                      >
                        <option value="">بدون دور</option>
                        <option value="supervisor">مشرف</option>
                        <option value="waiter">ويتر</option>
                        <option value="barista">باريستا</option>
                        <option value="shisha">شيشة</option>
                      </select>

                      <div className="flex-1 text-right">
                        <div className="text-sm font-semibold text-amber-950">
                          {s.name ?? s.display_name ?? s.login_name}
                        </div>
                        <div className="text-[11px] text-amber-900/60">
                          الدور الحالي: {current ? roleLabel(current) : "بدون"}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <button
            disabled={busy || activeStaff.length === 0}
            onClick={openShift}
            className="mt-4 w-full rounded-2xl bg-amber-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "..." : "فتح وردية"}
          </button>

          <div className="mt-3 text-right text-[11px] text-amber-900/60">
            تنبيه: لا تضف أدوار غير موجودة. الأدوار المعتمدة: مشرف/ويتر/باريستا/شيشة.
          </div>
        </div>
      )}
    </MobileShell>
  );
}
