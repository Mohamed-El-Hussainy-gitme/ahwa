"use client";

import Link from "next/link";
import { MobileShell } from "@/ui/MobileShell";
import { useAuthz } from "@/lib/authz";
import { useSession } from "@/lib/session";
import { AccessDenied } from "@/ui/AccessState";
import { useOpsChrome } from "@/lib/ops/chrome";
import { OperationalHealthPanel } from "@/ui/ops/OperationalHealthPanel";

const cards = [
  { href: "/shift", title: "الوردية", icon: "🕒", description: "فتح وتقفيل الوردية وتوزيع الأدوار." },
  { href: "/customers", title: "دفتر الآجل", icon: "👥", description: "أرصدة الآجل والسداد والحركات." },
  { href: "/complaints", title: "الشكاوى", icon: "🛟", description: "متابعة الشكاوى وتنفيذ الإعادة أو الإسقاط." },
  { href: "/staff", title: "الموظفون", icon: "👤", description: "إضافة الموظفين وضبط الحالة والـ PIN." },
  { href: "/menu", title: "المنيو", icon: "📋", description: "الأقسام والأصناف والأسعار." },
  { href: "/reports", title: "التقارير", icon: "📊", description: "التقارير اليومية والأسبوعية والشهرية والسنوية." },
  { href: "/support?source=in_app&page=/owner", title: "الدعم", icon: "🧰", description: "إرسال بلاغ أو السماح بدخول دعم مؤقت." },
];

export default function OwnerPage() {
  const { can } = useAuthz();
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

      <div className="grid grid-cols-2 gap-2">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="rounded-2xl border border-neutral-200 bg-white px-4 py-4 text-right shadow-sm hover:bg-neutral-50"
          >
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
