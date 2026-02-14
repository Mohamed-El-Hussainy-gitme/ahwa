"use client";

import { useEffect, useMemo, useState } from "react";
import { MobileShell } from "@/ui/MobileShell";
import { memoryRepos } from "@/data/memory/repos";
import { addItem, createOrder, sendItems, setItemStatus } from "@/usecases";
import { useAuthz } from "@/lib/authz";
import { useSession } from "@/lib/session";
import type { Order, OrderItem, Product, ShiftRole } from "@/domain/model";

type Draft = Record<string, number>; // productId -> qty

function statusLabel(s: OrderItem["status"]) {
  if (s === "new") return "جديد";
  if (s === "sent") return "تم الإرسال";
  if (s === "in_progress") return "قيد التحضير";
  if (s === "ready") return "جاهز";
  if (s === "served") return "اتسلم";
  if (s === "cancelled") return "ملغي";
  return s;
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 0 }).format(n);
}

// roleLabel كانت مستخدمة في نسخة قديمة؛ تم حذفها لأن الصفحة لا تحتاجها.

export default function OrdersPage() {
  const repos = memoryRepos;
  const { can, shift } = useAuthz();
  const session = useSession();

  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);

  const [category, setCategory] = useState<Product["category"]>("hot");
  const [query, setQuery] = useState("");
  const [tableLabel, setTableLabel] = useState("");
  const [draft, setDraft] = useState<Draft>({});
  const [busy, setBusy] = useState(false);

  async function load() {
    const [ps, os] = await Promise.all([repos.products.list(), repos.orders.listOpen()]);
    const its = (await Promise.all(os.map((o) => repos.items.listByOrder(o.id)))).flat();
    setProducts(ps);
    setOrders(os);
    setItems(its);
    if (activeOrderId && !os.find((o) => o.id === activeOrderId)) {
      setActiveOrderId(null);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredProducts = useMemo(() => {
    const q = query.trim();
    const base = products.filter((p) => p.category === category);
    if (!q) return base;
    const qq = q.toLowerCase();
    return base.filter((p) => p.name.toLowerCase().includes(qq));
  }, [products, category, query]);

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

    // Sort tables numerically when possible
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

  const activeOrderItems = useMemo(() => {
    if (!activeOrderId) return [] as OrderItem[];
    return items
      .filter((i) => i.orderId === activeOrderId)
      .sort((a, b) => a.createdAt - b.createdAt);
  }, [items, activeOrderId]);

  const readyToServe = useMemo(() => {
    // الويتر محتاج قائمة جاهز للتسليم (بدون دخول المطبخ)
    return items
      .filter((i) => i.status === "ready")
      .sort((a, b) => a.createdAt - b.createdAt);
  }, [items]);

  const draftLines = useMemo(() => {
    const lines: Array<{ p: Product; qty: number; lineTotal: number }> = [];
    for (const [pid, qty] of Object.entries(draft)) {
      const p = products.find((x) => x.id === pid);
      if (!p || qty <= 0) continue;
      lines.push({ p, qty, lineTotal: qty * p.price });
    }
    return lines;
  }, [draft, products]);

  const draftTotal = useMemo(() => draftLines.reduce((s, l) => s + l.lineTotal, 0), [draftLines]);

  function addToDraft(pid: string) {
    setDraft((d) => ({ ...d, [pid]: (d[pid] ?? 0) + 1 }));
  }

  function decDraft(pid: string) {
    setDraft((d) => {
      const next = { ...d };
      const q = (next[pid] ?? 0) - 1;
      if (q <= 0) delete next[pid];
      else next[pid] = q;
      return next;
    });
  }

  function clearDraft() {
    setDraft({});
  }

  async function onSend() {
    if (!can.takeOrders) {
      alert("غير مسموح");
      return;
    }
    if (!session.user) return;
    if (!shift?.id) {
      alert("لا يوجد وردية مفتوحة الآن. افتح وردية أولاً.");
      return;
    }
    if (draftLines.length === 0) return;

    setBusy(true);
    try {
      let orderId = activeOrderId;
      if (!orderId) {
        const o = await createOrder(repos, {
          createdBy: session.user.id,
          shiftId: shift.id,
          tableLabel: tableLabel.trim() || undefined,
        });
        orderId = o.id;
        setActiveOrderId(o.id);
        setTableLabel("");
      }

      const ids: string[] = [];
      for (const line of draftLines) {
        const it = await addItem(repos, {
          orderId,
          productId: line.p.id,
          qty: line.qty,
          unitPrice: line.p.price,
          assignedTo: line.p.targetRole,
          notes: undefined,
          actorUserId: session.user.id,
        });
        ids.push(it.id);
      }
      await sendItems(repos, { orderId, itemIds: ids, actorUserId: session.user.id });

      clearDraft();
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function onCancelOrder(orderId: string) {
    if (!session.user) return;
    const ok = confirm("إلغاء الطلب؟");
    if (!ok) return;
    setBusy(true);
    try {
      const items = await repos.items.listByOrder(orderId);
      for (const it of items) {
        await repos.items.setStatus(it.id, "cancelled");
      }
      await repos.orders.setStatus(orderId, "cancelled");
      await repos.events.append({
        actorUserId: session.user.id,
        type: "return.recorded",
        payload: { orderId, reason: "cancelled_by_supervisor" },
      });
      if (activeOrderId === orderId) setActiveOrderId(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function onNewCheckForTable(label: string) {
    if (!can.takeOrders) return;
    if (!session.user) return;
    if (!shift?.id) {
      alert("لا يوجد وردية مفتوحة الآن. افتح وردية أولاً.");
      return;
    }
    const ok = draftLines.length > 0 ? confirm("سيتم مسح المسودة وفتح حساب جديد لنفس الترابيزة. متابعة؟") : true;
    if (!ok) return;

    setBusy(true);
    try {
      clearDraft();
      const o = await createOrder(repos, { createdBy: session.user.id, shiftId: shift.id, tableLabel: label });
      setActiveOrderId(o.id);
      await load();
    } finally {
      setBusy(false);
    }
  }

  const activeOrder = orders.find((o) => o.id === activeOrderId) ?? null;

  async function markServed(itemId: string) {
    if (!session.user) return;
    setBusy(true);
    try {
      await setItemStatus(repos, { itemId, to: "served", actorUserId: session.user.id });
      await load();
    } finally {
      setBusy(false);
    }
  }

  function normalizeCauseRole(v: string): ShiftRole | "other" {
    const x = v.trim().toLowerCase();
    if (x === "waiter" || x === "ويتر") return "waiter";
    if (x === "barista" || x === "باريستا") return "barista";
    if (x === "shisha" || x === "شيشة") return "shisha";
    if (x === "supervisor" || x === "مشرف") return "supervisor";
    return "other";
  }

  async function recordReturn(it: OrderItem) {
    if (!session.user) return;
    if (!can.billing) {
      alert("تسجيل الاسترجاع للمشرف/المعلم فقط");
      return;
    }

    const reason = (prompt("سبب الاسترجاع؟") || "").trim();
    if (!reason) return;
    const cause = normalizeCauseRole(prompt("سبب من؟ waiter / barista / shisha (أو اكتب أي شيء)") || "");

    const actionRaw = (prompt("الإجراء؟ replace (بديل مجاني) / cancel (إلغاء الصنف)", "replace") || "replace").trim().toLowerCase();
    const action: "replace" | "cancel" = actionRaw === "cancel" ? "cancel" : "replace";

    setBusy(true);
    try {
      if (action === "cancel") {
        await setItemStatus(repos, { itemId: it.id, to: "cancelled", actorUserId: session.user.id });
      } else {
        // بديل مجاني بنفس الصنف
        const repl = await addItem(repos, {
          orderId: it.orderId,
          productId: it.productId,
          qty: it.qty,
          unitPrice: 0,
          assignedTo: it.assignedTo,
          notes: "بديل مجاني (استرجاع)",
          actorUserId: session.user.id,
        });
        await sendItems(repos, { orderId: it.orderId, itemIds: [repl.id], actorUserId: session.user.id });
      }

      await repos.events.append({
        actorUserId: session.user.id,
        type: "return.recorded",
        payload: {
          orderId: it.orderId,
          itemId: it.id,
          productId: it.productId,
          reason,
          causeRole: cause,
          action,
        },
      });

      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <MobileShell title="الطلبات" topRight={<div className="text-xs text-neutral-500">{session.user?.name}</div>}>
      {!can.takeOrders ? (
        <div className="rounded-xl border bg-red-50 p-3 text-sm text-red-900">هذه الشاشة للويتر/المشرف.</div>
      ) : null}

      {/* Open orders */}
      <div className="rounded-2xl border p-3">
        <div className="flex items-center justify-between">
          <div className="font-semibold">طلبات مفتوحة</div>
          <button
            onClick={() => {
              setActiveOrderId(null);
              clearDraft();
            }}
            className="rounded-xl bg-neutral-100 px-3 py-2 text-sm"
          >
            طلب جديد
          </button>
        </div>

        {orders.length === 0 ? (
          <div className="mt-2 text-sm text-neutral-500">لا يوجد طلبات مفتوحة.</div>
        ) : (
          <div className="mt-3 space-y-3">
            {ordersByTable.map(([table, list]) => {
              const header = table === "__no_table__" ? "بدون ترابيزة" : `ترابيزة ${table}`;
              return (
                <div key={table} className="rounded-xl bg-neutral-50 p-2">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-sm font-semibold text-neutral-800">{header}</div>
                    {table !== "__no_table__" ? (
                      <button
                        onClick={() => onNewCheckForTable(table)}
                        className="rounded-full bg-white px-3 py-1.5 text-xs border"
                        title="فتح حساب جديد لنفس الترابيزة"
                      >
                        + حساب
                      </button>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {list.map((o) => {
                      const checkNo = checkNoByOrderId.get(o.id) ?? 1;
                      const label = o.tableLabel ? `حساب ${checkNo}` : `طلب ${o.id.slice(0, 4)}`;
                      return (
                        <button
                          key={o.id}
                          onClick={() => setActiveOrderId(o.id)}
                          className={[
                            "rounded-full border px-3 py-2 text-sm",
                            activeOrderId === o.id ? "bg-black text-white" : "bg-white",
                          ].join(" ")}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeOrder ? (
          <div className="mt-3 flex items-center justify-between rounded-xl bg-neutral-50 p-3 text-sm">
            <div className="text-right">
              <div className="font-semibold">
                {activeOrder.tableLabel
                  ? `ترابيزة ${activeOrder.tableLabel} • حساب ${checkNoByOrderId.get(activeOrder.id) ?? 1}`
                  : "طلب"}
              </div>
              <div className="text-xs text-neutral-500">{new Date(activeOrder.createdAt).toLocaleString("ar-EG")}</div>
            </div>
            {can.billing ? (
              <button
                onClick={() => onCancelOrder(activeOrder.id)}
                className="rounded-xl bg-neutral-200 px-3 py-2 text-sm"
              >
                إلغاء
              </button>
            ) : null}
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-2">
            <input
              value={tableLabel}
              onChange={(e) => setTableLabel(e.target.value)}
              className="w-full rounded-xl border px-3 py-3 text-right"
              placeholder="رقم الترابيزة (اختياري)"
            />
          </div>
        )}

        {/* Active order items status */}
        {activeOrder ? (
          <div className="mt-3 rounded-xl border bg-white p-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold">متابعة الأصناف</div>
              <div className="text-xs text-neutral-500">حالة المطبخ/الشيشة + التسليم</div>
            </div>

            {activeOrderItems.length === 0 ? (
              <div className="mt-2 text-sm text-neutral-500">لا يوجد أصناف على هذا الطلب بعد.</div>
            ) : (
              <div className="mt-2 space-y-2">
                {activeOrderItems.map((it) => {
                  const p = products.find((x) => x.id === it.productId);
                  const canServe = can.takeOrders && it.status === "ready";

                  return (
                    <div key={it.id} className="flex items-center justify-between rounded-xl bg-neutral-50 p-3">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full border bg-white px-2 py-1 text-xs">{statusLabel(it.status)}</span>
                        <span className="text-xs text-neutral-500">×{it.qty}</span>
                      </div>

                      <div className="text-right">
                        <div className="font-semibold">{p?.name ?? it.productId}</div>
                        <div className="text-xs text-neutral-500">{it.assignedTo === "barista" ? "مطبخ" : "شيشة"}</div>
                      </div>

                      <div className="flex gap-2">
                        {canServe ? (
                          <button
                            onClick={() => markServed(it.id)}
                            disabled={busy}
                            className="rounded-xl bg-emerald-600 px-3 py-2 text-xs text-white disabled:opacity-60"
                          >
                            تم التسليم
                          </button>
                        ) : null}

                        {can.billing ? (
                          <button
                            onClick={() => recordReturn(it)}
                            disabled={busy}
                            className="rounded-xl bg-amber-100 px-3 py-2 text-xs disabled:opacity-60"
                          >
                            استرجاع
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Ready to serve (waiter view) */}
      {can.takeOrders ? (
        <div className="mt-3 rounded-2xl border p-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold">جاهز للتسليم</div>
            <div className="text-xs text-neutral-500">اضغط &quot;تم التسليم&quot;</div>
          </div>

          {readyToServe.length === 0 ? (
            <div className="mt-2 text-sm text-neutral-500">لا يوجد أصناف جاهزة الآن.</div>
          ) : (
            <div className="mt-2 space-y-2">
              {readyToServe.slice(0, 8).map((it) => {
                const p = products.find((x) => x.id === it.productId);
                const o = orders.find((x) => x.id === it.orderId);
                const checkNo = o ? (checkNoByOrderId.get(o.id) ?? 1) : 1;
                const title = o?.tableLabel ? `ترابيزة ${o.tableLabel} • حساب ${checkNo}` : `طلب ${it.orderId.slice(0, 4)}`;
                return (
                  <div key={it.id} className="flex items-center justify-between rounded-xl bg-emerald-50 p-3">
                    <div className="text-right">
                      <div className="text-sm font-semibold">{p?.name ?? it.productId}</div>
                      <div className="mt-1 text-xs text-neutral-600">{title} • ×{it.qty}</div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setActiveOrderId(it.orderId)}
                        className="rounded-xl bg-white px-3 py-2 text-xs border"
                      >
                        فتح الطلب
                      </button>
                      <button
                        onClick={() => markServed(it.id)}
                        disabled={busy}
                        className="rounded-xl bg-emerald-600 px-3 py-2 text-xs text-white disabled:opacity-60"
                      >
                        تم التسليم
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {/* Menu */}
      <div className="mt-3 rounded-2xl border p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="font-semibold">المنيو</div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-48 max-w-[55%] rounded-xl border px-3 py-2 text-right text-sm"
            placeholder="بحث سريع"
          />
        </div>

        <div className="mt-2 flex gap-2">
          <aside className="w-[92px] shrink-0">
            <div className="flex flex-col gap-2">
              {(
                [
                  { k: "hot", t: "سخن", icon: "☕" },
                  { k: "cold", t: "ساقع", icon: "🧊" },
                  { k: "fresh", t: "فريش", icon: "🍋" },
                  { k: "shisha", t: "شيشة", icon: "🔥" },
                  { k: "food", t: "أكل", icon: "🍽️" },
                  { k: "other", t: "أخرى", icon: "📦" },
                ] as const
              ).map((c) => (
                <button
                  key={c.k}
                  onClick={() => {
                    setCategory(c.k);
                    setQuery("");
                  }}
                  className={[
                    "rounded-2xl border px-2 py-3 text-center text-xs font-semibold",
                    "active:scale-[0.99]",
                    category === c.k ? "bg-black text-white" : "bg-white",
                  ].join(" ")}
                >
                  <div className="text-base leading-none">{c.icon}</div>
                  <div className="mt-1">{c.t}</div>
                </button>
              ))}
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            {filteredProducts.length === 0 ? (
              <div className="rounded-xl border bg-neutral-50 p-3 text-sm text-neutral-600">لا يوجد أصناف.</div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {filteredProducts.map((p) => {
                  const qty = draft[p.id] ?? 0;
                  return (
                    <button
                      key={p.id}
                      onClick={() => addToDraft(p.id)}
                      className="relative rounded-2xl border bg-white px-4 py-5 text-right active:scale-[0.99]"
                    >
                      {qty > 0 ? (
                        <span className="absolute left-2 top-2 rounded-full bg-emerald-600 px-2 py-1 text-[11px] font-bold text-white">
                          {qty}
                        </span>
                      ) : null}
                      <div className="font-semibold leading-snug">{p.name}</div>
                      <div className="mt-1 text-xs text-neutral-500">{fmtMoney(p.price)} ج</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Draft cart */}
      <div className="mt-3 rounded-2xl border p-3">
        <div className="flex items-center justify-between">
          <div className="font-semibold">المسودة</div>
          <button onClick={clearDraft} className="rounded-xl bg-neutral-100 px-3 py-2 text-sm">
            مسح
          </button>
        </div>

        {draftLines.length === 0 ? (
          <div className="mt-2 text-sm text-neutral-500">اضغط على أصناف لإضافتها.</div>
        ) : (
          <div className="mt-2 space-y-2">
            {draftLines.map((l) => (
              <div key={l.p.id} className="flex items-center justify-between rounded-xl bg-neutral-50 p-3">
                <div className="flex items-center gap-2">
                  <button onClick={() => decDraft(l.p.id)} className="h-10 w-10 rounded-xl bg-white border">
                    -
                  </button>
                  <div className="min-w-[40px] text-center font-semibold">{l.qty}</div>
                  <button onClick={() => addToDraft(l.p.id)} className="h-10 w-10 rounded-xl bg-white border">
                    +
                  </button>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{l.p.name}</div>
                  <div className="text-xs text-neutral-500">{fmtMoney(l.lineTotal)} ج</div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between rounded-xl bg-neutral-50 p-3">
          <div className="text-sm text-neutral-600">الإجمالي</div>
          <div className="text-lg font-semibold">{fmtMoney(draftTotal)} ج</div>
        </div>

        <button
          onClick={onSend}
          disabled={busy || draftLines.length === 0}
          className="mt-3 w-full rounded-xl bg-emerald-600 px-4 py-4 text-white font-semibold disabled:opacity-60"
        >
          {busy ? "..." : "إرسال للمطبخ"}
        </button>

        <div className="mt-2 text-xs text-neutral-500">
          تقدر تضيف/تمسح في المسودة قبل الإرسال. بعد الإرسال: تقدر تضيف دفعة جديدة على نفس الطلب.
        </div>
      </div>
    </MobileShell>
  );
}
