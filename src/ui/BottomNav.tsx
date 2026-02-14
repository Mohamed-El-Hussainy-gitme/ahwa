"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthz } from "@/lib/authz";

export function BottomNav() {
  const pathname = usePathname();
  const { can, effectiveRole } = useAuthz();

  const kitchenTab = (() => {
    if (!can.kitchen) return null;
    // فصل عملي: الباريستا يدخل /kitchen، والشيشة تدخل /shisha.
    if (effectiveRole === "shisha" && !can.owner) {
      return { href: "/shisha", label: "شيشة", icon: "🔥", show: true };
    }
    // المعلم/المشرف يدخل /kitchen ويمكنه التبديل داخليًا لو احتاج.
    return { href: "/kitchen", label: "مطبخ", icon: "☕", show: true };
  })();

  const tabs = [
    { href: "/dashboard", label: "الرئيسية", icon: "🏠", show: true },
    { href: "/orders", label: "طلبات", icon: "🧾", show: can.takeOrders },
    kitchenTab ?? { href: "/kitchen", label: "مطبخ", icon: "☕", show: false },
    { href: "/billing", label: "حساب", icon: "💵", show: can.billing },
    { href: "/owner", label: "إدارة", icon: "👑", show: can.owner },
  ].filter((t) => t.show);

  const cols = tabs.length <= 3 ? "grid-cols-3" : tabs.length === 4 ? "grid-cols-4" : "grid-cols-5";

  return (
    <nav className={["grid gap-1", cols].join(" ")} aria-label="تنقل سريع">
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={[
              "rounded-2xl px-2 py-2 text-center transition",
              "border border-slate-200",
              active
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-slate-50 text-slate-900 hover:bg-slate-100",
            ].join(" ")}
          >
            <div className="text-base leading-none">{t.icon}</div>
            <div className="mt-1 text-[11px] font-semibold leading-none">{t.label}</div>
          </Link>
        );
      })}
    </nav>
  );
}
