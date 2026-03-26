"use client";

import { useEffect, useMemo, useState } from "react";
import { MobileShell } from "@/ui/MobileShell";
import { useAuthz } from "@/lib/authz";
import { extractApiErrorMessage } from "@/lib/api/errors";

type StaffEmploymentStatus = "active" | "inactive" | "left";

type StaffRow = {
  id: string;
  fullName: string | null;
  employeeCode: string | null;
  accountKind: string;
  isActive: boolean;
  employmentStatus: StaffEmploymentStatus;
  createdAt: string;
};

function statusLabel(status: StaffEmploymentStatus) {
  switch (status) {
    case "active":
      return "فعال";
    case "inactive":
      return "موقوف مؤقتًا";
    case "left":
      return "غادر";
  }
}

function statusTone(status: StaffEmploymentStatus) {
  switch (status) {
    case "active":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "inactive":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "left":
      return "border-slate-200 bg-slate-100 text-slate-600";
  }
}

export default function StaffPage() {
  const { can } = useAuthz();
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "left" | "all">("active");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function refresh() {
    setMsg(null);
    const res = await fetch("/api/owner/staff/list", { cache: "no-store" });
    const json = await res.json().catch(() => null);

    if (!json?.ok) {
      setStaff([]);
      setMsg(extractApiErrorMessage(json, "FAILED_TO_LOAD_STAFF"));
      return;
    }
    setStaff(json.staff as StaffRow[]);
  }

  useEffect(() => {
    if (!can.manageStaff) return;
    void refresh();
  }, [can.manageStaff]);

  async function createStaff() {
    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch("/api/owner/staff/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, pin, employeeCode }),
      });
      const json = await res.json().catch(() => null);

      if (!json?.ok) {
        setMsg(extractApiErrorMessage(json, "STAFF_CREATE_FAILED"));
        return;
      }

      setName("");
      setPin("");
      setEmployeeCode("");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function setEmploymentStatus(userId: string, employmentStatus: StaffEmploymentStatus) {
    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch("/api/owner/staff/set-status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, employmentStatus }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        setMsg(extractApiErrorMessage(json, "STATUS_UPDATE_FAILED"));
        return;
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function resetPin(userId: string) {
    const next = prompt("اكتب PIN جديد (4 أرقام أو أكثر):")?.trim() ?? "";
    if (!next) return;
    if (next.length < 4) {
      alert("PIN قصير");
      return;
    }

    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch("/api/owner/staff/set-pin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, pin: next }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        setMsg(extractApiErrorMessage(json, "PIN_RESET_FAILED"));
        return;
      }
      alert("تم تحديث الـ PIN. يجب على عضو الفريق تسجيل الدخول من جديد.");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const visibleStaff = useMemo(
    () => staff.filter((item) => (statusFilter === "all" ? true : item.employmentStatus === statusFilter)),
    [staff, statusFilter],
  );

  return (
    <MobileShell title="فريق العمل" backHref="/owner">
      <div className="rounded-3xl border border-amber-200/70 bg-white p-4 shadow-sm">
        <div className="mb-3 text-right font-bold text-amber-950">إضافة عضو للفريق</div>

        {msg && (
          <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-right text-sm text-red-600">
            {msg}
          </div>
        )}

        <div className="grid gap-2 sm:grid-cols-3">
          <input
            className="rounded-2xl border border-amber-200/70 bg-amber-50/50 p-3 text-right"
            placeholder="PIN"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />
          <input
            className="rounded-2xl border border-amber-200/70 bg-amber-50/50 p-3 text-right"
            placeholder="كود الموظف"
            value={employeeCode}
            onChange={(e) => setEmployeeCode(e.target.value)}
          />
          <input
            className="rounded-2xl border border-amber-200/70 bg-amber-50/50 p-3 text-right sm:col-span-1"
            placeholder="الإسم (للتسجيل)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <button
          disabled={busy || !name.trim() || !pin.trim() || !employeeCode.trim()}
          onClick={createStaff}
          className="mt-3 w-full rounded-2xl bg-amber-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "..." : "إضافة"}
        </button>

        <div className="mt-2 text-right text-xs text-amber-900/70">
          تسجيل دخول عضو الفريق: يدخل <b>اسمه أو كوده</b> + <b>PIN</b> داخل شاشة القهوة.
        </div>
      </div>

      <div className="mt-4 rounded-3xl border border-amber-200/70 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={refresh}
            className="rounded-2xl border border-amber-200/70 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900"
          >
            تحديث
          </button>
          <div className="text-right font-bold text-amber-950">القائمة</div>
        </div>

        <div className="mt-3 flex flex-wrap justify-end gap-2">
          {[
            { key: "active", label: "النشطون" },
            { key: "inactive", label: "الموقوفون" },
            { key: "left", label: "غادروا" },
            { key: "all", label: "الكل" },
          ].map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => setStatusFilter(filter.key as "active" | "inactive" | "left" | "all")}
              className={[
                "rounded-full border px-3 py-1 text-xs font-semibold",
                statusFilter === filter.key
                  ? "border-amber-700 bg-amber-700 text-white"
                  : "border-amber-200/70 bg-amber-50 text-amber-900",
              ].join(" ")}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="mt-3 text-right text-xs text-amber-900/70">
          القائمة اليومية تبدأ بالنشطين فقط حتى تبقى الإدارة أخف، ويمكن إظهار الموقوفين أو من غادروا عند المراجعة فقط.
        </div>

        {visibleStaff.length === 0 ? (
          <div className="mt-3 text-right text-sm text-amber-900/70">لا يوجد أعضاء في هذا التصنيف.</div>
        ) : (
          <div className="mt-3 space-y-2">
            {visibleStaff.map((s) => {
              const display = s.fullName ?? s.employeeCode ?? s.id;
              const isOwner = s.accountKind === "owner";
              return (
                <div key={s.id} className="rounded-2xl border border-amber-200/70 bg-amber-50/40 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-2">
                      {!isOwner ? (
                        <>
                          <button
                            disabled={busy}
                            onClick={() => resetPin(s.id)}
                            className="rounded-2xl border border-amber-200/70 bg-white px-3 py-2 text-xs font-semibold text-amber-950 disabled:opacity-50"
                          >
                            تغيير PIN
                          </button>

                          <button
                            disabled={busy}
                            onClick={() => void setEmploymentStatus(s.id, s.employmentStatus === "active" ? "inactive" : "active")}
                            className={[
                              "rounded-2xl px-3 py-2 text-xs font-semibold text-white disabled:opacity-50",
                              s.employmentStatus === "active" ? "bg-amber-600" : "bg-emerald-600",
                            ].join(" ")}
                          >
                            {s.employmentStatus === "active" ? "إيقاف مؤقت" : "تفعيل"}
                          </button>

                          {s.employmentStatus !== "left" ? (
                            <button
                              disabled={busy}
                              onClick={() => void setEmploymentStatus(s.id, "left")}
                              className="rounded-2xl bg-slate-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                            >
                              غادر
                            </button>
                          ) : null}
                        </>
                      ) : (
                        <div className="text-[11px] text-amber-900/60">(لا يمكن تعديل حساب المالك هنا)</div>
                      )}
                    </div>

                    <div className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className={["rounded-full border px-2 py-0.5 text-[11px] font-semibold", statusTone(s.employmentStatus)].join(" ")}>
                          {statusLabel(s.employmentStatus)}
                        </span>
                        <div className="font-semibold text-amber-950">{display}</div>
                      </div>
                      <div className="mt-1 text-xs text-amber-900/70">
                        الدور الأساسي: <b>{isOwner ? "مالك" : "عضو فريق"}</b>
                      </div>
                      {s.employeeCode ? (
                        <div className="mt-1 text-[11px] text-amber-900/60">كود الموظف: {s.employeeCode}</div>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </MobileShell>
  );
}
