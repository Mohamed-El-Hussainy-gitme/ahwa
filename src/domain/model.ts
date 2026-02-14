export type BaseRole = "owner" | "staff";
export type ShiftRole = "supervisor" | "waiter" | "barista" | "shisha";

export type UserProfile = {
  id: string;
  name: string;
  baseRole: BaseRole;
  isActive: boolean;
  createdAt: number;
};

export type OrderItemStatus = "new" | "sent" | "in_progress" | "ready" | "served" | "cancelled";
export type OrderStatus = "open" | "in_progress" | "ready" | "closed" | "cancelled";

export type Product = {
  id: string;
  name: string;
  // Mobile-first menu categories for speed.
  // NOTE: This is UI-level categorization (hot/cold/fresh) and can later be mapped to Supabase categories table.
  category: "hot" | "cold" | "fresh" | "shisha" | "food" | "other";
  price: number;
  targetRole: "barista" | "shisha"; // لتوجيه item تلقائيًا
  isArchived?: boolean;
};

export type Customer = { id: string; name: string; phone?: string };

export type Shift = {
  id: string;
  startedAt: number;
  kind: "morning" | "evening";
  isOpen: boolean;
  supervisorUserId: string;
  assignments: Array<{ userId: string; role: ShiftRole }>;
  endedAt?: number;
  endedBy?: string;
};

export type Order = {
  id: string;
  tableLabel?: string;
  createdAt: number;
  createdBy: string;
  status: OrderStatus;
  customerId?: string; // لو هترحل على زبون
};

export type OrderItem = {
  id: string;
  orderId: string;
  productId: string;
  qty: number;
  unitPrice: number; // snapshot
  notes?: string;
  assignedTo: "barista" | "shisha";
  status: OrderItemStatus;
  createdAt: number;
};

export type Invoice = {
  orderId: string;
  subtotal: number;
  discount: number; // يدوي
  total: number;
  paid: number;
  status: "open" | "paid" | "credit";
};

export type Payment = {
  id: string;
  orderId: string;
  amount: number;
  receivedBy: string;
  receivedAt: number;
};

export type LedgerEntry = {
  id: string;
  at: number;
  customerId: string;
  kind: "charge" | "payment";
  amount: number; // always positive
  note?: string;
  orderId?: string;
  actorUserId?: string;
};

export type ActivityEvent = {
  id: string;
  at: number;
  actorUserId?: string;
  type:
    | "shift.opened"
    | "shift.closed"
    | "shift.assignments_updated"
    | "staff.created"
    | "staff.archived"
    | "staff.updated"
    | "product.created"
    | "product.updated"
    | "product.archived"
    | "return.recorded"
    | "order.created"
    | "order.item_added"
    | "order.items_sent"
    | "item.status_changed"
    | "invoice.discount_applied"
    | "payment.added"
    | "invoice.posted_to_credit"
    | "customer.created"
    | "ledger.charge"
    | "ledger.payment";
  payload: Record<string, unknown>;
};
