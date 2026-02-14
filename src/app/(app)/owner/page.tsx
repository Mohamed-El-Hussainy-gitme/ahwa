"use client";

import Link from "next/link";
import { MobileShell } from "@/ui/MobileShell";
import { useAuthz } from "@/lib/authz";
import { useSession } from "@/lib/session";

export default function OwnerPage() {
  const { can, shift } = useAuthz();
  const session = useSession();

  if (!can.owner) {
    return <MobileShell title="المعلم">غير مسموح</MobileShell>;
  }

  return (
    <MobileShell
      title="المعلم"
      topRight={<div className="text-xs text-neutral-500">{session.user?.name}</div>}
    >
      {!shift ? (
        <div className="rounded-2xl border border-amber-200/70 bg-amber-50 p-3 text-sm text-amber-900">
          لا توجد وردية مفتوحة. افتح وردية (صباحي/مسائي) من شاشة الوردية.
        </div>
      ) : (
        <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50 p-3 text-sm text-emerald-900">
          وردية مفتوحة: <span className="font-semibold">{shift.kind === "morning" ? "صباحي" : "مسائي"}</span>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link href="/shift" className="rounded-2xl border border-neutral-200 bg-white px-4 py-4 text-right shadow-sm hover:bg-neutral-50">
          <div className="flex items-center justify-between">
            <div className="font-semibold">الوردية</div>
            <div className="text-lg">🕒</div>
          </div>
          <div className="mt-1 text-xs text-neutral-500">فتح/تقفيل + توزيع أدوار</div>
        </Link>

        <Link href="/staff" className="rounded-2xl border border-neutral-200 bg-white px-4 py-4 text-right shadow-sm hover:bg-neutral-50">
          <div className="flex items-center justify-between">
            <div className="font-semibold">الموظفين</div>
            <div className="text-lg">👥</div>
          </div>
          <div className="mt-1 text-xs text-neutral-500">إضافة/شطب + شركاء</div>
        </Link>

        <Link href="/menu" className="rounded-2xl border border-neutral-200 bg-white px-4 py-4 text-right shadow-sm hover:bg-neutral-50">
          <div className="flex items-center justify-between">
            <div className="font-semibold">المنيو</div>
            <div className="text-lg">📋</div>
          </div>
          <div className="mt-1 text-xs text-neutral-500">الأصناف والأسعار</div>
        </Link>

        <Link href="/dashboard" className="rounded-2xl border border-neutral-200 bg-white px-4 py-4 text-right shadow-sm hover:bg-neutral-50">
          <div className="flex items-center justify-between">
            <div className="font-semibold">التقارير</div>
            <div className="text-lg">📊</div>
          </div>
          <div className="mt-1 text-xs text-neutral-500">أحداث + تحصيل</div>
        </Link>
      </div>

      <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-3 text-sm text-neutral-600 shadow-sm">
        <div className="font-semibold text-neutral-900">ملاحظات منطقية</div>
        <ul className="mt-2 list-disc space-y-1 pr-5">
          <li>توزيع الأدوار يتغير يوميًا لكل وردية، ويُحفظ تلقائيًا في سجلات الوردية.</li>
          <li>المشرف يستطيع الدفع/ترحيل المديونية، ويستطيع أيضًا أخذ الطلبات كويتر.</li>
          <li>الشريك/المعلم: صلاحية كاملة حتى لو لم يكن مُعيَّن بدور داخل الوردية.</li>
        </ul>
      </div>
    </MobileShell>
  );
}
