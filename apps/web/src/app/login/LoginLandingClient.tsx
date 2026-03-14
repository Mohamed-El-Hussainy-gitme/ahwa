"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginLandingClient() {
  const r = useRouter();
  const sp = useSearchParams();
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("ahwa.lastCafeSlug") : null;
    if (saved && !slug) setSlug(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function slugify(raw: string) {
    // slug can be latin or arabic; normalize spaces to '-'
    // Keep: letters/numbers (unicode), '-' and '_'
    return (raw ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      // Keep: unicode letters/numbers, '_' and '-' (place '-' last to avoid regex range parsing issues)
      .replace(/[^\p{L}\p{N}_-]/gu, "")
      .replace(/-+/g, "-")
      .replace(/^[-_]+|[-_]+$/g, "");
  }

  async function go() {
    setErr(null);
    const s = slugify(slug);
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
      if (e) qs.set("e", e);
      if (next) qs.set("next", next);
      const q = qs.toString();
      r.push(`/c/${encodeURIComponent(s)}/login` + (q ? `?${q}` : ""));
    } finally {
      setBusy(false);
    }
  }

  function goOwner() {
    const next = sp.get("next");
    r.push(next ? `/owner-login?next=${encodeURIComponent(next)}` : "/owner-login");
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
    <div className="min-h-dvh bg-gradient-to-b from-amber-50 to-slate-50 p-4 flex items-center justify-center">
      <div className="w-full max-w-sm rounded-3xl border border-neutral-200/70 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-amber-100 text-xl">☕</div>
          <div>
            <div className="text-xl font-semibold text-neutral-900">دخول القهوة</div>
            <div className="mt-0.5 text-sm text-neutral-500">اكتب كود القهوة (slug) للمتابعة</div>
          </div>
        </div>

        {msg && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{msg}</div>
        )}

        <input
          className="mt-4 w-full rounded-2xl border border-neutral-200 bg-white px-3 py-3 text-right"
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
          className="mt-3 w-full rounded-2xl bg-neutral-900 px-4 py-3 font-semibold text-white disabled:opacity-60"
        >
          {busy ? "..." : "متابعة"}
        </button>

        <button
          onClick={goOwner}
          className="mt-2 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 font-semibold text-neutral-900"
        >
          دخول المعلم (أونر)
        </button>
      </div>
    </div>
  );
}
