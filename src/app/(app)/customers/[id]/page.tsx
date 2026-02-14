"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AdminShell } from "@/ui/AdminShell";
import { memoryRepos } from "@/data/memory/repos";
import { addLedgerCharge, addLedgerPayment } from "@/usecases";
import { useSession } from "@/lib/session";
import type { Customer, LedgerEntry } from "@/domain/model";

function fmtMoney(n: number) {
  return new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 0 }).format(n);
}

export default function CustomerDetailsPage() {
  const repos = memoryRepos;
  const session = useSession();
  const userId = session.user?.id ?? "";
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const id = params.id;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [balance, setBalance] = useState(0);

  const [amount, setAmount] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [mode, setMode] = useState<"payment" | "charge">("payment");
  const [busy, setBusy] = useState(false);

  async function load() {
    const c = await repos.customers.get(id);
    setCustomer(c);

    const es = await repos.ledger.listByCustomer(id);
    setEntries(es);

    const b = await repos.ledger.getBalance(id);
    setBalance(b);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const title = customer?.name ?? "كشف زبون";

  const badge = useMemo(() => {
    const isDebt = balance > 0;
    return (
      <span
        className={[
          "rounded-full px-3 py-1 text-xs font-semibold",
          isDebt ? "bg-red-950 text-red-200" : "bg-emerald-950 text-emerald-200",
        ].join(" ")}
      >
        {fmtMoney(balance)} ج
      </span>
    );
  }, [balance]);

  async function onSubmit() {
    const a = Number(amount || "0");
    if (!isFinite(a) || a <= 0) return;

    setBusy(true);
    try {
      if (mode === "payment") {
        await addLedgerPayment(repos, { customerId: id, amount: a, note: note || undefined, actorUserId: userId });
      } else {
        await addLedgerCharge(repos, { customerId: id, amount: a, note: note || undefined, actorUserId: userId });
      }
      setAmount("");
      setNote("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell
      title={title}
      subtitle={customer?.phone ? `📞 ${customer.phone}` : ""}
      right={
        <div className="flex items-center gap-2">
          {badge}
          <button
            onClick={() => router.push("/customers")}
            className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs"
          >
            رجوع
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="md:col-span-2">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="font-semibold">سجل الحركة</div>
              <div className="text-xs text-neutral-500">الأحدث أولاً</div>
            </div>

            {entries.length === 0 ? (
              <div className="p-3 text-sm text-neutral-400">لا يوجد حركة بعد</div>
            ) : (
              <div className="divide-y divide-neutral-800">
                {entries.map((e) => (
                  <div key={e.id} className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {e.kind === "charge" ? "مديونية" : "سداد"}
                        {e.orderId ? <span className="text-neutral-500"> • طلب {e.orderId.slice(0, 6)}</span> : null}
                      </div>
                      <div className="truncate text-xs text-neutral-500">
                        {new Date(e.at).toLocaleString("ar-EG")} {e.note ? `• ${e.note}` : ""}
                      </div>
                    </div>

                    <div
                      className={[
                        "shrink-0 rounded-full px-3 py-1 text-xs font-semibold",
                        e.kind === "charge" ? "bg-red-950 text-red-200" : "bg-emerald-950 text-emerald-200",
                      ].join(" ")}
                    >
                      {e.kind === "charge" ? "+" : "-"}
                      {fmtMoney(e.amount)} ج
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
          <div className="mb-3 font-semibold">تسجيل حركة</div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setMode("payment")}
              className={[
                "rounded-xl px-3 py-3 text-sm font-semibold",
                mode === "payment" ? "bg-emerald-200 text-neutral-950" : "bg-neutral-900 text-neutral-200",
              ].join(" ")}
            >
              سداد
            </button>
            <button
              onClick={() => setMode("charge")}
              className={[
                "rounded-xl px-3 py-3 text-sm font-semibold",
                mode === "charge" ? "bg-red-200 text-neutral-950" : "bg-neutral-900 text-neutral-200",
              ].join(" ")}
            >
              مديونية
            </button>
          </div>

          <div className="mt-3 space-y-2">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="numeric"
              className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-3 text-right text-sm outline-none"
              placeholder="المبلغ"
            />
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-3 text-right text-sm outline-none"
              placeholder="ملاحظة (اختياري)"
            />

            <button
              onClick={onSubmit}
              disabled={busy}
              className="w-full rounded-xl bg-amber-200 px-4 py-3 text-sm font-semibold text-neutral-950 disabled:opacity-60"
            >
              {busy ? "..." : mode === "payment" ? "تسجيل سداد" : "تسجيل مديونية"}
            </button>

            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3 text-xs text-neutral-400">
              <div className="font-semibold text-neutral-200">معلومة</div>
              <div className="mt-1">الرصيد موجب = عليه فلوس. الرصيد سالب = له رصيد (نادر في القهوة).</div>
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
