"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export default function OwnerLoginClient() {
  const r = useRouter();
  const sp = useSearchParams();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [resolvedSlug, setResolvedSlug] = useState("");

  const slugFromQuery = useMemo(() => (sp.get("slug") || "").trim().toLowerCase(), [sp]);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("ahwa.lastCafeSlug") : null;
    const nextSlug = slugFromQuery || (saved ? saved.trim().toLowerCase() : "");
    if (nextSlug) {
      setResolvedSlug(nextSlug);
      if (typeof window !== "undefined") {
        localStorage.setItem("ahwa.lastCafeSlug", nextSlug);
      }
    }
  }, [slugFromQuery]);

  async function onSubmit() {
    setErr(null);
    if (!phone.trim() || !password.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/auth/owner-login", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, password, slug: resolvedSlug || undefined }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "LOGIN_FAILED");
        return;
      }
      if (resolvedSlug && typeof window !== "undefined") {
        localStorage.setItem("ahwa.lastCafeSlug", resolvedSlug);
      }
      const next = sp.get("next");
      r.replace(next && next.startsWith("/") ? next : "/dashboard");
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
            {resolvedSlug ? <div className="mt-1 text-xs text-neutral-500">القهوة: <span className="font-semibold">{resolvedSlug}</span></div> : null}
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
                : err === "PARTNER_NOT_FOUND" || err === "invalid_owner_credentials"
                  ? "بيانات الدخول غير صحيحة"
                  : err === "MISSING_CAFE_SLUG"
                    ? "حدد القهوة أولاً من شاشة الدخول"
                    : err === "CAFE_NOT_FOUND"
                      ? "القهوة غير موجودة أو غير مفعلة"
                      : "حدث خطأ"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
