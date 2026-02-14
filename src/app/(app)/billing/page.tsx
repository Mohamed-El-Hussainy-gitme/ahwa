"use client";

import { useEffect, useMemo, useState } from "react";
import { MobileShell } from "@/ui/MobileShell";
import { memoryRepos } from "@/data/memory/repos";
import { addPayment, postOrderToCustomerCredit, splitOrderItems } from "@/usecases";
import { useAuthz } from "@/lib/authz";
import { useSession } from "@/lib/session";
import type { Customer, Invoice, Order, OrderItem, Payment, Product } from "@/domain/model";

function fmtMoney(n: number) {
  return new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 0 }).format(n);
}

export default function BillingPage() {
  const repos = memoryRepos;
  const { can } = useAuthz();
  const session = useSession();

  const [orders, setOrders] = useState<Order[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const [showPaid, setShowPaid] = useState(true);

  const [payAmount, setPayAmount] = useState<string>("");
  const [customerId, setCustomerId] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const customerNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of customers) m.set(c.id, c.name);
    return m;
  }, [customers]);

  const checkNoByOrderId = useMemo(() => {
    const map = new Map<string, number>();
    const groups = new Map<string, Order[]>();
    for (const o of orders) {
      const k = o.tableLabel ? `t:${o.tableLabel}` : `o:${o.id}`;
      const arr = groups.get(k) ?? [];
      arr.push(o);
      groups.set(k, arr);
    }
    for (const arr of groups.values()) {
      arr.sort((a, b) => a.createdAt - b.createdAt);
      arr.forEach((o, idx) => map.set(o.id, idx + 1));
    }
    return map;
  }, [orders]);

  const ordersByTable = useMemo(() => {
    const map = new Map<string, Order[]>();
    for (const o of orders) {
      const k = o.tableLabel?.trim() ? o.tableLabel.trim() : "__no_table__";
      const arr = map.get(k) ?? [];
      arr.push(o);
      map.set(k, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.createdAt - b.createdAt);
    const entries = Array.from(map.entries());
    entries.sort((a, b) => {
      if (a[0] === "__no_table__") return 1;
      if (b[0] === "__no_table__") return -1;
      const na = Number(a[0]);
      const nb = Number(b[0]);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return a[0].localeCompare(b[0], "ar");
    });
    return entries;
  }, [orders]);

  async function load() {
    const [os, ps, cs] = await Promise.all([
      showPaid ? repos.orders.listAll() : repos.orders.listOpen(),
      repos.products.list(),
      repos.customers.list(),
    ]);
    setOrders(os);
    setProducts(ps);
    setCustomers(cs);
    if (activeId && !os.find((o) => o.id === activeId)) {
      setActiveId(null);
    }
  }

  async function loadOrder(orderId: string) {
    const [its, inv, pays] = await Promise.all([
      repos.items.listByOrder(orderId),
      repos.billing.getInvoice(orderId),
      repos.billing.listPayments(orderId),
    ]);
    setItems(its);
    setInvoice(inv);
    setPayments(pays);
    const remaining = Math.max(inv.total - inv.paid, 0);
    setPayAmount(String(remaining || ""));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPaid]);

  useEffect(() => {
    if (!activeId) {
      setItems([]);
      setInvoice(null);
      setPayments([]);
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set());
    loadOrder(activeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const active = orders.find((o) => o.id === activeId) ?? null;

  const lines = useMemo(() => {
    // Exclude cancelled items (invoice also excludes them)
    return items
      .filter((it) => it.status !== "cancelled")
      .map((it) => {
        const p = products.find((x) => x.id === it.productId);
        const name = p?.name ?? it.productId;
        const total = it.qty * it.unitPrice;
        return { it, name, total };
      });
  }, [items, products]);

  const remaining = useMemo(() => {
    if (!invoice) return 0;
    return Math.max(invoice.total - invoice.paid, 0);
  }, [invoice]);

  const selectedTotal = useMemo(() => {
    let s = 0;
    for (const l of lines) {
      if (selectedIds.has(l.it.id)) s += l.total;
    }
    return s;
  }, [lines, selectedIds]);

  const selectedCount = useMemo(() => {
    let c = 0;
    for (const l of lines) if (selectedIds.has(l.it.id)) c++;
    return c;
  }, [lines, selectedIds]);

  function toggleItem(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(lines.map((l) => l.it.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function onPay() {
    if (!can.billing) {
      alert("الدفع للمشرف/المعلم فقط");
      return;
    }
    if (!session.user || !activeId) return;
    if (!invoice) return;
    if (invoice.status === "credit") {
      alert("هذا الطلب مُرحّل آجل. التحصيل يكون من شاشة المديونيات (دفعات الزبون).");
      return;
    }
    if (remaining <= 0) {
      alert("تم سداد هذا الطلب بالفعل.");
      return;
    }
    const a = Number(payAmount || "0");
    if (!isFinite(a) || a <= 0) return;
    if (a > remaining) {
      alert(`المبلغ أكبر من المتبقي (${fmtMoney(remaining)} ج).`);
      return;
    }

    setBusy(true);
    try {
      await addPayment(repos, { orderId: activeId, amount: a, receivedBy: session.user.id });
      await load();
      await loadOrder(activeId);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "حدث خطأ أثناء تسجيل الدفع";
      alert(msg);
    } finally {
      setBusy(false);
    }
  }

  async function onSplit(createAndPay: boolean) {
    if (!can.billing) {
      alert("التقسيم والدفع للمشرف/المعلم فقط");
      return;
    }
    if (!session.user || !activeId) return;
    if (selectedIds.size === 0) {
      alert("اختر الأصناف الخاصة بالشخص الذي سيدفع الآن.");
      return;
    }

    // ✅ منع تقسيم طلب عليه دفعات جزئية لأنه يفقد معنى "مين دفع على ايه"
    // الحل: إما تسوية المتبقي أولًا، أو تقسيم قبل أي دفعات.
    if (invoice && invoice.paid > 0) {
      alert("لا يمكن تقسيم طلب عليه دفعات مسجلة بالفعل. قسم الحساب أولاً ثم ابدأ الدفع.");
      return;
    }

    setBusy(true);
    try {
      const dst = await splitOrderItems(repos, {
        orderId: activeId,
        itemIds: Array.from(selectedIds),
        createdBy: session.user.id,
      });

      await load();
      setActiveId(dst.id);

      if (createAndPay) {
        const inv = await repos.billing.getInvoice(dst.id);
        const rem = Math.max(inv.total - inv.paid, 0);
        if (rem > 0) {
          await addPayment(repos, { orderId: dst.id, amount: rem, receivedBy: session.user.id });
        }
        await load();
        await loadOrder(dst.id);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "حدث خطأ أثناء التقسيم";
      alert(msg);
    } finally {
      setBusy(false);
      clearSelection();
    }
  }

  async function onPostToCredit() {
    if (!can.billing) {
      alert("ترحيل الآجل للمشرف/المعلم فقط");
      return;
    }
    if (!session.user || !activeId) return;
    if (!customerId) return;
    setBusy(true);
    try {
      await postOrderToCustomerCredit(repos, {
        orderId: activeId,
        customerId,
        note: note || undefined,
        actorUserId: session.user.id,
      });
      setNote("");
      setCustomerId("");
      await load();
      setActiveId(null);
    } finally {
      setBusy(false);
    }
  }

  const activeTitle = useMemo(() => {
    if (!active) return "";
    const checkNo = checkNoByOrderId.get(active.id) ?? 1;
    const who = active.customerId ? customerNameById.get(active.customerId) : null;
    const whoTxt = who ? ` (${who})` : "";
    return active.tableLabel ? `ترابيزة ${active.tableLabel} • حساب ${checkNo}${whoTxt}` : `تفاصيل الطلب`;
  }, [active, checkNoByOrderId, customerNameById]);

  return (
    <MobileShell title="الحساب" topRight={<div className="text-xs text-neutral-500">{session.user?.name}</div>}>
      {!can.billing ? (
        <div className="rounded-xl border bg-red-50 p-3 text-sm text-red-900">هذه الشاشة للمشرف/المعلم.</div>
      ) : null}

      <div className="rounded-2xl border p-3">
        <div className="flex items-center justify-between">
          <div className="font-semibold">طلبات الترابيز</div>
          <button
            onClick={() => setShowPaid((v) => !v)}
            className="rounded-xl border bg-white px-3 py-2 text-sm"
            title="إظهار/إخفاء الحسابات المدفوعة"
          >
            {showPaid ? "إخفاء المدفوع" : "إظهار المدفوع"}
          </button>
        </div>

        {orders.length === 0 ? (
          <div className="mt-2 text-sm text-neutral-500">لا يوجد طلبات.</div>
        ) : (
          <div className="mt-3 space-y-3">
            {ordersByTable.map(([table, list]) => {
              const header = table === "__no_table__" ? "بدون ترابيزة" : `ترابيزة ${table}`;
              return (
                <div key={table} className="rounded-xl bg-neutral-50 p-2">
                  <div className="mb-2 text-sm font-semibold text-neutral-800">{header}</div>
                  <div className="flex flex-wrap gap-2">
                    {list.map((o) => {
                      const checkNo = checkNoByOrderId.get(o.id) ?? 1;
                      const who = o.customerId ? customerNameById.get(o.customerId) : null;
                      const whoTxt = who ? ` • ${who}` : "";
                      const label = o.tableLabel ? `حساب ${checkNo}${whoTxt}` : `طلب ${o.id.slice(0, 4)}`;
                      const isClosed = o.status === "closed";
                      return (
                        <button
                          key={o.id}
                          onClick={() => setActiveId(o.id)}
                          className={[
                            "rounded-full border px-3 py-2 text-sm",
                            activeId === o.id ? "bg-black text-white" : "bg-white",
                          ].join(" ")}
                        >
                          <span className="inline-flex items-center gap-2">
                            <span>{label}</span>
                            {isClosed ? <span className={activeId === o.id ? "" : "text-emerald-700"}>✓</span> : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {activeId && invoice ? (
        <div className="mt-3 space-y-3">
          <div className="rounded-2xl border p-3">
            <div className="flex items-center justify-between">
              <div className="text-right">
                <div className="font-semibold">{activeTitle}</div>
                <div className="text-xs text-neutral-500">
                  {new Date(active?.createdAt ?? Date.now()).toLocaleString("ar-EG")}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-neutral-500">المتبقي</div>
                <div className="text-lg font-semibold">{fmtMoney(remaining)} ج</div>
              </div>
            </div>

            {/* Items with selection */}
            <div className="mt-3 flex items-center justify-between">
              <div className="text-sm text-neutral-600">اختر أصناف الشخص الذي سيدفع الآن</div>
              <div className="flex gap-2">
                <button onClick={selectAll} className="rounded-full border bg-white px-3 py-1.5 text-xs">
                  تحديد الكل
                </button>
                <button onClick={clearSelection} className="rounded-full border bg-white px-3 py-1.5 text-xs">
                  مسح
                </button>
              </div>
            </div>

            <div className="mt-2 divide-y">
              {lines.map((l) => {
                const checked = selectedIds.has(l.it.id);
                return (
                  <button
                    key={l.it.id}
                    onClick={() => toggleItem(l.it.id)}
                    className="flex w-full items-center justify-between py-2 text-right"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        readOnly
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleItem(l.it.id);
                        }}
                        className="h-5 w-5"
                      />
                      <div className="text-sm text-neutral-600">{fmtMoney(l.total)} ج</div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{l.name}</div>
                      <div className="text-xs text-neutral-500">×{l.it.qty}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-neutral-50 p-3 text-right">
                <div className="text-xs text-neutral-500">الإجمالي</div>
                <div className="font-semibold">{fmtMoney(invoice.total)} ج</div>
              </div>
              <div className="rounded-xl bg-neutral-50 p-3 text-right">
                <div className="text-xs text-neutral-500">مدفوع</div>
                <div className="font-semibold">{fmtMoney(invoice.paid)} ج</div>
              </div>
              <div className="rounded-xl bg-neutral-50 p-3 text-right">
                <div className="text-xs text-neutral-500">حالة</div>
                <div className="font-semibold">{invoice.status}</div>
              </div>
            </div>

            {/* Split actions */}
            <div className="mt-3 rounded-xl border bg-white p-3">
              <div className="flex items-center justify-between">
                <div className="font-semibold">تقسيم الحساب (للدفع الفردي)</div>
                <div className="text-xs text-neutral-500">
                  {selectedCount > 0 ? `محدد: ${selectedCount} • ${fmtMoney(selectedTotal)} ج` : "لا يوجد تحديد"}
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  onClick={() => onSplit(false)}
                  disabled={busy || selectedCount === 0 || !can.billing || invoice.paid > 0}
                  className="rounded-xl border bg-white px-4 py-3 text-sm font-semibold disabled:opacity-60"
                >
                  إنشاء حساب من المحدد
                </button>
                <button
                  onClick={() => onSplit(true)}
                  disabled={busy || selectedCount === 0 || !can.billing || invoice.paid > 0}
                  className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  دفع المحدد
                </button>
              </div>
              {invoice.paid > 0 ? (
                <div className="mt-2 text-xs text-amber-700">
                  ملاحظة: تم تسجيل دفعات على هذا الطلب؛ لا يمكن تقسيمه الآن. قسم الحساب قبل الدفع لتعرف "مين حاسب على ايه".
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border p-3">
            <div className="font-semibold">دفع كاش (يدوي)</div>
            <div className="mt-2 grid grid-cols-1 gap-2">
              <input
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                inputMode="numeric"
                className="w-full rounded-xl border px-3 py-3 text-right"
                placeholder="المبلغ"
              />
              <button
                onClick={onPay}
                disabled={busy || remaining <= 0 || invoice.status !== "open"}
                className="w-full rounded-xl bg-black px-4 py-4 font-semibold text-white disabled:opacity-60"
              >
                {busy ? "..." : remaining <= 0 ? "تم السداد" : invoice.status !== "open" ? "غير متاح" : "تسجيل دفع"}
              </button>
              <div className="text-xs text-neutral-500">
                الأفضل لتتبع "مين حاسب على ايه": استخدم تقسيم الحساب بالأصناف، ثم ادفع.
              </div>
            </div>
          </div>

          <div className="rounded-2xl border p-3">
            <div className="font-semibold">ترحيل آجل على زبون</div>
            <div className="mt-2 space-y-2">
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="w-full rounded-xl border px-3 py-3 text-right"
              >
                <option value="">اختر زبون...</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full rounded-xl border px-3 py-3 text-right"
                placeholder="ملاحظة (اختياري)"
              />
              <button
                onClick={onPostToCredit}
                disabled={busy || !customerId}
                className="w-full rounded-xl bg-amber-200 px-4 py-4 font-semibold text-neutral-950 disabled:opacity-60"
              >
                {busy ? "..." : `ترحيل المتبقي (${fmtMoney(remaining)} ج)`}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border p-3">
            <div className="font-semibold">سجل الدفع</div>
            {payments.length === 0 ? (
              <div className="mt-2 text-sm text-neutral-500">لا يوجد دفعات.</div>
            ) : (
              <div className="mt-2 divide-y">
                {payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-2">
                    <div className="text-sm text-neutral-600">{fmtMoney(p.amount)} ج</div>
                    <div className="text-right">
                      <div className="text-xs text-neutral-500">{new Date(p.receivedAt).toLocaleString("ar-EG")}</div>
                      <div className="text-xs text-neutral-500">{p.receivedBy}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </MobileShell>
  );
}
