'use client';

import Link, { type LinkProps } from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BottomNav } from '@/ui/BottomNav';
import { useAuthz } from '@/lib/authz';
import { useSession } from '@/lib/session';
import { useOpsChrome } from '@/lib/ops/chrome';
import { AppIcon } from '@/ui/icons/AppIcon';
import BrandLogo from '@/ui/brand/BrandLogo';

type RoleView = 'owner' | 'supervisor' | 'waiter' | 'barista' | 'shisha' | 'american_waiter' | 'unassigned';
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

function useElementHeight<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const update = () => {
      setHeight(Math.ceil(element.getBoundingClientRect().height));
    };

    update();

    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener('resize', update);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  return { ref, height } as const;
}

function syncTone(state: SyncState) {
  if (state === 'connected') return 'border-[#cfe0d7] bg-[#eff7f1] text-[#2e6a4e]';
  if (state === 'reconnecting' || state === 'connecting') return 'border-[#ecd9bd] bg-[#fcf3e7] text-[#a5671e]';
  return 'border-[#d8d5cf] bg-[#f3f1ed] text-[#6d675f]';
}

function stateLabel(state: SyncState) {
  if (state === 'connected') return 'مباشر';
  if (state === 'reconnecting' || state === 'connecting') return 'يعيد الاتصال';
  if (state === 'disconnected') return 'غير متصل';
  return 'متابعة';
}

function ageTone(minutes: number | null) {
  if (minutes == null) return 'border-[#ddd6cc] bg-[#faf7f2] text-[#6d675f]';
  if (minutes >= 15) return 'border-[#e6c7c2] bg-[#fff3f1] text-[#9a3e35]';
  if (minutes >= 8) return 'border-[#ecd9bd] bg-[#fcf3e7] text-[#a5671e]';
  return 'border-[#cfe0d7] bg-[#eff7f1] text-[#2e6a4e]';
}

function countTone(count: number, mode: 'pending' | 'ready' | 'sessions' | 'billing') {
  if (mode === 'sessions') {
    return count > 0
      ? 'border-[#d6dee5] bg-[#f4f7f9] text-[#3c617c]'
      : 'border-[#ddd6cc] bg-[#faf7f2] text-[#6d675f]';
  }

  if (mode === 'billing') {
    return count > 0
      ? 'border-[#cfe0d7] bg-[#eff7f1] text-[#2e6a4e]'
      : 'border-[#ddd6cc] bg-[#faf7f2] text-[#6d675f]';
  }

  if (count >= 10) return 'border-[#e6c7c2] bg-[#fff3f1] text-[#9a3e35]';
  if (count >= 4) return 'border-[#ecd9bd] bg-[#fcf3e7] text-[#a5671e]';
  if (count > 0) return mode === 'ready' ? 'border-[#cfe0d7] bg-[#eff7f1] text-[#2e6a4e]' : 'border-[#d6dee5] bg-[#f4f7f9] text-[#3c617c]';
  return 'border-[#ddd6cc] bg-[#faf7f2] text-[#6d675f]';
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
    label: 'الجلسات',
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
        label: 'الانتظار',
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
        label: 'الانتظار',
        value: summary.waitingShisha,
        href: '/shisha#queue-panel',
        tone: countTone(summary.waitingShisha, 'pending'),
      },
      sessionMetric,
    ];
  }

  if (pathname === '/orders') {
    if (role === 'waiter' || role === 'supervisor' || role === 'american_waiter') {
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
        label: 'الجاهز',
        value: summary.readyForDelivery,
        href: '/orders#ready-panel',
        tone: countTone(summary.readyForDelivery, 'ready'),
      },
      sessionMetric,
    ];
  }

  if (pathname === '/ready') {
    if (role === 'waiter' || role === 'supervisor' || role === 'american_waiter') {
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
          label: 'الجاهز',
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
          label: 'الانتظار',
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
          label: 'الانتظار',
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

    if (role === 'american_waiter') {
      return [
        {
          key: 'pending-count',
          label: 'الانتظار',
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

    if (role === 'owner' || role === 'supervisor') {
      return [
        {
          key: 'pending-count',
          label: 'الانتظار',
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
  desktopMode = 'mobile',
}: {
  title: string;
  children: React.ReactNode;
  topRight?: React.ReactNode;
  backHref?: string;
  stickyFooter?: React.ReactNode;
  desktopMode?: 'mobile' | 'wide';
}) {
  const pathname = usePathname();
  const session = useSession();
  const { can, effectiveRole } = useAuthz();
  const { summary, lastLoadedAt, sync } = useOpsChrome();
  const cafeName = session.user?.cafeName?.trim() || session.user?.cafeId || 'القهوة الحالية';
  const stickyFooterBox = useElementHeight<HTMLDivElement>();
  const bottomNavBox = useElementHeight<HTMLDivElement>();

  const role: RoleView = can.owner ? 'owner' : effectiveRole ?? 'unassigned';
  const quickMetrics = buildQuickMetrics({
    pathname,
    role,
    summary,
  });

  const syncBadgeLabel = `${stateLabel(sync.state)} · ${formatSyncAge(lastLoadedAt)}`;
  const bottomDockHeight = useMemo(() => {
    const bottomNavHeight = bottomNavBox.height || 82;
    const stickyFooterHeight = stickyFooter ? stickyFooterBox.height + 12 : 0;
    return bottomNavHeight + stickyFooterHeight + 20;
  }, [bottomNavBox.height, stickyFooter, stickyFooterBox.height]);

  const shellMaxWidthClass = desktopMode === 'wide' ? 'max-w-[min(1440px,calc(100vw-3rem))]' : 'max-w-md';

  const stickyFooterOffset = useMemo(() => {
    const bottomNavHeight = bottomNavBox.height || 82;
    return bottomNavHeight + 8;
  }, [bottomNavBox.height]);

  return (
    <div className="min-h-dvh bg-[linear-gradient(180deg,#f4efe7_0%,#eadcc8_100%)] px-0 md:px-4">
      <div className={`mx-auto flex min-h-dvh ${shellMaxWidthClass} flex-col bg-[#fffaf4] md:my-6 md:min-h-[calc(100dvh-3rem)] md:rounded-[32px] md:border md:border-[#d9cabb] md:shadow-[0_28px_72px_rgba(30,23,18,0.12)]`}>
        <header className="sticky top-0 z-10 border-b border-[#eadfce] bg-[linear-gradient(180deg,rgba(255,250,244,0.98)_0%,rgba(249,241,231,0.96)_100%)] px-4 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              {backHref ? (
                <Link
                  href={backHref}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-[18px] border border-[#d9cabb] bg-white px-3 py-2 text-xs font-semibold text-[#6b5a4c] shadow-sm active:scale-[.99]"
                >
                  <AppIcon name="chevronRight" className="h-3.5 w-3.5" />
                  رجوع
                </Link>
              ) : null}

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <BrandLogo className="w-[74px] shrink-0" withWordmark />
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold tracking-[0.24em] text-[#9b6b2e]">تشغيل القهوة</div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <div className="truncate text-[16px] font-semibold text-[#1e1712]">{title}</div>
                      <div className="max-w-[138px] truncate rounded-full border border-[#dccab6] bg-[#fff7ed] px-2.5 py-1 text-[11px] font-semibold text-[#7c5222]">
                        {cafeName}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
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
                        <div className="text-[10px] font-semibold leading-none opacity-75">{metric.label}</div>
                        <div className="mt-1 text-[15px] font-black leading-none">{metric.value}</div>
                      </>
                    );

                    const className = [
                      'min-w-[96px] rounded-[18px] border px-3 py-2.5 text-right shadow-sm transition',
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

              <div
                className={[
                  'shrink-0 rounded-[18px] border px-3 py-2 text-right text-[11px] font-semibold shadow-sm',
                  syncTone(sync.state),
                ].join(' ')}
              >
                {syncBadgeLabel}
              </div>
            </div>
          ) : null}
        </header>

        <main
          className="flex-1 px-3 pt-3"
          style={{ paddingBottom: `calc(${bottomDockHeight}px + env(safe-area-inset-bottom))` }}
        >
          {children}
        </main>

        {stickyFooter ? (
          <div className="fixed left-0 right-0 z-20 px-3 pb-3" style={{ bottom: `${stickyFooterOffset}px` }}>
            <div ref={stickyFooterBox.ref} className={`mx-auto w-full ${shellMaxWidthClass}`}>
              {stickyFooter}
            </div>
          </div>
        ) : null}

        <div ref={bottomNavBox.ref} className="fixed bottom-0 left-0 right-0 z-20">
          <div className={`mx-auto w-full ${shellMaxWidthClass} px-2 pb-[env(safe-area-inset-bottom)] pt-2`}>
            <div className="rounded-t-[26px] border border-b-0 border-[#ddcfbf] bg-[linear-gradient(180deg,rgba(255,250,244,0.96)_0%,rgba(248,238,226,0.98)_100%)] px-2 py-2 shadow-[0_-16px_32px_rgba(30,23,18,0.08)] backdrop-blur">
              <BottomNav />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}