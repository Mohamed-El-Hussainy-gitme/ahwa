"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AdminShell } from "@/ui/AdminShell";
import { memoryRepos } from "@/data/memory/repos";
import { createCustomer } from "@/usecases";
import { useSession } from "@/lib/session";
import type { Customer } from "@/domain/model";

function fmtMoney(n: number) {
  return new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 0 }).format(n);
}

export default function CustomersPage() {
  const repos = memoryRepos;
  const session = useSession();
  const userId = session.user?.id ?? "";

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const cs = await repos.customers.list();
    const map: Record<string, number> = {};
    for (const c of cs) {
      map[c.id] = await repos.ledger.getBalance(c.id);
    }
    setCustomers(cs);
    setBalances(map);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim();
    if (!s) return customers;
    return customers.filter((c) => (c.name + " " + (c.phone ?? "")).toLowerCase().includes(s.toLowerCase()));
  }, [customers, q]);

  const totalDebt = useMemo(() => {
    return Object.values(balances).reduce((s, x) => s + Math.max(x, 0), 0);
  }, [balances]);

  async function onCreate() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await createCustomer(repos, { name: name.trim(), phone: phone.trim() || undefined, actorUserId: userId });
      setName("");
      setPhone("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell title="الزبائن والمديونيات" subtitle="كشف الحساب (مديونية على الزبون)">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="md:col-span-2">
          <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
              <div className="text-xs text-neutral-400">عدد الزبائن</div>
              <div className="mt-1 text-2xl font-semibold">{customers.length}</div>
            </div>
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
              <div className="text-xs text-neutral-400">إجمالي المديونيات</div>
              <div className="mt-1 text-2xl font-semibold text-amber-200">{fmtMoney(totalDebt)} ج</div>
            </div>
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
              <div className="text-xs text-neutral-400">بحث سريع</div>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="mt-2 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-3 text-sm text-right outline-none"
                placeholder="اسم/موبايل..."
              />
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="font-semibold">القائمة</div>
              <div className="text-xs text-neutral-500">اضغط لفتح كشف الزبون</div>
            </div>

            {filtered.length === 0 ? (
              <div className="p-3 text-sm text-neutral-400">لا توجد نتائج</div>
            ) : (
              <div className="divide-y divide-neutral-800">
                {filtered.map((c) => {
                  const bal = balances[c.id] ?? 0;
                  const isDebt = bal > 0;
                  return (
                    <Link
                      key={c.id}
                      href={`/customers/${c.id}`}
                      className="flex items-center justify-between gap-3 p-3 transition hover:bg-neutral-900"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{c.name}</div>
                        <div className="truncate text-xs text-neutral-500">{c.phone ?? "—"}</div>
                      </div>
                      <div
                        className={[
                          "rounded-full px-3 py-1 text-xs font-semibold",
                          isDebt ? "bg-red-950 text-red-200" : "bg-emerald-950 text-emerald-200",
                        ].join(" ")}
                      >
                        {fmtMoney(bal)} ج
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
          <div className="mb-3 font-semibold">إضافة زبون</div>

          <div className="space-y-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-3 text-right text-sm outline-none"
              placeholder="اسم الزبون"
            />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-3 text-right text-sm outline-none"
              placeholder="موبايل (اختياري)"
              inputMode="tel"
            />

            <button
              onClick={onCreate}
              disabled={busy}
              className="w-full rounded-xl bg-amber-200 px-4 py-3 text-sm font-semibold text-neutral-950 disabled:opacity-60"
            >
              {busy ? "..." : "إضافة"}
            </button>
          </div>

          <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-900 p-3 text-xs text-neutral-400">
            فكرة القهوة الشعبي: العميل ممكن &quot;يكتب&quot; (آجل). لما ترحل باقي فاتورة لزبون، بتتحسب عليه مديونية في كشفه.
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
