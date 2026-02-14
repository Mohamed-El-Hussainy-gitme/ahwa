"use client";

import { useEffect, useMemo, useState } from "react";
import { MobileShell } from "@/ui/MobileShell";
import { memoryRepos } from "@/data/memory/repos";
import type { Invoice, Order, OrderItem, Payment, Product } from "@/domain/model";
import { useSession } from "@/lib/session";

type ShiftRow = {
  id: string;
  kind: "morning" | "evening";
  is_open: boolean;
  started_at: string;
  ended_at: string | null;
  supervisor_user_id: string | null;
};

type StaffRow = {
  id: string;
  name: string | null;
  display_name: string | null;
  login_name: string | null;
  base_role: string;
  is_active: boolean;
};

function fmtMoney(n: number) {
  return new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 0 }).format(n);
}

function kindLabel(k: "morning" | "evening") {
  return k === "morning" ? "صباحية" : "مسائية";
}

type RangeKey = "shifts" | "day" | "week" | "month" | "year";

function startOfDay(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfMonth(ts: number) {
  const d = new Date(ts);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfYear(ts: number) {
  const d = new Date(ts);
  d.setMonth(0, 1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export default function ReportsPage() {
  const repos = memoryRepos;
  const session = useSession();

  const [tab, setTab] = useState<RangeKey>("shifts");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);

  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoices, setInvoices] = useState<Record<string, Invoice>>({});

  const staffNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of staff) m.set(s.id, s.name ?? s.display_name ?? s.login_name ?? s.id);
    return m;
  }, [staff]);

  async function loadAll() {
    setBusy(true);
    setMsg(null);
    try {
      // 1) Supabase shifts + staff (server)
      const [s1, s2] = await Promise.all([
        fetch("/api/owner/shift/history", { cache: "no-store" }).then((r) => r.json().catch(() => null)),
        fetch("/api/owner/staff/list", { cache: "no-store" }).then((r) => r.json().catch(() => null)),
      ]);

      if (!s1?.ok) throw new Error(s1?.error ?? "SHIFT_HISTORY_FAILED");
      if (!s2?.ok) throw new Error(s2?.error ?? "STAFF_LIST_FAILED");

      setShifts((s1.shifts as ShiftRow[]) ?? []);
      setStaff((s2.staff as StaffRow[]) ?? []);

      // 2) Local (device) operational data
      const [ps, os] = await Promise.all([repos.products.list(), repos.orders.listAll()]);
      const its = (await Promise.all(os.map((o) => repos.items.listByOrder(o.id)))).flat();
      const pays = (await Promise.all(os.map((o) => repos.billing.listPayments(o.id)))).flat();
      const invEntries = await Promise.all(os.map(async (o) => [o.id, await repos.billing.getInvoice(o.id)] as const));
      const invMap: Record<string, Invoice> = {};
      for (const [oid, inv] of invEntries) invMap[oid] = inv;

      setProducts(ps);
      setOrders(os);
      setItems(its);
      setPayments(pays);
      setInvoices(invMap);
    } catch (e) {
      const t = e instanceof Error ? e.message : String(e);
      setMsg(t);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    // reports are for owner/partner only
    if (!session.user || session.user.baseRole !== "owner") return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.user?.id]);

  const range = useMemo(() => {
    const now = Date.now();
    if (tab === "day") return { from: startOfDay(now), to: now };
    if (tab === "week") return { from: startOfDay(now - 7 * 24 * 60 * 60 * 1000), to: now };
    if (tab === "month") return { from: startOfMonth(now), to: now };
    if (tab === "year") return { from: startOfYear(now), to: now };
    return null;
  }, [tab]);

  const shiftSummaries = useMemo(() => {
    const summaries = shifts.map((s) => {
      const os = orders.filter((o) => o.shiftId === s.id);
      const invs = os.map((o) => invoices[o.id]).filter(Boolean);
      const sales = invs.reduce((a, b) => a + (b?.total ?? 0), 0);
      const cash = os
        .flatMap((o) => payments.filter((p) => p.orderId === o.id))
        .reduce((a, b) => a + b.amount, 0);
      const credit = invs
        .filter((i) => i.status === "credit")
        .reduce((a, i) => a + Math.max((i.total ?? 0) - (i.paid ?? 0), 0), 0);
      return { shift: s, orderCount: os.length, sales, cash, credit };
    });

    const totals = summaries.reduce(
      (acc, x) => {
        acc.sales += x.sales;
        acc.cash += x.cash;
        acc.credit += x.credit;
        return acc;
      },
      { sales: 0, cash: 0, credit: 0 }
    );

    return { summaries, totals };
  }, [shifts, orders, payments, invoices]);

  const periodSummary = useMemo(() => {
    if (!range) return null;
    const { from, to } = range;

    const os = orders.filter((o) => o.createdAt >= from && o.createdAt <= to);
    const invs = os.map((o) => invoices[o.id]).filter(Boolean);
    const sales = invs.reduce((a, b) => a + (b?.total ?? 0), 0);

    const cash = payments.filter((p) => p.receivedAt >= from && p.receivedAt <= to).reduce((a, b) => a + b.amount, 0);

    // Credit has no dedicated timestamp in local invoice model.
    // We approximate using order createdAt (good enough for daily/weekly views).
    const credit = invs
      .filter((i) => i.status === "credit")
      .reduce((a, i) => a + Math.max((i.total ?? 0) - (i.paid ?? 0), 0), 0);

    // Top products by revenue
    const pById = new Map(products.map((p) => [p.id, p] as const));
    const agg = new Map<string, { name: string; qty: number; rev: number }>();
    for (const it of items) {
      const o = orders.find((x) => x.id === it.orderId);
      if (!o) continue;
      if (o.createdAt < from || o.createdAt > to) continue;
      if (it.status === "cancelled") continue;
      const prod = pById.get(it.productId);
      const row = agg.get(it.productId) ?? { name: prod?.name ?? it.productId, qty: 0, rev: 0 };
      row.qty += it.qty;
      row.rev += it.qty * it.unitPrice;
      agg.set(it.productId, row);
    }
    const top = Array.from(agg.values()).sort((a, b) => b.rev - a.rev).slice(0, 8);

    return { from, to, sales, cash, credit, orderCount: os.length, top };
  }, [range, orders, items, payments, invoices, products]);

  if (!session.user || session.user.baseRole !== "owner") {
    return (
      <MobileShell title="التقارير" backHref="/dashboard">
        <div className="rounded-2xl border bg-white p-4 text-right">
          <div className="font-semibold">هذه الصفحة للمعلم فقط.</div>
        </div>
      </MobileShell>
    );
  }

  return (
    <MobileShell title="التقارير" backHref="/owner">
      {msg ? (
        <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-right text-sm text-red-700">{msg}</div>
      ) : null}

      <div className="rounded-2xl border bg-white p-3">
        <div className="flex items-center justify-between">
          <div className="font-semibold">ملخص</div>
          <button
            onClick={loadAll}
            disabled={busy}
            className="rounded-xl border bg-white px-3 py-2 text-xs disabled:opacity-60"
          >
            {busy ? "..." : "تحديث"}
          </button>
        </div>

        <div className="mt-3 grid grid-cols-5 gap-2">
          {(
            [
              { k: "shifts" as const, t: "الورديات" },
              { k: "day" as const, t: "اليوم" },
              { k: "week" as const, t: "أسبوع" },
              { k: "month" as const, t: "شهر" },
              { k: "year" as const, t: "سنة" },
            ]
          ).map((x) => (
            <button
              key={x.k}
              onClick={() => setTab(x.k)}
              className={[
                "rounded-2xl border px-2 py-2 text-xs font-semibold",
                tab === x.k ? "bg-neutral-900 text-white border-neutral-900" : "bg-neutral-50",
              ].join(" ")}
            >
              {x.t}
            </button>
          ))}
        </div>
      </div>

      {tab === "shifts" ? (
        <div className="mt-3 rounded-2xl border bg-white p-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold">حساب الورديات</div>
            <div className="text-xs text-neutral-500">من بيانات الجهاز + الوردية من Supabase</div>
          </div>

          <div className="mt-2 space-y-2">
            {shiftSummaries.summaries.length === 0 ? (
              <div className="text-sm text-neutral-500 text-right">لا توجد ورديات بعد.</div>
            ) : (
              shiftSummaries.summaries.map((x) => {
                const sup = x.shift.supervisor_user_id ? staffNameById.get(x.shift.supervisor_user_id) : null;
                return (
                  <div key={x.shift.id} className="rounded-2xl border bg-neutral-50 p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-right">
                        <div className="text-sm font-semibold">
                          {kindLabel(x.shift.kind)} {x.shift.is_open ? "• مفتوحة" : ""}
                        </div>
                        <div className="mt-1 text-xs text-neutral-600">
                          بدأت {new Date(x.shift.started_at).toLocaleString("ar-EG")} {x.shift.ended_at ? `• انتهت ${new Date(x.shift.ended_at).toLocaleString("ar-EG")}` : ""}
                        </div>
                        {sup ? <div className="mt-1 text-xs text-neutral-600">مشرف: {sup}</div> : null}
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-xl bg-white px-3 py-2">
                          <div className="text-[11px] text-neutral-500">إجمالي</div>
                          <div className="text-sm font-bold">{fmtMoney(x.sales)}</div>
                        </div>
                        <div className="rounded-xl bg-white px-3 py-2">
                          <div className="text-[11px] text-neutral-500">كاش</div>
                          <div className="text-sm font-bold">{fmtMoney(x.cash)}</div>
                        </div>
                        <div className="rounded-xl bg-white px-3 py-2">
                          <div className="text-[11px] text-neutral-500">مديونية</div>
                          <div className="text-sm font-bold">{fmtMoney(x.credit)}</div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 text-right text-xs text-neutral-600">عدد الحسابات: {x.orderCount}</div>
                  </div>
                );
              })
            )}
          </div>

          <div className="mt-3 rounded-2xl border bg-white p-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold">الإجمالي النهائي</div>
              <div className="text-xs text-neutral-500">(إجمالي الورديات المعروضة)</div>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-neutral-50 px-3 py-3">
                <div className="text-xs text-neutral-500">إجمالي</div>
                <div className="text-lg font-bold">{fmtMoney(shiftSummaries.totals.sales)}</div>
              </div>
              <div className="rounded-xl bg-neutral-50 px-3 py-3">
                <div className="text-xs text-neutral-500">كاش</div>
                <div className="text-lg font-bold">{fmtMoney(shiftSummaries.totals.cash)}</div>
              </div>
              <div className="rounded-xl bg-neutral-50 px-3 py-3">
                <div className="text-xs text-neutral-500">مديونية</div>
                <div className="text-lg font-bold">{fmtMoney(shiftSummaries.totals.credit)}</div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-3 rounded-2xl border bg-white p-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold">تقرير {tab === "day" ? "اليوم" : tab === "week" ? "الأسبوع" : tab === "month" ? "الشهر" : "السنة"}</div>
            {periodSummary ? <div className="text-xs text-neutral-500">{new Date(periodSummary.from).toLocaleDateString("ar-EG")}</div> : null}
          </div>

          {periodSummary ? (
            <>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-neutral-50 px-3 py-3">
                  <div className="text-xs text-neutral-500">إجمالي</div>
                  <div className="text-lg font-bold">{fmtMoney(periodSummary.sales)}</div>
                </div>
                <div className="rounded-xl bg-neutral-50 px-3 py-3">
                  <div className="text-xs text-neutral-500">كاش</div>
                  <div className="text-lg font-bold">{fmtMoney(periodSummary.cash)}</div>
                </div>
                <div className="rounded-xl bg-neutral-50 px-3 py-3">
                  <div className="text-xs text-neutral-500">مديونية</div>
                  <div className="text-lg font-bold">{fmtMoney(periodSummary.credit)}</div>
                </div>
              </div>

              <div className="mt-3 rounded-2xl border bg-neutral-50 p-3">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">الأكثر مبيعاً</div>
                  <div className="text-xs text-neutral-500">(حسب الإيراد)</div>
                </div>
                {periodSummary.top.length === 0 ? (
                  <div className="mt-2 text-sm text-neutral-500 text-right">لا توجد مبيعات في هذه الفترة.</div>
                ) : (
                  <div className="mt-2 space-y-2">
                    {periodSummary.top.map((t) => (
                      <div key={t.name} className="flex items-center justify-between rounded-xl bg-white p-3">
                        <div className="text-right">
                          <div className="font-semibold">’{t.name}’</div>
                          <div className="mt-1 text-xs text-neutral-500">كمية: {t.qty}</div>
                        </div>
                        <div className="text-sm font-bold">{fmtMoney(t.rev)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="mt-2 text-right text-sm text-neutral-500">لا توجد بيانات.</div>
          )}
        </div>
      )}
    </MobileShell>
  );
}
