'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import type { PlatformAdminSession } from '@/lib/platform-auth/session';
import { PlatformLogoutButton } from './PlatformLogoutButton';

type NavItem = {
  href: string;
  label: string;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'الرئيسية',
    items: [
      { href: '/platform/overview', label: 'نظرة عامة' },
      { href: '/platform/cafes', label: 'سجل القهاوي' },
      { href: '/platform/cafes/new', label: 'إنشاء قهوة' },
    ],
  },
  {
    title: 'المتابعة',
    items: [
      { href: '/platform/money', label: 'التحصيل والاشتراكات' },
      { href: '/platform/support', label: 'الدعم الفني' },
      { href: '/platform/observability', label: 'مراقبة التشغيل' },
    ],
  },
  {
    title: 'الإعدادات',
    items: [
      { href: '/platform/settings', label: 'سياسات الشاردات' },
    ],
  },
];

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== '/platform/overview' && pathname.startsWith(`${href}/`));
}

export function PlatformChrome({
  session,
  title,
  description,
  children,
}: {
  session: PlatformAdminSession;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  void description;

  return (
    <main className="min-h-dvh bg-slate-100 text-slate-900" dir="rtl">
      <div className="mx-auto max-w-[1600px] p-4 lg:p-6">
        <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="space-y-4 rounded-[32px] border border-slate-200 bg-white p-4 shadow-sm xl:sticky xl:top-4 xl:h-fit">
            <div className="rounded-[28px] bg-gradient-to-br from-indigo-600 via-indigo-500 to-sky-500 p-5 text-white">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-100">ahwa control</div>
              <div className="mt-3 text-2xl font-bold">لوحة السوبر أدمن</div>
              <div className="mt-2 text-sm text-indigo-50">{session.displayName}</div>
              <div className="mt-1 text-xs text-indigo-100">{session.email}</div>
            </div>

            {NAV_GROUPS.map((group) => (
              <div key={group.title} className="space-y-2 rounded-[28px] border border-slate-200 bg-slate-50 p-3">
                <div className="px-2 text-xs font-semibold text-slate-500">{group.title}</div>
                <div className="space-y-2">
                  {group.items.map((item) => {
                    const active = isActive(pathname, item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`block rounded-2xl border px-4 py-3 transition ${
                          active
                            ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                            : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300'
                        }`}
                      >
                        <div className="text-sm font-semibold">{item.label}</div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="rounded-[28px] border border-slate-200 bg-white p-4">
              <PlatformLogoutButton />
            </div>
          </aside>

          <section className="space-y-6">
            <div className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
              <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
            </div>
            {children}
          </section>
        </div>
      </div>
    </main>
  );
}
