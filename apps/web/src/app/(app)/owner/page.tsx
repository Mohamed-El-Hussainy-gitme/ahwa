"use client";

import Link from "next/link";
import { MobileShell } from "@/ui/MobileShell";
import { useAuthz } from "@/lib/authz";
import { useSession } from "@/lib/session";
import { AccessDenied } from "@/ui/AccessState";
import { useOpsChrome } from "@/lib/ops/chrome";
import { OperationalHealthPanel } from "@/ui/ops/OperationalHealthPanel";
import { OwnerOnboardingGuideCard } from "@/ui/ops/OwnerOnboardingGuide";

const cards = [
  { href: '/shift', title: 'الوردية', icon: '🕒', description: 'فتح، تقفيل، وتوزيع الأدوار.' },
  { href: '/orders', title: 'الطلبات', icon: '🧾', description: 'التدخل في الطلبات والجلسات والتسليم.' },
  { href: '/kitchen', title: 'الباريستا', icon: '☕', description: 'مراجعة طابور المشروبات والأكل.' },
  { href: '/shisha', title: 'الشيشة', icon: '🔥', description: 'مراجعة طلبات قسم الشيشة والتسليم.' },
  { href: '/billing', title: 'الحساب', icon: '💵', description: 'تحصيل، ترحيل، ومتابعة الجاهز للحساب.' },
  { href: '/customers', title: 'دفتر الآجل', icon: '👥', description: 'أرصدة الآجل والسداد والحركات.' },
  { href: '/complaints', title: 'الشكاوى', icon: '🛟', description: 'متابعة الشكاوى وتنفيذ الإعادة أو الإسقاط.' },
  { href: '/staff', title: 'الموظفون', icon: '👤', description: 'إضافة الموظفين وضبط الحالة والـ PIN.' },
  { href: '/menu', title: 'المنيو', icon: '📋', description: 'الأقسام والأصناف والأسعار.' },
  { href: '/reports', title: 'التقارير', icon: '📊', description: 'اليومي والأسبوعي والشهري والسنوي.' },
  { href: '/support?source=in_app&page=/owner', title: 'الدعم', icon: '🧰', description: 'إرسال بلاغ أو السماح بدخول دعم مؤقت.' },
];

export default function OwnerPage() {
  const { can, shift } = useAuthz();
  const session = useSession();
  const { summary, sync, lastLoadedAt } = useOpsChrome();

  if (!can.owner) {
    return <AccessDenied title="المعلم" />;
  }

  return (
    <MobileShell
      title="المعلم"
      backHref="/dashboard"
      topRight={<div className="text-xs text-neutral-500">{session.user?.name}</div>}
    >
      <OperationalHealthPanel summary={summary} syncState={sync.state} lastLoadedAt={lastLoadedAt} className="mb-3" />
      <OwnerOnboardingGuideCard />

      <div className="mb-3 rounded-3xl border border-slate-200 bg-white p-4 text-right shadow-sm">
        <div className="text-lg font-bold text-slate-950">صلاحيات المعلم كاملة</div>
        <div className="mt-2 text-sm leading-6 text-slate-600">
          يمكنك رؤية كل الشاشات والتدخل في كل العمليات: الطلبات، المطبخ، الشيشة، الحساب، الآجل، الشكاوى، التقارير، والإدارة.
        </div>
      </div>

      {!shift ? (
        <div className="mb-3 rounded-2xl border border-amber-200/70 bg-amber-50 p-3 text-sm text-amber-900">
          لا توجد وردية مفتوحة الآن. ابدأ من شاشة الوردية ثم ارجع هنا إذا احتجت أي تدخل مباشر.
        </div>
      ) : (
        <div className="mb-3 rounded-2xl border border-emerald-200/70 bg-emerald-50 p-3 text-sm text-emerald-900">
          وردية مفتوحة الآن: <span className="font-semibold">{shift.kind === "morning" ? "صباحية" : "مسائية"}</span> — يمكنك الدخول لأي قسم والتدخل مباشرة.
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {cards.map((card) => (
          <Link key={card.href} href={card.href} className="rounded-2xl border border-neutral-200 bg-white px-4 py-4 text-right shadow-sm hover:bg-neutral-50">
            <div className="flex items-center justify-between">
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
