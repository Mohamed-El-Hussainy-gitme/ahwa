'use client';

import Link from 'next/link';
import { MobileShell } from '@/ui/MobileShell';
import { useAuthz } from '@/lib/authz';
import { useSession } from '@/lib/session';
import { AccessDenied } from '@/ui/AccessState';

const cards = [
  { href: '/shift', title: 'الوردية', icon: '🕒', description: 'فتح وتقفيل وتوزيع الأدوار.' },
  { href: '/customers', title: 'دفتر الآجل', icon: '👥', description: 'الأرصدة والسداد والحركات.' },
  { href: '/complaints', title: 'الشكاوى', icon: '🛟', description: 'المتابعة والإعادة أو الإسقاط.' },
  { href: '/staff', title: 'الموظفون', icon: '👤', description: 'البيانات والحالة والـ PIN.' },
  { href: '/menu', title: 'المنيو', icon: '📋', description: 'الأقسام والأصناف والأسعار.' },
  { href: '/reports', title: 'التقارير', icon: '📊', description: 'اليومي والأسبوعي والشهري.' },
  { href: '/support?source=in_app&page=/owner', title: 'الدعم', icon: '🧰', description: 'بلاغ أو دخول دعم مؤقت.' },
];

export default function OwnerPage() {
  const { can } = useAuthz();
  const session = useSession();

  if (!can.owner) {
    return <AccessDenied title="المعلم" />;
  }

  return (
    <MobileShell
      title="إدارة القهوة"
      backHref="/dashboard"
      topRight={<div className="text-xs text-neutral-500">{session.user?.name}</div>}
    >
      <div className="grid grid-cols-2 gap-2">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="rounded-2xl border border-neutral-200 bg-white px-4 py-4 text-right shadow-sm hover:bg-neutral-50"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="font-semibold">{card.title}</div>
              <div className="text-lg">{card.icon}</div>
            </div>
            <div className="mt-1 text-xs text-neutral-500">{card.description}</div>
          </Link>
        ))}
      </div>
    </MobileShell>
  );
}
