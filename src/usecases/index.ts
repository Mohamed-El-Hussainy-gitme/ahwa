import { Repos } from "@/data/ports";
import { canSetItemStatus } from "@/domain/state";
import { z } from "zod";

/**
 * Keep this module self-contained (no barrel re-exports).
 * This avoids "Cannot find module './x'" issues on some Windows setups.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Shift
// ─────────────────────────────────────────────────────────────────────────────

const OpenShiftInput = z.object({
  kind: z.enum(["morning", "evening"]),
  supervisorUserId: z.string().min(1),
  assignments: z.array(
    z.object({
      userId: z.string().min(1),
      role: z.enum(["supervisor", "waiter", "barista", "shisha"]),
    })
  ),
});

export async function openShift(repos: Repos, actorUserId: string, input: unknown) {
  const data = OpenShiftInput.parse(input);
  const shift = await repos.shifts.openShift({
    kind: data.kind,
    supervisorUserId: data.supervisorUserId,
    assignments: data.assignments,
  });

  await repos.events.append({ actorUserId, type: "shift.opened", payload: { shiftId: shift.id } });
  return shift;
}

const UpdateShiftAssignmentsInput = OpenShiftInput;

export async function updateShiftAssignments(repos: Repos, actorUserId: string, input: unknown) {
  const data = UpdateShiftAssignmentsInput.parse(input);

  const supCount = data.assignments.filter((a) => a.role === "supervisor").length;
  if (supCount !== 1) throw new Error("لازم مشرف واحد فقط");

  const shift = await repos.shifts.updateOpenShift({
    kind: data.kind,
    supervisorUserId: data.supervisorUserId,
    assignments: data.assignments,
  });

  await repos.events.append({
    actorUserId,
    type: "shift.assignments_updated",
    payload: { shiftId: shift.id, kind: shift.kind, supervisorUserId: shift.supervisorUserId, assignments: shift.assignments },
  });
  return shift;
}

// ─────────────────────────────────────────────────────────────────────────────
// Customers / Ledger
// ─────────────────────────────────────────────────────────────────────────────

const CreateCustomerInput = z.object({
  name: z.string().min(2),
  phone: z.string().optional(),
  actorUserId: z.string().min(1),
});

export async function createCustomer(repos: Repos, input: unknown) {
  const data = CreateCustomerInput.parse(input);
  const c = await repos.customers.create({ name: data.name, phone: data.phone });

  await repos.events.append({
    actorUserId: data.actorUserId,
    type: "customer.created",
    payload: { customerId: c.id, name: c.name, phone: c.phone ?? null },
  });

  return c;
}

const AddLedgerChargeInput = z.object({
  customerId: z.string().min(1),
  amount: z.number().positive(),
  note: z.string().optional(),
  actorUserId: z.string().min(1),
  orderId: z.string().optional(),
});

export async function addLedgerCharge(repos: Repos, input: unknown) {
  const data = AddLedgerChargeInput.parse(input);

  const e = await repos.ledger.addCharge({
    customerId: data.customerId,
    amount: data.amount,
    note: data.note,
    actorUserId: data.actorUserId,
    orderId: data.orderId,
  });

  await repos.events.append({
    actorUserId: data.actorUserId,
    type: "ledger.charge",
    payload: {
      customerId: data.customerId,
      entryId: e.id,
      amount: data.amount,
      note: data.note ?? null,
      orderId: data.orderId ?? null,
    },
  });

  return e;
}

const AddLedgerPaymentInput = z.object({
  customerId: z.string().min(1),
  amount: z.number().positive(),
  note: z.string().optional(),
  actorUserId: z.string().min(1),
  orderId: z.string().optional(),
});

export async function addLedgerPayment(repos: Repos, input: unknown) {
  const data = AddLedgerPaymentInput.parse(input);

  const e = await repos.ledger.addPayment({
    customerId: data.customerId,
    amount: data.amount,
    note: data.note,
    actorUserId: data.actorUserId,
    orderId: data.orderId,
  });

  await repos.events.append({
    actorUserId: data.actorUserId,
    type: "ledger.payment",
    payload: {
      customerId: data.customerId,
      entryId: e.id,
      amount: data.amount,
      note: data.note ?? null,
      orderId: data.orderId ?? null,
    },
  });

  return e;
}

// ─────────────────────────────────────────────────────────────────────────────
// Orders
// ─────────────────────────────────────────────────────────────────────────────

const CreateOrderInput = z.object({
  tableLabel: z.string().optional(),
  createdBy: z.string().min(1),
});

export async function createOrder(repos: Repos, input: unknown) {
  const data = CreateOrderInput.parse(input);
  const order = await repos.orders.create({ tableLabel: data.tableLabel, createdBy: data.createdBy });

  await repos.events.append({
    actorUserId: data.createdBy,
    type: "order.created",
    payload: { orderId: order.id, table: order.tableLabel ?? null },
  });

  return order;
}


const SplitOrderItemsInput = z.object({
  orderId: z.string().min(1),
  itemIds: z.array(z.string().min(1)).min(1),
  createdBy: z.string().min(1),
});

/**
 * Split selected items into a NEW order (check) under the SAME table.
 * This is how we support "each person pays separately" while keeping a single table.
 */
export async function splitOrderItems(repos: Repos, input: unknown) {
  const data = SplitOrderItemsInput.parse(input);

  const src = await repos.orders.get(data.orderId);
  if (!src) throw new Error("Order not found");

  // Create a new check under the same table label.
  const dst = await repos.orders.create({
    tableLabel: src.tableLabel,
    createdBy: data.createdBy,
    customerId: undefined,
  });

  // Move items
  for (const itemId of data.itemIds) {
    const it = await repos.items.get(itemId);
    if (!it) continue;
    if (it.orderId !== data.orderId) continue;
    await repos.items.moveToOrder(itemId, dst.id);
  }

  // If source becomes empty, close it to avoid clutter.
  const srcInv = await repos.billing.getInvoice(data.orderId);
  const srcItems = await repos.items.listByOrder(data.orderId);
  const hasRealItems = srcItems.some((i) => i.status !== "cancelled");
  if (!hasRealItems || srcInv.total <= 0) {
    await repos.orders.setStatus(data.orderId, "closed");
  }

  await repos.events.append({
    actorUserId: data.createdBy,
    type: "order.created",
    payload: { orderId: dst.id, table: src.tableLabel ?? null, splitFrom: data.orderId, itemCount: data.itemIds.length },
  });

  return dst;
}

const AddItemInput = z.object({
  orderId: z.string().min(1),
  productId: z.string().min(1),
  qty: z.number().int().positive(),
  unitPrice: z.number().nonnegative().optional(),
  assignedTo: z.enum(["barista", "shisha"]).optional(),
  notes: z.string().optional(),
  actorUserId: z.string().min(1),
});

export async function addItem(repos: Repos, input: unknown) {
  const data = AddItemInput.parse(input);
  const product = await repos.products.get(data.productId);
  if (!product) throw new Error("Product not found");

  const item = await repos.items.add({
    orderId: data.orderId,
    productId: data.productId,
    qty: data.qty,
    unitPrice: data.unitPrice ?? product.price,
    notes: data.notes,
    assignedTo: data.assignedTo ?? product.targetRole,
  });

  await repos.events.append({
    actorUserId: data.actorUserId,
    type: "order.item_added",
    payload: { orderId: data.orderId, itemId: item.id, productId: data.productId, qty: data.qty },
  });

  return item;
}

const SendItemsInput = z.object({
  orderId: z.string().min(1),
  itemIds: z.array(z.string().min(1)),
  actorUserId: z.string().min(1),
});

export async function sendItems(repos: Repos, input: unknown) {
  const data = SendItemsInput.parse(input);
  const items = await repos.items.listByOrder(data.orderId);

  for (const id of data.itemIds) {
    const it = items.find((x) => x.id === id);
    if (!it) continue;
    if (!canSetItemStatus(it.status, "sent")) continue;
    await repos.items.setStatus(id, "sent");
  }

  await repos.events.append({
    actorUserId: data.actorUserId,
    type: "order.items_sent",
    payload: { orderId: data.orderId, itemIds: data.itemIds },
  });

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Kitchen
// ─────────────────────────────────────────────────────────────────────────────

const SetItemStatusInput = z.object({
  itemId: z.string().min(1),
  to: z.enum(["in_progress", "ready", "served", "cancelled"]),
  actorUserId: z.string().min(1),
});

export async function setItemStatus(repos: Repos, input: unknown) {
  const data = SetItemStatusInput.parse(input);

  const item = await repos.items.get(data.itemId);
  if (!item) throw new Error("Item not found");

  if (!canSetItemStatus(item.status, data.to)) {
    throw new Error(`Invalid transition: ${item.status} -> ${data.to}`);
  }

  await repos.items.setStatus(data.itemId, data.to);

  await repos.events.append({
    actorUserId: data.actorUserId,
    type: "item.status_changed",
    payload: { itemId: data.itemId, from: item.status, to: data.to },
  });

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Billing
// ─────────────────────────────────────────────────────────────────────────────

const AddPaymentInput = z.object({
  orderId: z.string().min(1),
  amount: z.number().positive(),
  receivedBy: z.string().min(1),
});

export async function addPayment(repos: Repos, input: unknown) {
  const data = AddPaymentInput.parse(input);

  // ✅ قواعد منطقية: ممنوع الدفع على فاتورة مقفولة/آجل، وممنوع تكرار الدفع بعد اكتمال السداد
  const inv0 = await repos.billing.getInvoice(data.orderId);
  if (inv0.status === "credit") {
    throw new Error("Invoice is posted to credit; pay through customer ledger");
  }
  const remaining0 = Math.max(inv0.total - inv0.paid, 0);
  if (remaining0 <= 0) {
    throw new Error("Invoice is already fully paid");
  }
  if (data.amount > remaining0) {
    throw new Error(`Amount exceeds remaining (${remaining0})`);
  }

  const p = await repos.billing.addPayment({
    orderId: data.orderId,
    amount: data.amount,
    receivedBy: data.receivedBy,
  });

  // ضمان إغلاق الطلب بعد اكتمال الدفع (حتى لو repo مختلف لاحقًا مثل Supabase)
  const inv1 = await repos.billing.getInvoice(data.orderId);
  if (inv1.status === "paid") {
    await repos.orders.setStatus(data.orderId, "closed");
  }

  await repos.events.append({
    actorUserId: data.receivedBy,
    type: "payment.added",
    payload: { orderId: data.orderId, paymentId: p.id, amount: data.amount },
  });

  return p;
}

const PostOrderToCustomerCreditInput = z.object({
  orderId: z.string().min(1),
  customerId: z.string().min(1),
  note: z.string().optional(),
  actorUserId: z.string().min(1),
});

export async function postOrderToCustomerCredit(repos: Repos, input: unknown) {
  const data = PostOrderToCustomerCreditInput.parse(input);

  await repos.orders.setCustomer(data.orderId, data.customerId);
  const r = await repos.billing.postToCredit({
    orderId: data.orderId,
    customerId: data.customerId,
    note: data.note,
    actorUserId: data.actorUserId,
  });

  await repos.events.append({
    actorUserId: data.actorUserId,
    type: "invoice.posted_to_credit",
    payload: { orderId: data.orderId, customerId: data.customerId, ledgerEntryId: r.entryId },
  });

  return r;
}
