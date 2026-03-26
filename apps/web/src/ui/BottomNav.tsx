'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthz } from '@/lib/authz';
import { useOpsChrome } from '@/lib/ops/chrome';

type NavTab = {
  href: string;
  label: string;
  icon: string;
  badge: number;
};

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function buildTabs(input: {
  role: 'owner' | 'supervisor' | 'waiter' | 'barista' | 'shisha' | 'unassigned';
  summary: ReturnType<typeof useOpsChrome>['summary'];
}): NavTab[] {
  const { role, summary } = input;

  if (role === 'owner') {
    return [
      { href: '/dashboard', label: 'الرئيسية', icon: '🏠', badge: 0 },
      { href: '/orders', label: 'طلبات', icon: '🧾', badge: summary?.readyForDelivery ?? 0 },
      { href: '/kitchen', label: 'باريستا', icon: '☕', badge: summary?.waitingBarista ?? 0 },
      { href: '/shisha', label: 'شيشة', icon: '🔥', badge: summary?.waitingShisha ?? 0 },
      { href: '/billing', label: 'حساب', icon: '💵', badge: summary?.billableQty ?? 0 },
      { href: '/owner', label: 'الإدارة', icon: '👑', badge: 0 },
    ];
  }

  if (role === 'supervisor') {
    return [
      { href: '/dashboard', label: 'الرئيسية', icon: '🏠', badge: 0 },
      { href: '/ready', label: 'جاهز', icon: '✅', badge: summary?.readyForDelivery ?? 0 },
      { href: '/orders', label: 'طلبات', icon: '🧾', badge: 0 },
      { href: '/billing', label: 'حساب', icon: '💵', badge: summary?.billableQty ?? 0 },
      { href: '/customers', label: 'آجل', icon: '👥', badge: summary?.deferredCustomerCount ?? 0 },
      { href: '/complaints', label: 'شكاوى', icon: '🛟', badge: 0 },
    ];
  }

  if (role === 'barista') {
    return [
      { href: '/dashboard', label: 'الرئيسية', icon: '🏠', badge: 0 },
      { href: '/kitchen', label: 'الباريستا', icon: '☕', badge: summary?.waitingBarista ?? 0 },
    ];
  }

  if (role === 'shisha') {
    return [
      { href: '/dashboard', label: 'الرئيسية', icon: '🏠', badge: 0 },
      { href: '/shisha', label: 'الشيشة', icon: '🔥', badge: summary?.waitingShisha ?? 0 },
    ];
  }

  if (role === 'waiter') {
    return [
      { href: '/dashboard', label: 'الرئيسية', icon: '🏠', badge: 0 },
      { href: '/ready', label: 'جاهز', icon: '✅', badge: summary?.readyForDelivery ?? 0 },
      { href: '/orders', label: 'الطلبات', icon: '🧾', badge: 0 },
    ];
  }

  return [{ href: '/dashboard', label: 'الرئيسية', icon: '🏠', badge: 0 }];
}

export function BottomNav() {
  const pathname = usePathname();
  const { can, effectiveRole } = useAuthz();
  const { summary } = useOpsChrome();

  const role: 'owner' | 'supervisor' | 'waiter' | 'barista' | 'shisha' | 'unassigned' = can.owner
    ? 'owner'
    : effectiveRole ?? 'unassigned';

  const tabs = buildTabs({ role, summary });

  const cols =
    tabs.length <= 2
      ? 'grid-cols-2'
      : tabs.length === 3
        ? 'grid-cols-3'
        : tabs.length === 4
          ? 'grid-cols-4'
          : tabs.length === 5
            ? 'grid-cols-5'
            : 'grid-cols-6';

  return (
    <nav className={['grid gap-1', cols].join(' ')} aria-label="تنقل سريع">
      {tabs.map((t) => {
        const active = isActivePath(pathname, t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={[
              'relative rounded-2xl border px-2 py-2 text-center transition',
              'border-[#d9cabb]',
              active ? 'bg-[#1e1712] text-white shadow-sm' : 'bg-[#fffaf4] text-[#1e1712] hover:bg-[#f5ece0]',
            ].join(' ')}
          >
            {t.badge > 0 ? (
              <span
                className={[
                  'absolute -top-1 left-1 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                  active ? 'bg-white text-[#7c5222]' : 'bg-[#1e1712] text-white',
                ].join(' ')}
              >
                {t.badge > 99 ? '99+' : t.badge}
              </span>
            ) : null}
            <div className="text-base leading-none">{t.icon}</div>
            <div className="mt-1 text-[11px] font-semibold leading-none">{t.label}</div>
          </Link>
        );
      })}
    </nav>
  );
}
