"use client";

import { useEffect, useMemo, useState } from "react";
import { MobileShell } from "@/ui/MobileShell";
import { memoryRepos } from "@/data/memory/repos";
import { useAuthz } from "@/lib/authz";
import { useSession } from "@/lib/session";
import type { Product } from "@/domain/model";

export default function MenuPage() {
  const repos = memoryRepos;
  const { can } = useAuthz();
  const session = useSession();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [category, setCategory] = useState<Product["category"]>("hot");
  const [price, setPrice] = useState<string>("");
  const [targetRole, setTargetRole] = useState<Product["targetRole"]>("barista");

  async function refresh() {
    const list = await repos.products.list();
    setProducts(list);
  }

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grouped = useMemo(() => {
    const g = new Map<Product["category"], Product[]>();
    for (const p of products) {
      const arr = g.get(p.category) ?? [];
      arr.push(p);
      g.set(p.category, arr);
    }
    return g;
  }, [products]);

  if (!can.manageMenu) {
    return (
      <MobileShell title="المنيو" backHref="/owner">
        غير مسموح
      </MobileShell>
    );
  }

  async function onAdd() {
    const n = name.trim();
    const p = Number(price || "0");
    if (n.length < 2 || !isFinite(p) || p <= 0) return;

    const created = await repos.products.create({ name: n, category, price: p, targetRole });
    await repos.events.append({
      actorUserId: session.user?.id,
      type: "product.created",
      payload: { productId: created.id, name: created.name, price: created.price, category: created.category },
    });

    setName("");
    setPrice("");
    setCategory("hot");
    setTargetRole("barista");
    await refresh();
  }

  async function onUpdate(prod: Product, patch: Partial<Omit<Product, "id">>) {
    const updated = await repos.products.update(prod.id, patch);
    await repos.events.append({
      actorUserId: session.user?.id,
      type: "product.updated",
      payload: { productId: updated.id, patch },
    });
    await refresh();
  }

  async function onArchive(prod: Product) {
    await repos.products.archive(prod.id);
    await repos.events.append({
      actorUserId: session.user?.id,
      type: "product.archived",
      payload: { productId: prod.id },
    });
    await refresh();
  }

  return (
    <MobileShell
      title="المنيو"
      backHref="/owner"
      topRight={<div className="text-xs text-neutral-500">{session.user?.name}</div>}
    >
      <div className="space-y-3">
        <div className="rounded-2xl border p-3">
          <div className="mb-2 font-semibold">إضافة صنف</div>
          <div className="grid grid-cols-2 gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="col-span-2 rounded-xl border px-3 py-3 text-right"
              placeholder="اسم الصنف"
            />

            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Product["category"])}
              className="rounded-xl border px-2 py-3 text-right"
            >
              <option value="hot">مشروبات سخن</option>
              <option value="cold">مشروبات ساقع</option>
              <option value="fresh">فريش/عصاير</option>
              <option value="shisha">شيشة</option>
              <option value="food">أكل</option>
              <option value="other">أخرى</option>
            </select>

            <select
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value as Product["targetRole"])}
              className="rounded-xl border px-2 py-3 text-right"
            >
              <option value="barista">باريستا</option>
              <option value="shisha">شيشة</option>
            </select>

            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="numeric"
              className="col-span-2 rounded-xl border px-3 py-3 text-right"
              placeholder="السعر (جنيه)"
            />
          </div>
          <button onClick={onAdd} className="mt-2 w-full rounded-xl bg-black px-4 py-3 text-white">
            إضافة
          </button>
        </div>

        <div className="rounded-2xl border p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="font-semibold">الأصناف</div>
            <button onClick={refresh} className="rounded-xl bg-neutral-100 px-3 py-2 text-sm">
              تحديث
            </button>
          </div>

          {loading ? (
            <div className="text-sm text-neutral-500">تحميل...</div>
          ) : products.length === 0 ? (
            <div className="text-sm text-neutral-500">لا يوجد أصناف.</div>
          ) : (
            <div className="space-y-4">
              {(["hot", "cold", "fresh", "shisha", "food", "other"] as const).map((cat) => {
                const list = grouped.get(cat) ?? [];
                if (list.length === 0) return null;
                const title =
                  cat === "hot"
                    ? "مشروبات سخن"
                    : cat === "cold"
                      ? "مشروبات ساقع"
                      : cat === "fresh"
                        ? "فريش/عصاير"
                        : cat === "shisha"
                          ? "شيشة"
                          : cat === "food"
                            ? "أكل"
                            : "أخرى";
                return (
                  <div key={cat}>
                    <div className="mb-2 text-sm font-semibold text-neutral-700">{title}</div>
                    <div className="space-y-2">
                      {list.map((p) => (
                        <div key={p.id} className="rounded-2xl border bg-neutral-50 p-3">
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              defaultValue={p.name}
                              onBlur={(e) => {
                                const v = e.target.value.trim();
                                if (v && v !== p.name) onUpdate(p, { name: v });
                              }}
                              className="col-span-2 rounded-xl border bg-white px-3 py-3 text-right"
                            />

                            <input
                              defaultValue={String(p.price)}
                              inputMode="numeric"
                              onBlur={(e) => {
                                const v = Number(e.target.value || "0");
                                if (isFinite(v) && v > 0 && v !== p.price) onUpdate(p, { price: v });
                              }}
                              className="rounded-xl border bg-white px-3 py-3 text-right"
                            />

                            <select
                              value={p.targetRole}
                              onChange={(e) => onUpdate(p, { targetRole: e.target.value as Product["targetRole"] })}
                              className="rounded-xl border bg-white px-2 py-3 text-right"
                            >
                              <option value="barista">باريستا</option>
                              <option value="shisha">شيشة</option>
                            </select>
                          </div>

                          <div className="mt-2 flex items-center justify-between">
                            <span className="text-xs text-neutral-500">{p.id.slice(0, 8)}</span>
                            <button onClick={() => onArchive(p)} className="rounded-xl bg-neutral-200 px-3 py-2 text-sm">
                              حذف
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </MobileShell>
  );
}
