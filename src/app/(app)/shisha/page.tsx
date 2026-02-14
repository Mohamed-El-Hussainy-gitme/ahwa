"use client";

import { useEffect, useMemo, useState } from "react";
import { MobileShell } from "@/ui/MobileShell";
import { memoryRepos } from "@/data/memory/repos";
import { addItem, sendItems, setItemStatus } from "@/usecases";
import { useAuthz } from "@/lib/authz";
import { useSession } from "@/lib/session";
import type { Order, OrderItem, Product } from "@/domain/model";

function statusLabel(s: OrderItem["status"]) {
  if (s === "new") return "جديد";
  if (s === "sent") return "وصل";
  if (s === "in_progress") return "شغال";
  if (s === "ready") return "جاهز";
  if (s === "served") return "اتسلم";
  if (s === "cancelled") return "ملغي";
  return s;
}

export default function ShishaPage() {
  const repos = memoryRepos;
  const { can, shift, effectiveRole } = useAuthz();
  const session = useSession();

  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [queue, setQueue] = useState<OrderItem[]>([]);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [ps, os, q] = await Promise.all([
      repos.products.list(),
      repos.orders.listOpen(),
      repos.items.listByRole("shisha"),
    ]);
    setProducts(ps);
    setOrders(os);
    setQueue(q);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byOrder = useMemo(() => {
    const map = new Map<string, OrderItem[]>();
    for (const it of queue) {
      const arr = map.get(it.orderId) ?? [];
      arr.push(it);
      map.set(it.orderId, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.createdAt - b.createdAt);
    return map;
  }, [queue]);

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

  const stones = useMemo(() => {
    return products.filter((p) => p.category === "shisha" && p.name.includes("حجر"));
  }, [products]);

  async function addStone(orderId: string, free: boolean) {
    if (!session.user) return;
    const stone = stones[0];
    if (!stone) {
      alert("أضف صنف 'حجر' في المنيو أولاً");
      return;
    }

    setBusy(true);
    try {
      const it = await addItem(repos, {
        orderId,
        productId: stone.id,
        qty: 1,
        unitPrice: free ? 0 : stone.price,
        assignedTo: "shisha",
        actorUserId: session.user.id,
        notes: free ? "تغيير حجر (مجاني)" : "إضافة حجر",
      });

      await sendItems(repos, { orderId, itemIds: [it.id], actorUserId: session.user.id });

      if (free) {
        const reason = prompt("سبب تغيير الحجر؟ (المشرف يكتب السبب)") || "";
        await repos.events.append({
          actorUserId: session.user.id,
          type: "return.recorded",
          payload: { orderId, itemId: it.id, reason, causeRole: "shisha", action: "replace" },
        });
      }

      await refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!shift && !can.owner) {
    return <MobileShell title="الشيشة">لا توجد وردية مفتوحة.</MobileShell>;
  }

  // هذه الشاشة للشيشة فقط (شيشة/مشرف/معلم)
  const allowShisha = can.owner || effectiveRole === "shisha";
  if (!allowShisha) return <MobileShell title="الشيشة">غير مسموح</MobileShell>;

  return (
    <MobileShell title="الشيشة" topRight={<div className="text-xs text-neutral-500">{session.user?.name}</div>}>
      <div className="mt-3 flex items-center justify-between">
        <div className="text-xs text-neutral-500">تحديث تلقائي عند كل حركة (ديمو: زر تحديث)</div>
        <button onClick={refresh} className="rounded-xl bg-neutral-100 px-3 py-2 text-sm">
          تحديث
        </button>
      </div>

      {queue.length === 0 ? (
        <div className="mt-3 rounded-xl border bg-neutral-50 p-3 text-sm text-neutral-600">لا يوجد طلبات.</div>
      ) : (
        <div className="mt-3 space-y-3">
          {Array.from(byOrder.entries()).map(([orderId, items]) => {
            const o = orders.find((x) => x.id === orderId);
            const checkNo = o ? (checkNoByOrderId.get(o.id) ?? 1) : 1;
            const title = o?.tableLabel ? `ترابيزة ${o.tableLabel} • حساب ${checkNo}` : `طلب ${orderId.slice(0, 4)}`;

            return (
              <div key={orderId} className="rounded-2xl border p-3">
                <div className="flex items-center justify-between">
                  <div className="text-right">
                    <div className="font-semibold">{title}</div>
                    <div className="text-xs text-neutral-500">{new Date(o?.createdAt ?? Date.now()).toLocaleString("ar-EG")}</div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => addStone(orderId, false)}
                      disabled={busy}
                      className="rounded-xl bg-neutral-100 px-3 py-2 text-sm disabled:opacity-60"
                    >
                      + حجر
                    </button>
                    {can.billing ? (
                      <button
                        onClick={() => addStone(orderId, true)}
                        disabled={busy}
                        className="rounded-xl bg-amber-100 px-3 py-2 text-sm disabled:opacity-60"
                      >
                        تغيير حجر (مجاني)
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="mt-2 space-y-2">
                  {items.map((it) => {
                    const p = products.find((x) => x.id === it.productId);
                    const name = p?.name ?? it.productId;
                    const status = it.status;

                    return (
                      <div key={it.id} className="flex items-center justify-between rounded-xl bg-neutral-50 p-3">
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-white px-2 py-1 text-xs border">{statusLabel(status)}</span>
                          <span className="text-xs text-neutral-500">×{it.qty}</span>
                        </div>

                        <div className="text-right">
                          <div className="font-semibold">{name}</div>
                          {it.notes ? <div className="text-xs text-neutral-500">{it.notes}</div> : null}
                        </div>

                        <div className="flex gap-2">
                          {status === "sent" || status === "new" ? (
                            <button
                              onClick={() =>
                                setItemStatus(repos, { itemId: it.id, to: "in_progress", actorUserId: session.user!.id })
                                  .then(refresh)
                                  .catch((e) => alert(String(e)))
                              }
                              className="rounded-xl bg-black px-3 py-2 text-xs text-white"
                            >
                              بدء
                            </button>
                          ) : null}

                          {status === "in_progress" ? (
                            <button
                              onClick={() =>
                                setItemStatus(repos, { itemId: it.id, to: "ready", actorUserId: session.user!.id })
                                  .then(refresh)
                                  .catch((e) => alert(String(e)))
                              }
                              className="rounded-xl bg-emerald-600 px-3 py-2 text-xs text-white"
                            >
                              جاهز
                            </button>
                          ) : null}

                          {/* ✅ التسليم مسؤولية الويتر/المشرف من شاشة الطلبات */}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </MobileShell>
  );
}
