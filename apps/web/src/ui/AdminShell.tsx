"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";

type NavItem = { href: string; label: string; emoji?: string };

export function AdminShell({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav: NavItem[] = useMemo(
    () => [
      { href: "/dashboard", label: "نظرة عامة", emoji: "📊" },
      { href: "/orders", label: "الطلبات", emoji: "🧾" },
      { href: "/billing", label: "الحساب", emoji: "💵" },
      { href: "/kitchen", label: "المطبخ", emoji: "☕" },
      { href: "/customers", label: "الزبائن/المديونيات", emoji: "👥" },
    ],
    []
  );

  return (
    <div className="min-h-dvh bg-amber-50 text-amber-950">
      {/* mobile top bar */}
      <div className="sticky top-0 z-30 border-b border-amber-200/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-3">
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-lg border border-amber-200/70 bg-amber-50 px-3 py-2 text-sm"
            aria-label="فتح القائمة"
          >
            ☰
          </button>

          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-semibold tracking-wide">{title}</div>
            {subtitle ? <div className="truncate text-xs text-amber-900/70">{subtitle}</div> : null}
          </div>

          <div className="shrink-0">{right}</div>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl grid-cols-1 md:grid-cols-[260px_1fr]">
        {/* sidebar */}
        <aside
          className={[
            "border-l border-amber-200/70 md:border-l-0 md:border-r md:sticky md:top-[56px] md:h-[calc(100dvh-56px)]",
            open ? "block" : "hidden md:block",
          ].join(" ")}
        >
          <div className="p-3">
            <div className="rounded-2xl border border-amber-200/70 bg-white p-4 shadow-sm">
              <div className="text-lg font-semibold tracking-wide">لوحة القهوة</div>
              <div className="mt-1 text-xs text-amber-900/70">إدارة سريعة (موبايل أولاً)</div>

              <div className="mt-4 space-y-1">
                {nav.map((it) => {
                  const active = pathname === it.href;
                  return (
                    <Link
                      key={it.href}
                      href={it.href}
                      onClick={() => setOpen(false)}
                      className={[
                        "flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition",
                        active ? "bg-amber-600 text-white" : "hover:bg-amber-50",
                      ].join(" ")}
                    >
                      <span className="text-base">{it.emoji ?? "•"}</span>
                      <span className="font-medium">{it.label}</span>
                    </Link>
                  );
                })}
              </div>

              <div className="mt-4 rounded-xl border border-amber-200/70 bg-amber-50 p-3 text-xs text-amber-900/80">
                الهدف: سلاسة التشغيل على الموبايل. متابعة: الطلبات، التحصيل، والمديونيات.
              </div>
            </div>
          </div>
        </aside>

        {/* content */}
        <main className="p-3">
          <div className="rounded-2xl border border-amber-200/70 bg-white p-3 md:p-5 shadow-sm">
            <div className="mb-4 hidden items-start justify-between gap-3 md:flex">
              <div>
                <div className="text-xl font-semibold tracking-wide">{title}</div>
                {subtitle ? <div className="text-sm text-amber-900/70">{subtitle}</div> : null}
              </div>
              <div>{right}</div>
            </div>

            <div>{children}</div>
          </div>
          <div className="p-3 text-center text-xs text-amber-900/50">© {new Date().getFullYear()}</div>
        </main>
      </div>
    </div>
  );
}
