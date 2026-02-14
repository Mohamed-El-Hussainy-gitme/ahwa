"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MobileShell } from "@/ui/MobileShell";
import { memoryRepos } from "@/data/memory/repos";
import { useAuthz } from "@/lib/authz";
import { useSession } from "@/lib/session";
import type { ActivityEvent, OrderItem, ShiftRole } from "@/domain/model";

function fmtMoney(n: number) {
  return new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 0 }).format(n);
}

function sameDay(a: number, b: number) {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

function shiftKindLabel(kind: "morning" | "evening") {
  return kind === "morning" ? "صباحي" : "مسائي";
}

function shiftRoleLabel(r: ShiftRole) {
  switch (r) {
    case "supervisor":
      return "مشرف";
    case "waiter":
      return "ويتر";
    case "barista":
      return "باريستا";
    case "shisha":
      return "شيشة";
  }
}

function eventLabel(e: ActivityEvent) {
  switch (e.type) {
    case "shift.opened":
      return "فتح وردية";
    case "shift.closed":
      return "تقفيل وردية";
    case "order.created":
      return "فتح طلب";
    case "order.item_added":
      return "إضافة صنف";
    case "order.items_sent":
      return "إرسال للمطبخ";
    case "item.status_changed":
      return "تحديث حالة";
    case "payment.added":
      return "تحصيل كاش";
    case "invoice.posted_to_credit":
      return "ترحيل مديونية";
    case "ledger.charge":
      return "مديونية +";
    case "ledger.payment":
      return "سداد مديونية";
    case "customer.created":
      return "إضافة زبون";
    case "return.recorded":
      return "استرجاع";
    case "product.created":
      return "صنف جديد";
    case "product.updated":
      return "تعديل صنف";
    case "product.archived":
      return "شطب صنف";
    case "staff.created":
      return "إضافة موظف";
    case "staff.updated":
      return "تعديل موظف";
    case "staff.archived":
      return "شطب موظف";
    case "invoice.discount_applied":
      return "خصم";
    default:
      return e.type;
  }
}

function getEventMoney(e: ActivityEvent) {
  const v = e.payload?.amount;
  if (typeof v === "number") return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function StatPill({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-[11px] font-semibold text-slate-600">{label}</div>
      <div className="mt-1 text-lg font-bold text-slate-900">{value}</div>
      {hint ? <div className="mt-1 text-[11px] text-slate-500">{hint}</div> : null}
    </div>
  );
}

function ActionCard({
  href,
  title,
  subtitle,
  icon,
}: {
  href: string;
  title: string;
  subtitle: string;
  icon: string;
}) {
  return (
    <Link
      href={href}
      className={[
        "rounded-3xl border border-slate-200 bg-white p-4 shadow-sm",
        "active:scale-[0.99] transition",
      ].join(" ")}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-base font-bold text-slate-900">{title}</div>
          <div className="mt-1 text-xs text-slate-600">{subtitle}</div>
        </div>
        <div className="text-2xl leading-none">{icon}</div>
      </div>
    </Link>
  );
}

export default function DashboardPage() {
  const repos = memoryRepos;
  const session = useSession();
  const { user, shift, effectiveRole, can } = useAuthz();

  const [openOrders, setOpenOrders] = useState<number>(0);
  const [baristaQ, setBaristaQ] = useState<OrderItem[]>([]);
  const [shishaQ, setShishaQ] = useState<OrderItem[]>([]);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const [os, bq, sq, ev] = await Promise.all([
      repos.orders.listOpen(),
      repos.items.listByRole("barista"),
      repos.items.listByRole("shisha"),
      repos.events.listRecent(),
    ]);

    setOpenOrders(os.length);
    setBaristaQ(bq);
    setShishaQ(sq);
    setEvents(ev);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const metrics = useMemo(() => {
    const now = Date.now();

    const cashToday = events
      .filter((e) => e.type === "payment.added" && sameDay(e.at, now))
      .reduce((s, e) => s + getEventMoney(e), 0);

    const creditToday = events
      .filter((e) => (e.type === "ledger.charge" || e.type === "invoice.posted_to_credit") && sameDay(e.at, now))
      .reduce((s, e) => s + getEventMoney(e), 0);

    const returnsToday = events.filter((e) => e.type === "return.recorded" && sameDay(e.at, now)).length;

    return {
      cashToday,
      creditToday,
      returnsToday,
      kitchenPending: baristaQ.length + shishaQ.length,
      lastEvents: events.slice(0, 3),
    };
  }, [events, baristaQ.length, shishaQ.length]);

  const roleChip = useMemo(() => {
    if (!user) return null;
    if (user.baseRole === "owner") {
      return (
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700">معلم/شريك</span>
          <select
            value={session.ownerViewRole}
            onChange={(e) => session.setOwnerViewRole(e.target.value as ShiftRole)}
            className="rounded-xl border border-slate-200 bg-white px-2 py-1 text-[11px]"
            aria-label="عرض بصلاحيات"
          >
            <option value="supervisor">عرض: مشرف</option>
            <option value="waiter">عرض: ويتر</option>
            <option value="barista">عرض: باريستا</option>
            <option value="shisha">عرض: شيشة</option>
          </select>
        </div>
      );
    }

    return (
      <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700">
        {effectiveRole ? shiftRoleLabel(effectiveRole) : "موظف"}
      </span>
    );
  }, [user, effectiveRole, session]);

  const topRight = (
    <div className="flex items-center gap-2">
      {roleChip}
      <div className="text-[11px] text-slate-500">{session.user?.name ?? ""}</div>
    </div>
  );

  const workActions = useMemo(() => {
    if (!can.kitchen) return [];
    if (can.owner) {
      return [
        { href: "/kitchen", title: "المطبخ", subtitle: "طلبات الباريستا", icon: "☕" },
        { href: "/shisha", title: "الشيشة", subtitle: "طلبات الشيشة + حجر", icon: "🔥" },
      ];
    }
    if (effectiveRole === "shisha") {
      return [{ href: "/shisha", title: "الشيشة", subtitle: "طلبات الشيشة + حجر", icon: "🔥" }];
    }
    return [{ href: "/kitchen", title: "المطبخ", subtitle: "طلبات الباريستا", icon: "☕" }];
  }, [can.kitchen, can.owner, effectiveRole]);


  const actions = [
    { href: "/orders", title: "الطلبات", subtitle: "فتح طلب + إضافة أصناف", icon: "🧾", show: can.takeOrders },
    ...workActions.map((x) => ({ ...x, show: true })),
    { href: "/billing", title: "الحساب", subtitle: "تحصيل كاش + خصم", icon: "💵", show: can.billing },
    { href: "/owner", title: "لوحة المعلم", subtitle: "الوردية/الموظفين/المنيو", icon: "👑", show: can.owner },
  ].filter((a) => a.show);


  return (
    <MobileShell title="الرئيسية" topRight={topRight}>
      {/* Shift status */}
      {!shift ? (
        <div className="rounded-2xl border border-amber-200/70 bg-amber-50 p-3 text-sm text-amber-900">
          لا توجد وردية مفتوحة الآن.
          {can.owner ? (
            <div className="mt-2">
              <Link href="/shift" className="inline-flex items-center justify-center rounded-xl bg-amber-600 px-3 py-2 text-xs font-semibold text-white">
                فتح وردية
              </Link>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-200/70 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-amber-950">وردية {shiftKindLabel(shift.kind)}</div>
            <div className="text-xs text-amber-900/70">مفتوحة</div>
          </div>
          <div className="mt-1 text-[11px] text-amber-900/70">
            المشرف داخل الوردية يتحصل كاش ويسجل أسباب الاسترجاع.
          </div>
        </div>
      )}

      {/* Primary actions */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {actions.map((a) => (
          <ActionCard key={a.href} href={a.href} title={a.title} subtitle={a.subtitle} icon={a.icon} />
        ))}
      </div>

      {/* KPIs */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <StatPill label="طلبات مفتوحة" value={loading ? "..." : String(openOrders)} hint="قيد التشغيل" />
        <StatPill
          label="طلبات للمطبخ"
          value={loading ? "..." : String(metrics.kitchenPending)}
          hint={`باريستا ${baristaQ.length} • شيشة ${shishaQ.length}`}
        />
        <StatPill label="تحصيل اليوم" value={loading ? "..." : `${fmtMoney(metrics.cashToday)} ج`} hint="من عمليات الدفع" />
        <StatPill label="مديونيات اليوم" value={loading ? "..." : `${fmtMoney(metrics.creditToday)} ج`} hint="ترحيل/دفتر" />
      </div>

      {/* Recent activity */}
      <div className="mt-4 rounded-3xl border border-amber-200/70 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="text-sm font-bold text-amber-950">آخر الأحداث</div>
          <button
            onClick={() => void load()}
            className="rounded-xl border border-amber-200/70 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-900"
          >
            تحديث
          </button>
        </div>

        {metrics.lastEvents.length === 0 ? (
          <div className="mt-3 text-sm text-amber-900/70">لا توجد أحداث بعد.</div>
        ) : (
          <div className="mt-3 space-y-2">
            {metrics.lastEvents.map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between rounded-2xl border border-amber-200/70 bg-amber-50 px-3 py-3"
              >
                <div className="text-sm font-semibold text-amber-950">{eventLabel(e)}</div>
                <div className="text-[11px] text-amber-900/70">{new Date(e.at).toLocaleTimeString("ar-EG")}</div>
              </div>
            ))}
          </div>
        )}

        {metrics.returnsToday > 0 ? (
          <div className="mt-3 rounded-2xl border border-amber-200/70 bg-white p-3 text-sm text-amber-950">
            <span className="font-semibold">استرجاع اليوم:</span> {metrics.returnsToday}
          </div>
        ) : null}
      </div>

      {/* تم حذف النصوص الإرشادية الطويلة لتقليل الزحمة على شاشة الموبايل */}
    </MobileShell>
  );
}
