"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { normalizeCafeSlug } from '@/lib/cafes/slug';
import BrandLogo from "@/ui/brand/BrandLogo";

export default function OwnerLoginClient() {
  const r = useRouter();
  const sp = useSearchParams();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [resolvedSlug, setResolvedSlug] = useState("");

  const slugFromQuery = useMemo(() => normalizeCafeSlug(sp.get("slug") || ""), [sp]);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("ahwa.lastCafeSlug") : null;
    const nextSlug = slugFromQuery || normalizeCafeSlug(saved ?? "");
    if (nextSlug) {
      setResolvedSlug(nextSlug);
      if (typeof window !== "undefined") {
        localStorage.setItem("ahwa.lastCafeSlug", nextSlug);
      }
    }
  }, [slugFromQuery]);

  function resolveSafeNext() {
    const next = sp.get("next");
    if (!next || !next.startsWith("/")) return "/dashboard";
    if (next === "/owner-password" || next.startsWith("/owner-password?") || next.startsWith("/owner-password/")) {
      return "/dashboard";
    }
    return next;
  }

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
      r.replace(resolveSafeNext());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[linear-gradient(180deg,#f4efe7_0%,#eadcc8_100%)] p-4">
      <div className="w-full max-w-sm rounded-[28px] border border-[#d9cabb] bg-[#fffaf4] p-6 shadow-[0_18px_48px_rgba(30,23,18,0.08)]">
        <div className="mb-3">
          <BrandLogo className="mx-auto w-[220px]" priority />
        </div>

        <div className="text-center">
          <div className="text-xl font-semibold text-[#1e1712]">دخول المالك</div>
          <div className="mt-1 text-sm text-[#6b5a4c]">رقم الجوال وكلمة المرور</div>
          {resolvedSlug ? <div className="mt-1 text-xs text-[#6b5a4c]">القهوة: <span className="font-semibold text-[#1e1712]">{resolvedSlug}</span></div> : null}
        </div>

        <div className="mt-4 space-y-2">
          <input
            dir="ltr"
            className="w-full rounded-2xl border border-[#d9cabb] bg-white px-4 py-3 text-left text-[#1e1712] outline-none placeholder:text-[#9d8b79]"
            placeholder="رقم الموبايل"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
          />
          <input
            className="w-full rounded-2xl border border-[#d9cabb] bg-white px-4 py-3 text-right text-[#1e1712] outline-none placeholder:text-[#9d8b79]"
            placeholder="كلمة المرور"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
          />

          <button
            onClick={onSubmit}
            disabled={busy}
            className="w-full rounded-2xl bg-[#1e1712] px-4 py-3 font-semibold text-white disabled:opacity-60"
          >
            {busy ? "..." : "دخول"}
          </button>

          <button
            type="button"
            onClick={() => r.push(resolvedSlug ? `/owner-password?slug=${encodeURIComponent(resolvedSlug)}` : '/owner-password')}
            className="w-full rounded-2xl border border-[#d9cabb] bg-[#f7efe4] px-4 py-3 text-sm font-medium text-[#6b5a4c]"
          >
            لدي كود تفعيل أو إعادة تعيين
          </button>

          {err && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {err === "BAD_CREDENTIALS"
                ? "بيانات الدخول غير صحيحة"
                : err === "PARTNER_NOT_FOUND" || err === "invalid_owner_credentials"
                  ? "بيانات الدخول غير صحيحة"
                  : err === "MISSING_CAFE_SLUG"
                    ? "حدد القهوة أولًا من شاشة الدخول"
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
