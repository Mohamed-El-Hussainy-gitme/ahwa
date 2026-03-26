'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import type { PlatformAdminSession } from '@/lib/platform-auth/session';
import { PlatformLogoutButton } from './PlatformLogoutButton';

type NavItem = {
  href: string;
  label: string;
  helper?: string;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'الرئيسية',
    items: [
      { href: '/platform/overview', label: 'نظرة عامة', helper: 'الأهم الآن' },
      { href: '/platform/cafes', label: 'سجل القهاوي', helper: 'العملاء والتفعيل' },
      { href: '/platform/cafes/new', label: 'إنشاء قهوة', helper: 'إضافة عميل جديد' },
    ],
  },
  {
    title: 'المتابعة',
    items: [
      { href: '/platform/money', label: 'التحصيل والاشتراكات', helper: 'الاستحقاقات والتحصيل' },
      { href: '/platform/support', label: 'الدعم الفني', helper: 'رسائل ووصول الدعم' },
      { href: '/platform/observability', label: 'مراقبة التشغيل', helper: 'صحة النظام' },
    ],
  },
  {
    title: 'الإعدادات',
    items: [{ href: '/platform/settings', label: 'سياسات الشاردات', helper: 'السعة والضبط العام' }],
  },
];

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== '/platform/overview' && pathname.startsWith(`${href}/`));
}

function pageContext(pathname: string) {
  if (pathname.startsWith('/platform/cafes/new')) {
    return { badge: 'إضافة عميل', helper: 'إنشاء قهوة جديدة وربط الاشتراك والقاعدة من مكان واحد.' };
  }
  if (pathname.startsWith('/platform/cafes/')) {
    return { badge: 'تفاصيل القهوة', helper: 'راجع القاعدة، الاشتراك، الملاك، وآخر النشاط من شاشة واحدة.' };
  }
  if (pathname.startsWith('/platform/cafes')) {
    return { badge: 'العملاء', helper: 'فلترة السجل، مراجعة الحالة، ثم افتح التفاصيل أو الإجراءات.' };
  }
  if (pathname.startsWith('/platform/money')) {
    return { badge: 'التحصيل', helper: 'راقب الاستحقاقات القريبة والمتأخرة، ثم افتح القهوة أو حدث السجل.' };
  }
  if (pathname.startsWith('/platform/support/access/')) {
    return { badge: 'وضع الدعم', helper: 'أنت داخل مساحة وصول دعم موقتة؛ راقب واخرج منها بعد إتمام المهمة.' };
  }
  if (pathname.startsWith('/platform/support')) {
    return { badge: 'الدعم', helper: 'ابدأ بالعناصر الجديدة أو عالية الأولوية ثم فعّل الوصول عند الحاجة.' };
  }
  if (pathname.startsWith('/platform/observability')) {
    return { badge: 'المراقبة', helper: 'راجع صحة التشغيل أولًا، ثم افتح الحالات الخارجة عن الطبيعي.' };
  }
  if (pathname.startsWith('/platform/settings')) {
    return { badge: 'الإعدادات', helper: 'استخدمها للتعديل المدروس، وليس للمتابعة اليومية السريعة.' };
  }
  return { badge: 'لوحة المنصة', helper: 'ابدأ بما يحتاج تدخل الآن، ثم انتقل إلى السجل أو الدعم.' };
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
  const router = useRouter();
  const [search, setSearch] = useState('');
  const context = pageContext(pathname);

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = search.trim();
    const params = new URLSearchParams();
    if (term) {
      params.set('query', term);
    }
    router.push(`/platform/cafes${params.toString() ? `?${params.toString()}` : ''}`);
  }

  return (
    <main className="min-h-dvh bg-slate-100 text-slate-900" dir="rtl">
      <div className="mx-auto max-w-[1760px] px-4 py-5 lg:px-6">
        <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="space-y-5 rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm xl:sticky xl:top-4 xl:h-fit">
            <div className="rounded-3xl border border-indigo-100 bg-gradient-to-b from-indigo-600 to-indigo-500 px-5 py-5 text-white shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold tracking-[0.18em] text-indigo-100">منصة أهوا</div>
                  <div className="mt-2 text-2xl font-bold">لوحة السوبر أدمن</div>
                </div>
                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/90">
                  منصة الإدارة
                </span>
              </div>
              <div className="mt-5 rounded-2xl border border-white/15 bg-white/10 px-4 py-3">
                <div className="text-sm font-semibold">{session.displayName}</div>
                <div className="mt-1 text-xs text-indigo-100">{session.email}</div>
              </div>
            </div>

            {NAV_GROUPS.map((group) => (
              <div key={group.title} className="space-y-2.5">
                <div className="px-1 text-xs font-semibold text-slate-500">{group.title}</div>
                <div className="space-y-2">
                  {group.items.map((item) => {
                    const active = isActive(pathname, item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={[
                          'flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 transition',
                          active
                            ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm'
                            : 'border-slate-200 bg-slate-50 text-slate-800 hover:border-slate-300 hover:bg-white',
                        ].join(' ')}
                      >
                        <div>
                          <div className="text-sm font-semibold">{item.label}</div>
                          {item.helper ? (
                            <div className={active ? 'mt-1 text-xs text-indigo-100' : 'mt-1 text-xs text-slate-500'}>{item.helper}</div>
                          ) : null}
                        </div>
                        <span
                          className={active
                            ? 'mt-1 h-2.5 w-2.5 rounded-full bg-white'
                            : 'mt-1 h-2.5 w-2.5 rounded-full bg-slate-300'}
                        />
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold text-slate-500">جلسة الإدارة</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">{context.badge}</div>
              <p className="mt-2 text-xs leading-6 text-slate-500">{context.helper}</p>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-3">
              <PlatformLogoutButton />
            </div>
          </aside>

          <section className="min-w-0 space-y-5">
            <header className="rounded-[28px] border border-slate-200 bg-white px-5 py-4 shadow-sm">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <div className="inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                    {context.badge}
                  </div>
                  <h1 className="mt-3 text-2xl font-bold text-slate-900 lg:text-[30px]">{title}</h1>
                  <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-500">
                    {description ?? context.helper}
                  </p>
                </div>
                <div className="flex w-full flex-col gap-3 xl:w-auto xl:min-w-[480px]">
                  <form onSubmit={submitSearch} className="flex flex-col gap-2 sm:flex-row">
                    <label className="flex flex-1 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <span className="text-slate-400">⌕</span>
                      <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="ابحث باسم القهوة أو الـ slug"
                        className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                      />
                    </label>
                    <button
                      type="submit"
                      className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white"
                    >
                      فتح السجل
                    </button>
                  </form>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href="/platform/cafes/new"
                      className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
                    >
                      إنشاء قهوة
                    </Link>
                    <Link
                      href="/platform/support"
                      className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
                    >
                      فتح الدعم الفني
                    </Link>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500">
                      {session.email}
                    </div>
                  </div>
                </div>
              </div>
            </header>
            {children}
          </section>
        </div>
      </div>
    </main>
  );
}
