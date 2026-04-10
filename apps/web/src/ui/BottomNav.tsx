'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthz } from '@/lib/authz';
import { useOpsChrome } from '@/lib/ops/chrome';
import { AppIcon } from '@/ui/icons/AppIcon';

type NavTab = {
  href: string;
  label: string;
  icon:
    | 'home'
    | 'orders'
    | 'coffee'
    | 'shisha'
    | 'wallet'
    | 'crown'
    | 'checkCircle'
    | 'users'
    | 'lifebuoy';
  badge: number;
};

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function buildTabs(input: {
  role: 'owner' | 'supervisor' | 'waiter' | 'barista' | 'shisha' | 'american_waiter' | 'unassigned';
  summary: ReturnType<typeof useOpsChrome>['summary'];
}): NavTab[] {
  const { role, summary } = input;

  if (role === 'owner') {
    return [
      { href: '/dashboard', label: 'الرئيسية', icon: 'home', badge: 0 },
      { href: '/orders', label: 'الطلبات', icon: 'orders', badge: summary?.readyForDelivery ?? 0 },
      { href: '/kitchen', label: 'الباريستا', icon: 'coffee', badge: summary?.waitingBarista ?? 0 },
      { href: '/shisha', label: 'الشيشة', icon: 'shisha', badge: summary?.waitingShisha ?? 0 },
      { href: '/billing', label: 'الحساب', icon: 'wallet', badge: summary?.billableQty ?? 0 },
      { href: '/owner', label: 'الإدارة', icon: 'crown', badge: 0 },
    ];
  }

  if (role === 'supervisor') {
    return [
      { href: '/dashboard', label: 'الرئيسية', icon: 'home', badge: 0 },
      { href: '/ready', label: 'جاهز', icon: 'checkCircle', badge: summary?.readyForDelivery ?? 0 },
      { href: '/orders', label: 'الطلبات', icon: 'orders', badge: 0 },
      { href: '/billing', label: 'الحساب', icon: 'wallet', badge: summary?.billableQty ?? 0 },
      { href: '/customers', label: 'الآجل', icon: 'users', badge: summary?.deferredCustomerCount ?? 0 },
      { href: '/complaints', label: 'الشكاوى', icon: 'lifebuoy', badge: 0 },
    ];
  }

  if (role === 'barista') {
    return [
      { href: '/dashboard', label: 'الرئيسية', icon: 'home', badge: 0 },
      { href: '/kitchen', label: 'الباريستا', icon: 'coffee', badge: summary?.waitingBarista ?? 0 },
    ];
  }

  if (role === 'shisha') {
    return [
      { href: '/dashboard', label: 'الرئيسية', icon: 'home', badge: 0 },
      { href: '/shisha', label: 'الشيشة', icon: 'shisha', badge: summary?.waitingShisha ?? 0 },
    ];
  }

  if (role === 'waiter') {
    return [
      { href: '/dashboard', label: 'الرئيسية', icon: 'home', badge: 0 },
      { href: '/ready', label: 'جاهز', icon: 'checkCircle', badge: summary?.readyForDelivery ?? 0 },
      { href: '/orders', label: 'الطلبات', icon: 'orders', badge: 0 },
    ];
  }

  if (role === 'american_waiter') {
    return [
      { href: '/dashboard', label: 'الرئيسية', icon: 'home', badge: 0 },
      { href: '/ready', label: 'جاهز', icon: 'checkCircle', badge: summary?.readyForDelivery ?? 0 },
      { href: '/orders', label: 'الطلبات', icon: 'orders', badge: 0 },
      { href: '/kitchen', label: 'الباريستا', icon: 'coffee', badge: summary?.waitingBarista ?? 0 },
      { href: '/shisha', label: 'الشيشة', icon: 'shisha', badge: summary?.waitingShisha ?? 0 },
      { href: '/billing', label: 'الحساب', icon: 'wallet', badge: summary?.billableQty ?? 0 },
    ];
  }

  return [{ href: '/dashboard', label: 'الرئيسية', icon: 'home', badge: 0 }];
}

export function BottomNav() {
  const pathname = usePathname();
  const { can, effectiveRole } = useAuthz();
  const { summary } = useOpsChrome();

  const role: 'owner' | 'supervisor' | 'waiter' | 'barista' | 'shisha' | 'american_waiter' | 'unassigned' = can.owner
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
    <nav className={['grid gap-2', cols].join(' ')} aria-label="تنقل سريع">
      {tabs.map((tab) => {
        const active = isActivePath(pathname, tab.href);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={[
              'group relative overflow-hidden rounded-[20px] border px-1.5 py-2 text-center transition duration-150',
              active
                ? 'border-[#1e1712] bg-[#1e1712] text-white shadow-[0_12px_24px_rgba(30,23,18,0.16)]'
                : 'border-[#dccdbb] bg-[#fffaf4] text-[#4e4034] hover:bg-[#f6ede2]',
            ].join(' ')}
          >
            {tab.badge > 0 ? (
              <span
                className={[
                  'absolute left-1.5 top-1.5 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                  active ? 'bg-[#f1e1cb] text-[#7c5222]' : 'bg-[#1e1712] text-white',
                ].join(' ')}
              >
                {tab.badge > 99 ? '99+' : tab.badge}
              </span>
            ) : null}

            <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-2xl bg-black/5 transition group-hover:scale-[1.02] group-hover:bg-black/7 group-active:scale-[.99]">
              <AppIcon name={tab.icon} className="h-4.5 w-4.5" />
            </div>
            <div className="mt-1.5 text-[11px] font-semibold leading-none">{tab.label}</div>
          </Link>
        );
      })}
    </nav>
  );
}
