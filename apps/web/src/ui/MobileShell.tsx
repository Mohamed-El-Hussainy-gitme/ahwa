'use client';

import Link, { type LinkProps } from 'next/link';
import { usePathname } from 'next/navigation';
import { BottomNav } from '@/ui/BottomNav';
import { useAuthz } from '@/lib/authz';
import { useOpsChrome } from '@/lib/ops/chrome';

type RoleView = 'owner' | 'supervisor' | 'waiter' | 'barista' | 'shisha' | 'unassigned';
type SyncState = ReturnType<typeof useOpsChrome>['sync']['state'];

type QuickMetric = {
  key: string;
  label: string;
  value: string | number;
  href?: LinkProps['href'];
  tone: string;
};

function formatSyncAge(lastLoadedAt: number | null) {
  if (!lastLoadedAt) return 'بانتظار';
  const delta = Math.max(0, Math.round((Date.now() - lastLoadedAt) / 1000));
  if (delta < 60) return `${delta}ث`;
  const minutes = Math.floor(delta / 60);
  if (minutes < 60) return `${minutes}د`;
  const hours = Math.floor(minutes / 60);
  return `${hours}س`;
}

function formatMinutes(minutes: number | null) {
  if (minutes == null) return '—';
  if (minutes < 60) return `${minutes} د`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}س ${rest}د` : `${hours}س`;
}

function syncTone(state: SyncState) {
  if (state === 'connected') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (state === 'reconnecting' || state === 'connecting') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-100 text-slate-600';
}

function stateLabel(state: SyncState) {
  if (state === 'connected') return 'مباشر';
  if (state === 'reconnecting' || state === 'connecting') return 'يعيد الاتصال';
  if (state === 'disconnected') return 'غير متصل';
  return 'متابعة';
}

function ageTone(minutes: number | null) {
  if (minutes == null) return 'border-slate-200 bg-slate-50 text-slate-700';
  if (minutes >= 15) return 'border-red-200 bg-red-50 text-red-700';
  if (minutes >= 8) return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700';
}

function countTone(count: number, mode: 'pending' | 'ready' | 'sessions' | 'billing') {
  if (mode === 'sessions') {
    return count > 0
      ? 'border-sky-200 bg-sky-50 text-sky-700'
      : 'border-slate-200 bg-slate-50 text-slate-700';
  }

  if (mode === 'billing') {
    return count > 0
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : 'border-slate-200 bg-slate-50 text-slate-700';
  }

  if (count >= 10) return 'border-red-200 bg-red-50 text-red-700';
  if (count >= 4) return 'border-amber-200 bg-amber-50 text-amber-700';
  if (count > 0) return mode === 'ready' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-sky-200 bg-sky-50 text-sky-700';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

function sessionHrefForRole(role: RoleView) {
  if (role === 'barista' || role === 'shisha') {
    return '/dashboard';
  }
  return '/orders#sessions-panel';
}

function buildQuickMetrics(input: {
  pathname: string;
  role: RoleView;
  summary: ReturnType<typeof useOpsChrome>['summary'];
}): QuickMetric[] {
  const { pathname, role, summary } = input;
  if (!summary) return [];

  const totalPending = summary.waitingBarista + summary.waitingShisha;
  const sessionMetric: QuickMetric = {
    key: 'sessions',
    label: 'جلسات',
    value: summary.openSessions,
    href: sessionHrefForRole(role),
    tone: countTone(summary.openSessions, 'sessions'),
  };

  if (pathname === '/owner') {
    return [];
  }

  if (pathname === '/kitchen') {
    return [
      {
        key: 'pending-age',
        label: 'أقدم انتظار',
        value: formatMinutes(summary.queueHealth.oldestPendingMinutes),
        href: '/kitchen#queue-panel',
        tone: ageTone(summary.queueHealth.oldestPendingMinutes),
      },
      {
        key: 'pending-count',
        label: 'انتظار',
        value: summary.waitingBarista,
        href: '/kitchen#queue-panel',
        tone: countTone(summary.waitingBarista, 'pending'),
      },
      sessionMetric,
    ];
  }

  if (pathname === '/shisha') {
    return [
      {
        key: 'pending-age',
        label: 'أقدم انتظار',
        value: formatMinutes(summary.queueHealth.oldestPendingMinutes),
        href: '/shisha#queue-panel',
        tone: ageTone(summary.queueHealth.oldestPendingMinutes),
      },
      {
        key: 'pending-count',
        label: 'انتظار',
        value: summary.waitingShisha,
        href: '/shisha#queue-panel',
        tone: countTone(summary.waitingShisha, 'pending'),
      },
      sessionMetric,
    ];
  }

  if (pathname === '/orders') {
    if (role === 'waiter' || role === 'supervisor') {
      return [sessionMetric];
    }

    return [
      {
        key: 'ready-age',
        label: 'أقدم جاهز',
        value: formatMinutes(summary.queueHealth.oldestReadyMinutes),
        href: '/orders#ready-panel',
        tone: ageTone(summary.queueHealth.oldestReadyMinutes),
      },
      {
        key: 'ready-count',
        label: 'جاهز',
        value: summary.readyForDelivery,
        href: '/orders#ready-panel',
        tone: countTone(summary.readyForDelivery, 'ready'),
      },
      sessionMetric,
    ];
  }

  if (pathname === '/ready') {
    if (role === 'waiter' || role === 'supervisor') {
      return [
        {
          key: 'ready-age',
          label: 'أقدم جاهز',
          value: formatMinutes(summary.queueHealth.oldestReadyMinutes),
          href: '/ready#ready-panel',
          tone: ageTone(summary.queueHealth.oldestReadyMinutes),
        },
        {
          key: 'ready-count',
          label: 'جاهز',
          value: summary.readyForDelivery,
          href: '/ready#ready-panel',
          tone: countTone(summary.readyForDelivery, 'ready'),
        },
        sessionMetric,
      ];
    }

    return [];
  }

  if (pathname === '/dashboard') {
    if (role === 'barista') {
      return [
        {
          key: 'pending-age',
          label: 'أقدم انتظار',
          value: formatMinutes(summary.queueHealth.oldestPendingMinutes),
          href: '/kitchen#queue-panel',
          tone: ageTone(summary.queueHealth.oldestPendingMinutes),
        },
        {
          key: 'pending-count',
          label: 'انتظار',
          value: summary.waitingBarista,
          href: '/kitchen#queue-panel',
          tone: countTone(summary.waitingBarista, 'pending'),
        },
        sessionMetric,
      ];
    }

    if (role === 'shisha') {
      return [
        {
          key: 'pending-age',
          label: 'أقدم انتظار',
          value: formatMinutes(summary.queueHealth.oldestPendingMinutes),
          href: '/shisha#queue-panel',
          tone: ageTone(summary.queueHealth.oldestPendingMinutes),
        },
        {
          key: 'pending-count',
          label: 'انتظار',
          value: summary.waitingShisha,
          href: '/shisha#queue-panel',
          tone: countTone(summary.waitingShisha, 'pending'),
        },
        sessionMetric,
      ];
    }

    if (role === 'waiter') {
      return [sessionMetric];
    }

    if (role === 'owner' || role === 'supervisor') {
      return [
        {
          key: 'pending-count',
          label: 'انتظار',
          value: totalPending,
          href: totalPending > 0 ? '/kitchen#queue-panel' : '/dashboard',
          tone: countTone(totalPending, 'pending'),
        },
        sessionMetric,
        {
          key: 'billing',
          label: 'للحساب',
          value: summary.billableQty,
          href: '/billing',
          tone: countTone(summary.billableQty, 'billing'),
        },
      ];
    }

    if (role === 'unassigned') {
      return [
        {
          key: 'billing',
          label: 'للحساب',
          value: summary.billableQty,
          href: '/billing',
          tone: countTone(summary.billableQty, 'billing'),
        },
        sessionMetric,
      ];
    }
  }

  return [];
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
  const pathname = usePathname();
  const { can, effectiveRole } = useAuthz();
  const { summary, lastLoadedAt, sync } = useOpsChrome();

  const role: RoleView = can.owner ? 'owner' : effectiveRole ?? 'unassigned';
  const quickMetrics = buildQuickMetrics({
    pathname,
    role,
    summary,
  });

  const syncBadgeLabel = `${stateLabel(sync.state)} · ${formatSyncAge(lastLoadedAt)}`;

  return (
    <div className="min-h-dvh bg-[#f4efe7]">
      <div className="mx-auto max-w-md min-h-dvh bg-[#fffaf4] md:my-6 md:min-h-[calc(100dvh-3rem)] md:rounded-[28px] md:border md:border-[#d9cabb] md:shadow-[0_18px_48px_rgba(30,23,18,0.08)]">
        <header className="sticky top-0 z-10 border-b border-[#e5d7c8] bg-[#fffaf4]/95 px-4 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              {backHref ? (
                <Link
                  href={backHref}
                  className="shrink-0 rounded-xl border border-[#d9cabb] bg-white px-3 py-2 text-xs font-semibold text-[#6b5a4c] active:scale-[.99]"
                >
                  رجوع
                </Link>
              ) : null}
              <div className="min-w-0 truncate text-[15px] font-semibold tracking-wide text-[#1e1712]">{title}</div>
            </div>
            <div className="shrink-0">{topRight}</div>
          </div>

          {(quickMetrics.length || pathname !== '/owner') ? (
            <div className="mt-3 flex items-start gap-2">
              {quickMetrics.length ? (
                <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
                  {quickMetrics.map((metric) => {
                    const content = (
                      <>
                        <div className="text-[10px] font-semibold leading-none opacity-80">{metric.label}</div>
                        <div className="mt-1 text-sm font-black leading-none">{metric.value}</div>
                      </>
                    );

                    const className = [
                      'min-w-[88px] rounded-2xl border px-3 py-2 text-right shadow-sm transition',
                      metric.href ? 'active:scale-[.99]' : '',
                      metric.tone,
                    ].join(' ');

                    return metric.href ? (
                      <Link key={metric.key} href={metric.href} className={className}>
                        {content}
                      </Link>
                    ) : (
                      <div key={metric.key} className={className}>
                        {content}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex-1" />
              )}

              <div className={`shrink-0 rounded-2xl border px-3 py-2 text-right text-[11px] font-semibold shadow-sm ${syncTone(sync.state)}`}>
                {syncBadgeLabel}
              </div>
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
