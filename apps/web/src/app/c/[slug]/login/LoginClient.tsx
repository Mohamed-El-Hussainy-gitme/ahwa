'use client';

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

function getErrorCode(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "LOGIN_FAILED";
  }

  const value = payload as {
    error?: string | { code?: string; message?: string };
  };

  if (typeof value.error === "string" && value.error.trim()) {
    return value.error;
  }

  if (
    value.error &&
    typeof value.error === "object" &&
    typeof value.error.code === "string" &&
    value.error.code.trim()
  ) {
    return value.error.code;
  }

  if (
    value.error &&
    typeof value.error === "object" &&
    typeof value.error.message === "string" &&
    value.error.message.trim()
  ) {
    return value.error.message;
  }

  return "LOGIN_FAILED";
}

export default function LoginClient({ cafeSlug }: { cafeSlug: string }) {
  const r = useRouter();
  const sp = useSearchParams();
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit() {
    setErr(null);
    if (!name.trim() || !pin.trim()) return;

    setBusy(true);
    try {
      const res = await fetch("/api/auth/staff-login", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cafeSlug, name, pin }),
      });

      const j = await res.json().catch(() => ({}));

      if (!res.ok || !j.ok) {
        setErr(getErrorCode(j));
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
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-amber-100 text-xl">🔐</div>
          <div className="min-w-0">
            <div className="text-xl font-semibold text-neutral-900">تسجيل الدخول</div>
            <div className="mt-0.5 truncate text-sm text-neutral-500">
              قهوة: <span className="font-semibold">{cafeSlug}</span>
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <input
            className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-3 text-right"
            placeholder="الاسم"
            value={name}
            onChange={(e) => setName(e.target.value)}
            inputMode="text"
          />
          <input
            className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-3 text-right"
            placeholder="PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            inputMode="numeric"
          />

          <button
            onClick={onSubmit}
            disabled={busy}
            className="w-full rounded-2xl bg-neutral-900 px-4 py-3 font-semibold text-white disabled:opacity-60"
          >
            {busy ? "..." : "دخول"}
          </button>

          <button
            onClick={() => {
              const next = sp.get("next");
              r.push(
                next
                  ? `/owner-login?slug=${encodeURIComponent(cafeSlug)}&next=${encodeURIComponent(next)}`
                  : `/owner-login?slug=${encodeURIComponent(cafeSlug)}`,
              );
            }}
            className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 font-semibold text-neutral-900"
          >
            دخول المالك
          </button>

          {err && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {err === "BAD_CREDENTIALS"
                ? "بيانات الدخول غير صحيحة"
                : err === "NO_SHIFT"
                  ? "لا توجد وردية مفتوحة الآن"
                  : err === "NOT_ASSIGNED"
                    ? "لا يوجد لك دور في الوردية"
                    : err === "NEEDS_PIN" || err === "NEEDS_PROVISION"
                      ? "PIN غير مضبوط بعد — اطلب من المالك ضبطه"
                      : err === "CAFE_NOT_FOUND"
                        ? "القهوة غير موجودة"
                        : err === "STAFF_NOT_FOUND"
                          ? "الموظف غير موجود أو غير مفعل"
                          : err === "LOCKED"
                            ? "محاولات كثيرة. حاول لاحقًا"
                            : err === "SESSION_ERROR"
                              ? "تعذر إنشاء جلسة تسجيل الدخول"
                              : "حدث خطأ"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}