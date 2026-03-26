"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { normalizeCafeSlug } from '@/lib/cafes/slug';
import LoginClient from '@/app/c/[slug]/login/LoginClient';
import BrandLogo from "@/ui/brand/BrandLogo";

export default function LoginLandingClient() {
  const r = useRouter();
  const sp = useSearchParams();
  const requestedSlug = normalizeCafeSlug(sp.get("slug") ?? "");
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("ahwa.lastCafeSlug") : null;
    if (requestedSlug) {
      setSlug(requestedSlug);
      if (typeof window !== "undefined") {
        localStorage.setItem("ahwa.lastCafeSlug", requestedSlug);
      }
      return;
    }
    if (saved && !slug) setSlug(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedSlug]);

  function ownerHref(preferredSlug?: string) {
    const next = sp.get("next");
    const qs = new URLSearchParams();
    const effectiveSlug = normalizeCafeSlug(preferredSlug ?? slug);
    if (effectiveSlug) qs.set("slug", effectiveSlug);
    if (next) qs.set("next", next);
    const query = qs.toString();
    return `/owner-login${query ? `?${query}` : ""}`;
  }

  async function go() {
    setErr(null);
    const s = normalizeCafeSlug(slug);
    if (!s) {
      setErr("INVALID_SLUG");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/auth/cafe-exists?slug=${encodeURIComponent(s)}`);
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) {
        setErr("CHECK_FAILED");
        return;
      }
      if (!j.exists) {
        setErr("CAFE_NOT_FOUND");
        return;
      }

      localStorage.setItem("ahwa.lastCafeSlug", s);
      const e = sp.get("e");
      const next = sp.get("next");
      const qs = new URLSearchParams();
      qs.set("slug", s);
      if (e) qs.set("e", e);
      if (next) qs.set("next", next);
      r.push(`/login?${qs.toString()}`);
    } finally {
      setBusy(false);
    }
  }

  async function goOwner() {
    setErr(null);
    const s = normalizeCafeSlug(slug) || (typeof window !== "undefined" ? normalizeCafeSlug(localStorage.getItem("ahwa.lastCafeSlug") ?? "") : "");
    if (!s) {
      r.push(ownerHref());
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/auth/cafe-exists?slug=${encodeURIComponent(s)}`);
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok || !j.exists) {
        setErr(!j.exists ? "CAFE_NOT_FOUND" : "CHECK_FAILED");
        return;
      }
      localStorage.setItem("ahwa.lastCafeSlug", s);
      r.push(ownerHref(s));
    } finally {
      setBusy(false);
    }
  }

  if (requestedSlug) {
    return <LoginClient cafeSlug={requestedSlug} />;
  }

  const e = sp.get("e");
  const msg =
    e === "no_shift"
      ? "لا توجد وردية مفتوحة"
      : e === "not_assigned"
        ? "بانتظار تعيين دورك"
        : e === "cafe_not_found"
          ? "القهوة غير موجودة"
          : e === "pin_changed"
            ? "تم تغيير PIN — سجل دخول مرة أخرى"
            : null;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[linear-gradient(180deg,#f4efe7_0%,#eadcc8_100%)] p-4">
      <div className="w-full max-w-sm rounded-[28px] border border-[#d9cabb] bg-[#fffaf4] p-6 shadow-[0_18px_48px_rgba(30,23,18,0.08)]">
        <div className="mb-3">
          <BrandLogo className="mx-auto w-[220px]" priority />
        </div>

        <div className="text-center">
          <div className="text-xl font-semibold text-[#1e1712]">دخول القهوة</div>
          <div className="mt-1 text-sm text-[#6b5a4c]">اكتب رمز القهوة للمتابعة</div>
        </div>

        {msg && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{msg}</div>
        )}

        <input
          className="mt-4 w-full rounded-2xl border border-[#d9cabb] bg-white px-4 py-3 text-right text-[#1e1712] outline-none placeholder:text-[#9d8b79]"
          placeholder="مثال: fishawy"
          value={slug}
          onChange={(e2) => setSlug(e2.target.value)}
        />

        {err && (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {err === "INVALID_SLUG"
              ? "اكتب كود القهوة بشكل صحيح"
              : err === "CAFE_NOT_FOUND"
                ? "القهوة غير موجودة أو غير مفعلة"
                : "تعذر التحقق الآن"}
          </div>
        )}

        <button
          onClick={go}
          disabled={busy}
          className="mt-3 w-full rounded-2xl bg-[#1e1712] px-4 py-3 font-semibold text-white disabled:opacity-60"
        >
          {busy ? "..." : "متابعة"}
        </button>

        <button
          onClick={goOwner}
          disabled={busy}
          className="mt-2 w-full rounded-2xl border border-[#d9cabb] bg-[#f7efe4] px-4 py-3 font-semibold text-[#1e1712] disabled:opacity-60"
        >
          دخول المالك
        </button>

        <a
          href={`/support?source=login${slug ? `&slug=${encodeURIComponent(slug)}` : ''}`}
          className="mt-2 block w-full rounded-2xl border border-[#e6d3ba] bg-[#f3e7d7] px-4 py-3 text-center font-semibold text-[#7c5222]"
        >
          تحتاج مساعدة؟
        </a>
      </div>
    </div>
  );
}
