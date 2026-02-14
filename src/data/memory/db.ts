import type {
  ActivityEvent,
  Customer,
  Invoice,
  LedgerEntry,
  Order,
  OrderItem,
  Payment,
  Product,
  Shift,
  UserProfile,
} from "@/domain/model";

type PersistedMem = {
  shift: Shift | null;
  shiftHistory: Shift[];
  staff: UserProfile[];
  products: Product[];
  customers: Customer[];
  orders: Order[];
  items: OrderItem[];
  payments: Payment[];
  invoices: Array<[string, Invoice]>;
  ledger: LedgerEntry[];
  events: ActivityEvent[];
};

// Runtime state (has Map for invoices). We keep it typed broadly to avoid
// literal-type narrowing that breaks assignment when hydrating from storage.
type MemState = Omit<PersistedMem, "invoices"> & { invoices: Map<string, Invoice> };

const STORAGE_KEY = "ahwa.mem.v1";
let loaded = false;

export const mem: MemState = {
  shift: null as Shift | null,
  shiftHistory: [] as Shift[],

  // Employees (company-style login)
  staff: [{ id: "u-owner-1", name: "المعلم", baseRole: "owner", isActive: true, createdAt: Date.now() }],

  // Menu
  products: [
    { id: "p1", name: "شاي", category: "hot", price: 20, targetRole: "barista" },
    { id: "p2", name: "قهوة", category: "hot", price: 25, targetRole: "barista" },
    { id: "p3", name: "شيشة تفاحتين", category: "shisha", price: 80, targetRole: "shisha" },
    { id: "p4", name: "نسكافيه", category: "hot", price: 30, targetRole: "barista" },
    // "الحجر" = رأس معسل (وحدة إضافات الشيشة)
    { id: "p5", name: "حجر معسل", category: "shisha", price: 15, targetRole: "shisha" },
  ],

  customers: [
    { id: "c1", name: "عم سيد", phone: "01000000000" },
    { id: "c2", name: "أ/ هاني", phone: "01111111111" },
  ],

  orders: [] as Order[],
  items: [] as OrderItem[],
  payments: [] as Payment[],
  invoices: new Map<string, Invoice>(),
  ledger: [] as LedgerEntry[],
  events: [] as ActivityEvent[],
};

export function uid() {
  // Prefer crypto UUID when available
  const c = typeof globalThis !== "undefined" ? (globalThis.crypto as Crypto | undefined) : undefined;
  if (c?.randomUUID) return c.randomUUID();
  return Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);
}

function canUseStorage() {
  return typeof window !== "undefined" && !!window.localStorage;
}

function toPersisted(): PersistedMem {
  return {
    shift: mem.shift,
    shiftHistory: mem.shiftHistory,
    staff: mem.staff,
    products: mem.products,
    customers: mem.customers,
    orders: mem.orders,
    items: mem.items,
    payments: mem.payments,
    invoices: Array.from(mem.invoices.entries()),
    ledger: mem.ledger,
    events: mem.events,
  };
}

function applyPersisted(p: PersistedMem) {
  mem.shift = p.shift;
  mem.shiftHistory = p.shiftHistory ?? [];
  mem.staff = p.staff ?? mem.staff;
  mem.products = p.products ?? mem.products;

  // --- Legacy migration (v1 -> v2 menu categories)
  // Older builds used category: "coffee". We map it to "hot" to keep old data visible.
  for (const prod of mem.products as unknown as Array<Record<string, unknown>>) {
    if (prod["category"] === "coffee") prod["category"] = "hot";
  }
  mem.customers = p.customers ?? mem.customers;
  mem.orders = p.orders ?? [];
  mem.items = p.items ?? [];
  mem.payments = p.payments ?? [];
  mem.invoices = new Map(p.invoices ?? []);
  mem.ledger = p.ledger ?? [];
  mem.events = p.events ?? [];
}

export function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  if (!canUseStorage()) return;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as PersistedMem;
    applyPersisted(parsed);
  } catch {
    // ignore corruption
  }
}

export function persist() {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersisted()));
  } catch {
    // ignore quota
  }
}
