'use client';

import Link from 'next/link';
import { MobileShell } from '@/ui/MobileShell';
import { useAuthz } from '@/lib/authz';
import { useSession } from '@/lib/session';
import { AccessDenied } from '@/ui/AccessState';
import { AppIcon } from '@/ui/icons/AppIcon';

const cards = [
  { href: '/shift', title: 'الوردية', icon: 'clock', description: 'فتح وتقفيل الوردية وتوزيع الأدوار على الفريق.' },
  { href: '/customers', title: 'دفتر الآجل', icon: 'users', description: 'الأرصدة، السداد، وحركة العملاء اليومية.' },
  { href: '/complaints', title: 'الشكاوى', icon: 'lifebuoy', description: 'المعالجة والإعادة ومراجعة مستوى الخدمة.' },
  { href: '/staff', title: 'فريق العمل', icon: 'crown', description: 'البيانات، الحالة، والصلاحيات التشغيلية.' },
  { href: '/menu', title: 'المنيو', icon: 'menu', description: 'الأقسام والأصناف والأسعار داخل القهوة.' },
  { href: '/reports', title: 'التقارير', icon: 'chart', description: 'تقارير يومية وأسبوعية وشهرية للإدارة.' },
  { href: '/qr-ordering', title: 'QR الطلب', icon: 'menu', description: 'طباعة QR خاص بالمقهى لفتح المنيو والطلب الذاتي.' },
  { href: '/support?source=in_app&page=/owner', title: 'الدعم', icon: 'support', description: 'بلاغ مباشر أو وصول مؤقت للدعم الفني.' },
] as const;

export default function OwnerPage() {
  const { can } = useAuthz();
  const session = useSession();

  if (!can.owner && !can.branchManager) {
    return <AccessDenied title={can.branchManager ? 'إدارة الفرع' : 'الإدارة'} />;
  }

  return (
    <MobileShell
      title={can.branchManager ? 'إدارة الفرع' : 'الإدارة'}
      backHref="/dashboard"
      topRight={<div className="rounded-2xl border border-[#dccdbb] bg-white px-3 py-2 text-xs font-semibold text-[#6b5a4c] shadow-sm">{session.user?.name}</div>}
    >
      <section className="space-y-4">
        <div className="rounded-[28px] border border-[#dccdbb] bg-[linear-gradient(180deg,#fff9f2_0%,#f6ecdf_100%)] p-5 shadow-[0_18px_40px_rgba(30,23,18,0.08)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold tracking-[0.24em] text-[#9b6b2e]">{can.branchManager ? 'إدارة الفرع' : 'لوحة الإدارة'}</div>
              <h1 className="mt-2 text-[26px] font-black leading-tight text-[#1e1712]">{can.branchManager ? 'مساحة الفرع' : 'مساحة الإدارة'}</h1>
              <p className="mt-2 text-sm leading-7 text-[#6b5a4c]">
                وصول مركزي لفريق العمل، المنيو، الورديات، والتقارير ضمن واجهة أوضح وأهدأ بصريًا.
              </p>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border border-[#ead5b8] bg-white/80 text-[#9b6b2e] shadow-sm">
              <AppIcon name="crown" className="h-5 w-5" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {cards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="group rounded-[24px] border border-[#dccdbb] bg-[#fffaf4] px-4 py-4 text-right shadow-sm transition duration-150 hover:-translate-y-0.5 hover:bg-[#f8efe3]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-[18px] bg-[#f6ede2] text-[#9b6b2e]">
                  <AppIcon name={card.icon} className="h-5 w-5" />
                </div>
                <AppIcon name="chevronRight" className="mt-1 h-4 w-4 text-[#9b6b2e] transition group-hover:-translate-x-0.5" />
              </div>
              <div className="mt-4 font-bold text-[#1e1712]">{card.title}</div>
              <div className="mt-2 text-xs leading-6 text-[#6b5a4c]">{card.description}</div>
            </Link>
          ))}
        </div>
      </section>
    </MobileShell>
  );
}
