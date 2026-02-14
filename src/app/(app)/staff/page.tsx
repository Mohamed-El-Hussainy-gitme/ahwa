"use client";

import { useEffect, useState } from "react";
import { MobileShell } from "@/ui/MobileShell";

type StaffRow = {
  id: string;
  name: string | null;
  display_name: string | null;
  login_name: string | null;
  base_role: string;
  is_active: boolean;
  created_at: string;
};

export default function StaffPage() {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function refresh() {
    setMsg(null);
    const res = await fetch("/api/owner/staff/list", { cache: "no-store" });
    const json = await res.json().catch(() => null);

    if (!json?.ok) {
      setStaff([]);
      setMsg(json?.error ?? "FAILED_TO_LOAD_STAFF");
      return;
    }
    setStaff(json.staff as StaffRow[]);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function createStaff() {
    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch("/api/owner/staff/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, pin }),
      });
      const json = await res.json().catch(() => null);

      if (!json?.ok) {
        setMsg(json?.error ?? "FAILED");
        return;
      }

      setName("");
      setPin("");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function setActive(userId: string, isActive: boolean) {
    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch("/api/owner/staff/set-active", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, isActive }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        setMsg(json?.error ?? "UPDATE_FAILED");
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
        setMsg(json?.error ?? "PIN_RESET_FAILED");
        return;
      }
      alert("تم تحديث الـ PIN. الموظف لازم يسجل دخول من جديد.");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <MobileShell title="الموظفين" backHref="/owner">
      <div className="rounded-3xl border border-amber-200/70 bg-white p-4 shadow-sm">
        <div className="mb-3 text-right font-bold text-amber-950">إضافة موظف</div>

        {msg && (
          <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-right text-sm text-red-600">
            {msg}
          </div>
        )}

        <div className="flex gap-2">
          <input
            className="w-1/3 rounded-2xl border border-amber-200/70 bg-amber-50/50 p-3 text-right"
            placeholder="PIN"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />
          <input
            className="flex-1 rounded-2xl border border-amber-200/70 bg-amber-50/50 p-3 text-right"
            placeholder="الإسم (للتسجيل)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <button
          disabled={busy || !name.trim() || !pin.trim()}
          onClick={createStaff}
          className="mt-3 w-full rounded-2xl bg-amber-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "..." : "إضافة"}
        </button>

        <div className="mt-2 text-right text-xs text-amber-900/70">
          تسجيل دخول الموظف: يدخل <b>اسمه</b> + <b>PIN</b> داخل شاشة القهوة.
        </div>
      </div>

      <div className="mt-4 rounded-3xl border border-amber-200/70 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="text-right font-bold text-amber-950">القائمة</div>
          <button onClick={refresh} className="rounded-2xl border border-amber-200/70 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
            تحديث
          </button>
        </div>

        {staff.length === 0 ? (
          <div className="mt-3 text-right text-sm text-amber-900/70">لا يوجد موظفين.</div>
        ) : (
          <div className="mt-3 space-y-2">
            {staff.map((s) => {
              const display = s.name ?? s.display_name ?? s.login_name ?? s.id;
              const isOwner = s.base_role === "owner";
              return (
                <div key={s.id} className="rounded-2xl border border-amber-200/70 bg-amber-50/40 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-right">
                      <div className="font-semibold text-amber-950">{display}</div>
                      <div className="mt-1 text-xs text-amber-900/70">
                        الدور الأساسي: <b>{isOwner ? "معلم" : "موظف"}</b> • الحالة:{" "}
                        <b>{s.is_active ? "فعال" : "موقوف"}</b>
                      </div>
                      {s.login_name ? (
                        <div className="mt-1 text-[11px] text-amber-900/60">اسم الدخول (normalized): {s.login_name}</div>
                      ) : null}
                    </div>

                    <div className="flex flex-col gap-2">
                      {!isOwner ? (
                        <>
                          <button
                            disabled={busy}
                            onClick={() => resetPin(s.id)}
                            className="rounded-2xl bg-white px-3 py-2 text-xs font-semibold text-amber-950 border border-amber-200/70 disabled:opacity-50"
                          >
                            تغيير PIN
                          </button>

                          <button
                            disabled={busy}
                            onClick={() => setActive(s.id, !s.is_active)}
                            className={[
                              "rounded-2xl px-3 py-2 text-xs font-semibold disabled:opacity-50",
                              s.is_active
                                ? "bg-red-600 text-white"
                                : "bg-emerald-600 text-white",
                            ].join(" ")}
                          >
                            {s.is_active ? "إيقاف" : "تفعيل"}
                          </button>
                        </>
                      ) : (
                        <div className="text-[11px] text-amber-900/60">(لا يمكن تعديل المعلم هنا)</div>
                      )}
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
