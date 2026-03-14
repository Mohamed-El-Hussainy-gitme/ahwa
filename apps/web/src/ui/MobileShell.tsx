'use client';

import Link from 'next/link';
import { BottomNav } from '@/ui/BottomNav';
import { useOpsChrome } from '@/lib/ops/chrome';

function formatSyncLabel(lastLoadedAt: number | null) {
  if (!lastLoadedAt) return 'بانتظار المزامنة';
  return `آخر مزامنة ${new Date(lastLoadedAt).toLocaleTimeString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

function syncTone(state: ReturnType<typeof useOpsChrome>['sync']['state']) {
  if (state === 'connected') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (state === 'reconnecting' || state === 'connecting') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-100 text-slate-600';
}

export function MobileShell({
  title,
  children,
  topRight,
  backHref,
  stickyFooter,
}: {
  title: string;
  children: React.ReactNode;
  topRight?: React.ReactNode;
  backHref?: string;
  stickyFooter?: React.ReactNode;
}) {
  const { summary, lastLoadedAt, sync } = useOpsChrome();

  const chips = [
    summary?.readyForDelivery ? { label: 'جاهز', value: summary.readyForDelivery, tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' } : null,
    summary?.billableQty ? { label: 'حساب', value: summary.billableQty, tone: 'bg-sky-50 text-sky-700 border-sky-200' } : null,
    summary?.deferredCustomerCount ? { label: 'آجل', value: summary.deferredCustomerCount, tone: 'bg-amber-50 text-amber-700 border-amber-200' } : null,
  ].filter(Boolean) as Array<{ label: string; value: number; tone: string }>;

  return (
    <div className="min-h-dvh bg-slate-50">
      <div className="mx-auto max-w-md min-h-dvh bg-white md:my-6 md:min-h-[calc(100dvh-3rem)] md:rounded-3xl md:border md:border-slate-200 md:shadow-sm">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
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
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                  <span className={['inline-flex items-center rounded-full border px-2 py-1 font-semibold', syncTone(sync.state)].join(' ')}>
                    {sync.state === 'connected'
                      ? 'مباشر'
                      : sync.state === 'reconnecting' || sync.state === 'connecting'
                        ? 'إعادة اتصال'
                        : 'غير متصل'}
                  </span>
                  <span>{formatSyncLabel(lastLoadedAt)}</span>
                </div>
              </div>
            </div>
            <div className="shrink-0">{topRight}</div>
          </div>
          {chips.length ? (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {chips.map((chip) => (
                <div key={chip.label} className={['inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold whitespace-nowrap', chip.tone].join(' ')}>
                  <span>{chip.label}</span>
                  <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px]">{chip.value}</span>
                </div>
              ))}
            </div>
          ) : null}
        </header>

        <main className="px-3 pt-3" style={{ paddingBottom: stickyFooter ? 'calc(168px + env(safe-area-inset-bottom))' : 'calc(84px + env(safe-area-inset-bottom))' }}>
          {children}
        </main>

        {stickyFooter ? (
          <div className="fixed bottom-[72px] left-0 right-0 z-20 px-3 pb-3">
            <div className="mx-auto max-w-md">{stickyFooter}</div>
          </div>
        ) : null}

        <div className="fixed bottom-0 left-0 right-0 z-20">
          <div className="mx-auto max-w-md border-t border-slate-200 bg-white/90 px-2 py-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(0,0,0,0.06)] backdrop-blur">
            <BottomNav />
          </div>
        </div>
      </div>
    </div>
  );
}
