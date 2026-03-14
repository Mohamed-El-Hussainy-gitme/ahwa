'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthz } from '@/lib/authz';
import { useOpsChrome } from '@/lib/ops/chrome';

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function BottomNav() {
  const pathname = usePathname();
  const { can, effectiveRole } = useAuthz();
  const { summary } = useOpsChrome();

  const kitchenTab = (() => {
    if (!can.kitchen) return null;
    if (effectiveRole === 'shisha' && !can.owner) {
      return { href: '/shisha', label: 'شيشة', icon: '🔥', show: true, badge: summary?.waitingShisha ?? 0 };
    }
    return { href: '/kitchen', label: 'مطبخ', icon: '☕', show: true, badge: summary?.waitingBarista ?? 0 };
  })();

  const tabs = [
    { href: '/dashboard', label: 'الرئيسية', icon: '🏠', show: can.viewDashboard, badge: 0 },
    { href: '/orders', label: 'طلبات', icon: '🧾', show: can.takeOrders, badge: summary?.readyForDelivery ?? 0 },
    kitchenTab ?? { href: '/kitchen', label: 'مطبخ', icon: '☕', show: false, badge: 0 },
    { href: '/billing', label: 'حساب', icon: '💵', show: can.billing, badge: summary?.billableQty ?? 0 },
    { href: '/customers', label: 'آجل', icon: '👥', show: can.billing && !can.owner, badge: summary?.deferredCustomerCount ?? 0 },
    { href: '/owner', label: 'إدارة', icon: '👑', show: can.owner, badge: 0 },
  ].filter((t) => t.show);

  const cols =
    tabs.length <= 3
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
              'border-slate-200',
              active ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-50 text-slate-900 hover:bg-slate-100',
            ].join(' ')}
          >
            {t.badge > 0 ? (
              <span className={[
                'absolute -top-1 left-1 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                active ? 'bg-white text-emerald-700' : 'bg-slate-900 text-white',
              ].join(' ')}>
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
