"use client";

import Link from "next/link";
import { BottomNav } from "@/ui/BottomNav";

export function MobileShell({
  title,
  children,
  topRight,
  backHref,
}: {
  title: string;
  children: React.ReactNode;
  topRight?: React.ReactNode;
  backHref?: string;
}) {
  return (
    <div className="min-h-dvh bg-slate-50">
      <div className="mx-auto max-w-md min-h-dvh bg-white md:my-6 md:min-h-[calc(100dvh-3rem)] md:rounded-3xl md:border md:border-slate-200 md:shadow-sm">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              {backHref ? (
                <Link
                  href={backHref}
                  className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 active:scale-[.99]"
                >
                  رجوع
                </Link>
              ) : null}
              <div className="min-w-0">
                <div className="truncate text-[15px] font-semibold tracking-wide text-slate-900">{title}</div>
              </div>
            </div>
            <div className="shrink-0">{topRight}</div>
          </div>
        </header>

        <main className="px-3 pb-[calc(84px+env(safe-area-inset-bottom))] pt-3">
          {children}
        </main>

        <div className="fixed bottom-0 left-0 right-0">
          <div className="mx-auto max-w-md border-t border-slate-200 bg-white/90 backdrop-blur px-2 py-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(0,0,0,0.06)]">
            <BottomNav />
          </div>
        </div>
      </div>
    </div>
  );
}
