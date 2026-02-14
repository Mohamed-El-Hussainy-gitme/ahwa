import { mem, uid, ensureLoaded, persist } from "./db";
import { Repos } from "../ports";
import { Invoice, LedgerEntry, Order, OrderItem } from "@/domain/model";

function recalcInvoice(orderId: string): Invoice {
  const items = mem.items.filter((i) => i.orderId === orderId && i.status !== "cancelled");
  const subtotal = items.reduce((s, i) => s + i.qty * i.unitPrice, 0);

  const prev =
    mem.invoices.get(orderId) ??
    ({ orderId, subtotal: 0, discount: 0, total: 0, paid: 0, status: "open" } as const);

  const total = Math.max(subtotal - prev.discount, 0);

  let status: Invoice["status"] = prev.status;
  if (prev.status !== "credit") {
    status = prev.paid >= total && total > 0 ? "paid" : "open";
  }

  const inv: Invoice = { ...prev, subtotal, total, status };
  mem.invoices.set(orderId, inv);
  return inv;
}

function customerBalance(customerId: string) {
  return mem.ledger
    .filter((e) => e.customerId === customerId)
    .reduce((s, e) => s + (e.kind === "charge" ? e.amount : -e.amount), 0);
}

export const memoryRepos: Repos = {
  staff: {
    async list() {
      ensureLoaded();
      return [...mem.staff].sort((a, b) => a.name.localeCompare(b.name, "ar"));
    },
    async get(id) {
      ensureLoaded();
      return mem.staff.find((u) => u.id === id) ?? null;
    },
    async create(input) {
      ensureLoaded();
      const u = {
        id: uid(),
        name: input.name.trim(),
        baseRole: input.baseRole,
        isActive: true,
        createdAt: Date.now(),
      };
      mem.staff.unshift(u);
      persist();
      return u;
    },
    async update(id, patch) {
      ensureLoaded();
      const u = mem.staff.find((x) => x.id === id);
      if (!u) throw new Error("User not found");
      if (patch.name !== undefined) u.name = patch.name.trim();
      if (patch.baseRole !== undefined) u.baseRole = patch.baseRole;
      if (patch.isActive !== undefined) u.isActive = patch.isActive;
      persist();
      return u;
    },
    async archive(id) {
      ensureLoaded();
      const u = mem.staff.find((x) => x.id === id);
      if (u) u.isActive = false;
      persist();
    },
  },
  shifts: {
    async openShift(input) {
      ensureLoaded();
      const s = { id: uid(), startedAt: Date.now(), isOpen: true, ...input };
      mem.shift = s;
      persist();
      return s;
    },
    async getOpenShift() {
      ensureLoaded();
      return mem.shift?.isOpen ? mem.shift : null;
    },

    async updateOpenShift(input) {
      ensureLoaded();
      const s = mem.shift;
      if (!s || !s.isOpen) throw new Error("No open shift");
      s.kind = input.kind;
      s.supervisorUserId = input.supervisorUserId;
      s.assignments = input.assignments;
      persist();
      return s;
    },
    async closeShift(input) {
      ensureLoaded();
      const s = mem.shift;
      if (!s || !s.isOpen) throw new Error("No open shift");
      s.isOpen = false;
      s.endedAt = Date.now();
      s.endedBy = input.endedBy;
      mem.shiftHistory.unshift({ ...s });
      mem.shift = null;
      persist();
      return s;
    },
    async listHistory() {
      ensureLoaded();
      return mem.shiftHistory;
    },
  },

  products: {
    async list() {
      ensureLoaded();
      return mem.products.filter((p) => !p.isArchived);
    },
    async get(id) {
      ensureLoaded();
      return mem.products.find((p) => p.id === id && !p.isArchived) ?? null;
    },
    async create(input) {
      ensureLoaded();
      const p = { id: uid(), ...input };
      mem.products.unshift(p);
      persist();
      return p;
    },
    async update(id, patch) {
      ensureLoaded();
      const p = mem.products.find((x) => x.id === id);
      if (!p) throw new Error("Product not found");
      Object.assign(p, patch);
      persist();
      return p;
    },
    async archive(id) {
      ensureLoaded();
      const p = mem.products.find((x) => x.id === id);
      if (p) p.isArchived = true;
      persist();
    },
  },

  customers: {
    async list() {
      ensureLoaded();
      return mem.customers;
    },
    async get(id) {
      ensureLoaded();
      return mem.customers.find((c) => c.id === id) ?? null;
    },
    async create(input) {
      ensureLoaded();
      const c = { id: uid(), ...input };
      mem.customers.unshift(c);
      persist();
      return c;
    },
  },

  orders: {
    async create(input) {
      ensureLoaded();
      // Explicitly type to prevent TS from widening union literals to `string`.
      const o: Order = { id: uid(), createdAt: Date.now(), status: "open", ...input };
      mem.orders.unshift(o);
      recalcInvoice(o.id);
      persist();
      return o;
    },
    async get(orderId) {
      ensureLoaded();
      return mem.orders.find((o) => o.id === orderId) ?? null;
    },
    async listOpen() {
      ensureLoaded();
      return mem.orders.filter((o) => o.status !== "closed" && o.status !== "cancelled");
    },
    async listAll() {
      ensureLoaded();
      // Includes closed orders so billing can show who paid what for the same table.
      return mem.orders.filter((o) => o.status !== "cancelled");
    },
    async setStatus(orderId, status) {
      ensureLoaded();
      const o = mem.orders.find((x) => x.id === orderId);
      if (o) o.status = status;
      persist();
    },
    async setCustomer(orderId, customerId) {
      ensureLoaded();
      const o = mem.orders.find((x) => x.id === orderId);
      if (o) o.customerId = customerId ?? undefined;
      persist();
    },
  },

  items: {
    async add(input) {
      ensureLoaded();
      // Explicitly type to prevent TS from widening union literals to `string`.
      const it: OrderItem = { id: uid(), createdAt: Date.now(), status: "new", ...input };
        mem.items.push(it);
      recalcInvoice(it.orderId);
      persist();
      return it;
    },
    async get(itemId) {
      ensureLoaded();
      return mem.items.find((i) => i.id === itemId) ?? null;
    },
    async listByOrder(orderId) {
      ensureLoaded();
      return mem.items.filter((i) => i.orderId === orderId);
    },
    async listByRole(role) {
      ensureLoaded();
      return mem.items.filter((i) => i.assignedTo === role && !["served", "cancelled"].includes(i.status));
    },
    async setStatus(itemId, status) {
      ensureLoaded();
      const it = mem.items.find((i) => i.id === itemId);
      if (it) it.status = status;
      if (it) recalcInvoice(it.orderId);
      persist();
    },
    async moveToOrder(itemId, toOrderId) {
      ensureLoaded();
      const it = mem.items.find((i) => i.id === itemId);
      if (!it) throw new Error('Item not found');
      const fromOrderId = it.orderId;
      if (fromOrderId === toOrderId) return;
      const to = mem.orders.find((o) => o.id === toOrderId);
      if (!to) throw new Error('Target order not found');
      it.orderId = toOrderId;
      // Recalculate both invoices (from & to)
      recalcInvoice(fromOrderId);
      recalcInvoice(toOrderId);
      persist();
    },
  },

  billing: {
    async getInvoice(orderId) {
      ensureLoaded();
      return recalcInvoice(orderId);
    },
    async applyDiscount(orderId, discount) {
      ensureLoaded();
      const inv = mem.invoices.get(orderId) ?? recalcInvoice(orderId);
      const next = { ...inv, discount: Math.max(discount, 0) };
      mem.invoices.set(orderId, next);
      persist();
      return recalcInvoice(orderId);
    },
    async addPayment(input) {
      ensureLoaded();
      // ✅ احسب الفاتورة أولًا عشان نعرف المتبقي
      const inv0 = recalcInvoice(input.orderId);

      const o = mem.orders.find((x) => x.id === input.orderId);
      if (!o) throw new Error("Order not found");

      // ممنوع الدفع على طلب مقفول
      if (o.status === "closed" || o.status === "cancelled") {
        throw new Error("Order is already closed");
      }

      // لو اترحل آجل، الدفع يتم من شاشة المديونيات (ledger) وليس على نفس الطلب
      if (inv0.status === "credit") {
        throw new Error("Invoice is posted to credit; use customer ledger payment");
      }

      const remaining = Math.max(inv0.total - inv0.paid, 0);
      if (remaining <= 0) {
        throw new Error("Invoice is already fully paid");
      }

      // ممنوع دفع أكبر من المتبقي (عشان مايسجلش زيادات غلط)
      if (input.amount > remaining) {
        throw new Error(`Amount exceeds remaining (${remaining})`);
      }

      const p = { id: uid(), receivedAt: Date.now(), ...input };
      mem.payments.unshift(p);

      const paid = inv0.paid + input.amount;
      const nextStatus: Invoice["status"] = paid >= inv0.total && inv0.total > 0 ? "paid" : "open";

      mem.invoices.set(input.orderId, { ...inv0, paid, status: nextStatus });

      // ✅ عند اكتمال الدفع: اقفل الطلب تلقائيًا
      if (nextStatus === "paid") {
        o.status = "closed";
      }

      persist();
      return p;
    },
    async listPayments(orderId) {
      ensureLoaded();
      return mem.payments.filter((p) => p.orderId === orderId).sort((a, b) => b.receivedAt - a.receivedAt);
    },
    async postToCredit(input) {
      ensureLoaded();
      const inv = mem.invoices.get(input.orderId) ?? recalcInvoice(input.orderId);
      const remaining = Math.max(inv.total - inv.paid, 0);
      if (remaining <= 0) {
        // nothing to post
        mem.invoices.set(input.orderId, { ...inv, status: "paid" });
        return { ok: true as const, entryId: "" };
      }

      // mark invoice as credit and link customer
      mem.invoices.set(input.orderId, { ...inv, status: "credit" });

      const o = mem.orders.find((x) => x.id === input.orderId);
      if (o) {
        o.customerId = input.customerId;
        o.status = "closed";
      }

      const e: LedgerEntry = {
        id: uid(),
        at: Date.now(),
        customerId: input.customerId,
        kind: "charge",
        amount: remaining,
        note: input.note,
        orderId: input.orderId,
        actorUserId: input.actorUserId,
      };
      mem.ledger.unshift(e);
      persist();
      return { ok: true as const, entryId: e.id };
    },
  },

  ledger: {
    async listByCustomer(customerId) {
      ensureLoaded();
      return mem.ledger
        .filter((e) => e.customerId === customerId)
        .sort((a, b) => b.at - a.at);
    },
    async getBalance(customerId) {
      ensureLoaded();
      return customerBalance(customerId);
    },
    async addCharge(input) {
      ensureLoaded();
      const e: LedgerEntry = {
        id: uid(),
        at: Date.now(),
        kind: "charge",
        amount: Math.max(Number(input.amount), 0),
        customerId: input.customerId,
        note: input.note,
        orderId: input.orderId,
        actorUserId: input.actorUserId,
      };
      mem.ledger.unshift(e);
      persist();
      return e;
    },
    async addPayment(input) {
      ensureLoaded();
      const e: LedgerEntry = {
        id: uid(),
        at: Date.now(),
        kind: "payment",
        amount: Math.max(Number(input.amount), 0),
        customerId: input.customerId,
        note: input.note,
        orderId: input.orderId,
        actorUserId: input.actorUserId,
      };
      mem.ledger.unshift(e);
      persist();
      return e;
    },
  },

  events: {
    async append(e) {
      ensureLoaded();
      const ev = { id: uid(), at: Date.now(), ...e };
      mem.events.unshift(ev);
      persist();
      return ev;
    },
    async listRecent() {
      ensureLoaded();
      return mem.events.slice(0, 100);
    },
  },
};
