"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export default function OwnerLoginClient() {
  const r = useRouter();
  const sp = useSearchParams();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit() {
    setErr(null);
    if (!phone.trim() || !password.trim()) return;
    setBusy(true);
    try {
      // Legacy URL: /owner-login. Backend uses partners table (phone + password_hash).
      const res = await fetch("/api/auth/partner-login", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, password }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "LOGIN_FAILED");
        return;
      }
      const next = sp.get("next");
      r.replace(next && next.startsWith("/") ? next : "/");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh bg-gradient-to-b from-amber-50 to-slate-50 p-4 flex items-center justify-center">
      <div className="w-full max-w-sm rounded-3xl border border-neutral-200/70 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-amber-100 text-xl">👑</div>
          <div>
            <div className="text-xl font-semibold text-neutral-900">دخول المعلم</div>
            <div className="mt-0.5 text-sm text-neutral-500">رقم الموبايل + كلمة المرور</div>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <input
            dir="ltr"
            className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-3 text-left"
            placeholder="رقم الموبايل"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
          />
          <input
            className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-3 text-right"
            placeholder="كلمة المرور"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
          />

          <button
            onClick={onSubmit}
            disabled={busy}
            className="w-full rounded-2xl bg-neutral-900 px-4 py-3 font-semibold text-white disabled:opacity-60"
          >
            {busy ? "..." : "دخول"}
          </button>

          {err && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {err === "BAD_CREDENTIALS"
                ? "بيانات الدخول غير صحيحة"
                : err === "PARTNER_NOT_FOUND"
                  ? "الحساب غير موجود/غير مفعل"
                  : err === "CAFE_NOT_ACTIVE"
                    ? "القهوة غير مفعلة"
                    : err === "SESSION_ERROR"
                      ? "تعذر إنشاء جلسة تسجيل الدخول — تأكد من AHWA_SESSION_SECRET و إعدادات الكوكيز"
                      : "حدث خطأ"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
