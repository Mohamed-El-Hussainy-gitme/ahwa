import { ActivityEvent, Customer, Invoice, LedgerEntry, Order, OrderItem, Payment, Product, Shift, UserProfile } from "@/domain/model";

export type Repos = {
  staff: {
    list(): Promise<UserProfile[]>;
    get(id: string): Promise<UserProfile | null>;
    create(input: Pick<UserProfile, "name" | "baseRole">): Promise<UserProfile>;
    update(id: string, patch: Partial<Pick<UserProfile, "name" | "baseRole" | "isActive">>): Promise<UserProfile>;
    archive(id: string): Promise<void>;
  };

  shifts: {
    openShift(input: Omit<Shift, "id" | "startedAt" | "isOpen" | "endedAt" | "endedBy">): Promise<Shift>;
    getOpenShift(): Promise<Shift | null>;
    updateOpenShift(input: Pick<Shift, "kind" | "supervisorUserId" | "assignments">): Promise<Shift>;
    closeShift(input: { endedBy: string }): Promise<Shift>;
    listHistory(): Promise<Shift[]>;
  };

  products: {
    list(): Promise<Product[]>;
    get(id: string): Promise<Product | null>;
    create(input: Omit<Product, "id">): Promise<Product>;
    update(id: string, patch: Partial<Omit<Product, "id">>): Promise<Product>;
    archive(id: string): Promise<void>;
  };

  customers: {
    list(): Promise<Customer[]>;
    get(id: string): Promise<Customer | null>;
    create(input: Omit<Customer, "id">): Promise<Customer>;
  };

  orders: {
    create(input: Omit<Order, "id" | "createdAt" | "status">): Promise<Order>;
    get(orderId: string): Promise<Order | null>;
    listOpen(): Promise<Order[]>;
    /** For billing/history views (may include closed orders). */
    listAll(): Promise<Order[]>;
    setStatus(orderId: string, status: Order["status"]): Promise<void>;
    setCustomer(orderId: string, customerId: string | null): Promise<void>;
  };

  items: {
    add(input: Omit<OrderItem, "id" | "createdAt" | "status">): Promise<OrderItem>;
    get(itemId: string): Promise<OrderItem | null>;
    listByOrder(orderId: string): Promise<OrderItem[]>;
    listByRole(role: "barista" | "shisha"): Promise<OrderItem[]>;
    setStatus(itemId: string, status: OrderItem["status"]): Promise<void>;
    /** Move an item to a different order (used for split billing). */
    moveToOrder(itemId: string, toOrderId: string): Promise<void>;
  };

  billing: {
    getInvoice(orderId: string): Promise<Invoice>;
    applyDiscount(orderId: string, discount: number): Promise<Invoice>;
    addPayment(input: Omit<Payment, "id" | "receivedAt">): Promise<Payment>;
    listPayments(orderId: string): Promise<Payment[]>;
    postToCredit(input: {
      orderId: string;
      customerId: string;
      note?: string;
      actorUserId?: string;
    }): Promise<{ ok: true; entryId: string }>;
  };

  ledger: {
    listByCustomer(customerId: string): Promise<LedgerEntry[]>;
    getBalance(customerId: string): Promise<number>;
    addCharge(input: Omit<LedgerEntry, "id" | "at" | "kind"> & { kind?: "charge" }): Promise<LedgerEntry>;
    addPayment(input: Omit<LedgerEntry, "id" | "at" | "kind"> & { kind?: "payment" }): Promise<LedgerEntry>;
  };

  events: {
    append(e: Omit<ActivityEvent, "id" | "at">): Promise<ActivityEvent>;
    listRecent(): Promise<ActivityEvent[]>;
  };
};
