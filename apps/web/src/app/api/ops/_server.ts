import { supabaseAdminForDatabase } from '@/lib/supabase/admin';
import type {
  BillingExtrasSettings,
  BillingSession,
  BillableItem,
  ComplaintItemCandidate,
  ComplaintRecord,
  ComplaintsWorkspace,
  DashboardWorkspace,
  OpsNavSummary,
  OpsQueueHealth,
  DeferredCustomerLedgerWorkspace,
  DeferredCustomerSummary,
  DeferredLedgerEntry,
  MenuWorkspace,
  MenuAddon,
  ProductAddonLink,
  OpsProduct,
  OpsSection,
  OpsSessionSummary,
  OpsShift,
  ReadyItem,
  SessionOrderItem,
  StationCode,
  StationQueueItem,
  StationWorkspace,
  WaiterWorkspace,
  WaiterCatalogWorkspace,
  WaiterLiveWorkspace,
  BillingWorkspace,
} from '@/lib/ops/types';
import { normalizeNullableStationCode, normalizeStationCode } from '@/lib/ops/stations';

type WaiterWorkspaceScope = {
  productStationCodes?: readonly StationCode[] | null;
  readyStationCodes?: readonly StationCode[] | null;
  sessionItemStationCodes?: readonly StationCode[] | null;
  includeCatalog?: boolean;
  includeSessionItems?: boolean;
  includeReadyItems?: boolean;
};

type ComplaintsWorkspaceScope = {
  itemStationCodes?: readonly StationCode[] | null;
};

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const opsMemoryCache = new Map<string, CacheEntry<unknown>>();
const MENU_WORKSPACE_CACHE_TTL_MS = 60_000;
const ACTIVE_MENU_CACHE_TTL_MS = 30_000;
const BILLING_SETTINGS_CACHE_TTL_MS = 15_000;
const DEFERRED_SUMMARY_CACHE_TTL_MS = 10_000;
const ORDER_NOTE_PRESETS_CACHE_TTL_MS = 15_000;

async function readThroughCache<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const cached = opsMemoryCache.get(key) as CacheEntry<T> | undefined;
  if (cached && cached.expiresAt > now) return cached.value;
  const value = await loader();
  opsMemoryCache.set(key, { value, expiresAt: now + ttlMs });
  return value;
}

function cacheKey(prefix: string, cafeId: string, databaseKey: string) {
  return `${prefix}:${databaseKey}:${cafeId}`;
}

export type BoundOperationalDatabaseContext = {
  cafeId: string;
  databaseKey: string;
};

export function bindOperationalRequestContext(context: BoundOperationalDatabaseContext): BoundOperationalDatabaseContext {
  return context;
}

export function getBoundOperationalRequestContext(): BoundOperationalDatabaseContext | null {
  return null;
}

export function requireBoundOperationalDatabaseKey(where = 'requireBoundOperationalDatabaseKey'): never {
  throw new Error(`[${where}] EXPLICIT_DATABASE_KEY_REQUIRED`);
}

export function adminOps(databaseKey: string) {
  const normalizedDatabaseKey = databaseKey.trim();
  if (!normalizedDatabaseKey) {
    throw new Error('[adminOps] EXPLICIT_DATABASE_KEY_REQUIRED');
  }
  return supabaseAdminForDatabase(normalizedDatabaseKey).schema('ops');
}

export function normalizeShift(row: any | null): OpsShift | null {
  if (!row) return null;
  return {
    id: String(row.id),
    kind: String(row.shift_kind ?? row.kind ?? ''),
    status: String(row.status ?? ''),
    openedAt: String(row.opened_at ?? row.openedAt ?? new Date().toISOString()),
  };
}

async function loadOpenShift(cafeId: string, databaseKey: string): Promise<OpsShift | null> {
  const { data, error } = await adminOps(databaseKey)
    .from('shifts')
    .select('id, shift_kind, status, opened_at')
    .eq('cafe_id', cafeId)
    .eq('status', 'open')
    .order('opened_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return normalizeShift(data ?? null);
}

function normalizeOpenSession(row: any): OpsSessionSummary {
  return {
    id: String(row.id ?? ''),
    label: String(row.session_label ?? row.label ?? ''),
    status: String(row.status ?? 'open'),
    openedAt: String(row.opened_at ?? row.openedAt ?? new Date().toISOString()),
    billableCount: Number(row.billableCount ?? 0),
    readyCount: Number(row.readyCount ?? 0),
  };
}

async function loadOpenSessions(cafeId: string, shiftId: string, databaseKey: string): Promise<OpsSessionSummary[]> {
  const { data, error } = await adminOps(databaseKey)
    .from('service_sessions')
    .select('id, session_label, status, opened_at')
    .eq('cafe_id', cafeId)
    .eq('shift_id', shiftId)
    .eq('status', 'open')
    .order('opened_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => normalizeOpenSession(row));
}

function normalizeOrderNotePreset(value: unknown): string | null {
  const normalized = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || null;
}

async function loadOrderNotePresets(
  cafeId: string,
  databaseKey: string,
  allowedStationCodes?: readonly StationCode[] | null,
): Promise<string[]> {
  const stationCodes = (allowedStationCodes ?? []).filter(Boolean).sort();
  const scopedKey = stationCodes.length ? stationCodes.join(',') : 'all';

  return readThroughCache(cacheKey(`order-note-presets:${scopedKey}`, cafeId, databaseKey), ORDER_NOTE_PRESETS_CACHE_TTL_MS, async () => {
    let query = adminOps(databaseKey)
      .from('order_note_presets')
      .select('note_text, station_code, usage_count, last_used_at')
      .eq('cafe_id', cafeId)
      .eq('is_active', true)
      .order('usage_count', { ascending: false })
      .order('last_used_at', { ascending: false })
      .limit(8);

    if (stationCodes.length) {
      query = query.or(`station_code.is.null,station_code.in.(${stationCodes.join(',')})`);
    }

    const { data, error } = await query;
    if (error) throw error;

    const seen = new Set<string>();
    const presets: string[] = [];
    for (const row of data ?? []) {
      const normalized = normalizeOrderNotePreset((row as any)?.note_text);
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      presets.push(normalized);
    }
    return presets;
  });
}

export async function listBillableRows(cafeId: string, databaseKey: string, shiftId?: string | null, openSessionIds?: string[]): Promise<BillableItem[]> {
  const admin = adminOps(databaseKey);
  if (!shiftId) return [];
  if (Array.isArray(openSessionIds) && openSessionIds.length === 0) return [];

  let query = admin
    .from('order_items')
    .select('id, service_session_id, unit_price, qty_delivered, qty_paid, qty_deferred, qty_waived, notes, created_at, menu_products!inner(product_name), service_sessions!inner(session_label)')
    .eq('cafe_id', cafeId)
    .eq('shift_id', shiftId)
    .order('created_at', { ascending: true });

  if (Array.isArray(openSessionIds) && openSessionIds.length > 0) {
    query = query.in('service_session_id', openSessionIds);
  }

  const { data } = await query;
  return (data ?? [])
    .map((row: any) => {
      const qtyBillable = Math.max(
        Number(row.qty_delivered ?? 0) - Number(row.qty_paid ?? 0) - Number(row.qty_deferred ?? 0) - Number(row.qty_waived ?? 0),
        0,
      );
      return {
        orderItemId: String(row.id),
        serviceSessionId: String(row.service_session_id),
        sessionLabel: String(row.service_sessions?.session_label ?? ''),
        productName: String(row.menu_products?.product_name ?? ''),
        unitPrice: Number(row.unit_price ?? 0),
        qtyBillable,
        qtyDelivered: Number(row.qty_delivered ?? 0),
        qtyPaid: Number(row.qty_paid ?? 0),
        qtyDeferred: Number(row.qty_deferred ?? 0),
        qtyWaived: Number(row.qty_waived ?? 0),
        notes: row.notes ? String(row.notes) : null,
      } satisfies BillableItem;
    })
    .filter((row) => row.qtyBillable > 0);
}

async function loadMenuWorkspaceCatalog(cafeId: string, databaseKey: string): Promise<Pick<MenuWorkspace, 'sections' | 'products' | 'addons' | 'productAddonLinks'>> {
  return readThroughCache(cacheKey('menu-workspace', cafeId, databaseKey), MENU_WORKSPACE_CACHE_TTL_MS, async () => {
    const admin = adminOps(databaseKey);
    const [
      { data: sections, error: sectionsError },
      { data: products, error: productsError },
      { data: addons, error: addonsError },
      { data: productAddonLinks, error: productAddonLinksError },
    ] = await Promise.all([
      admin.from('menu_sections').select('id, title, station_code, sort_order, is_active').eq('cafe_id', cafeId).order('sort_order', { ascending: true }),
      admin.from('menu_products').select('id, section_id, product_name, station_code, unit_price, sort_order, is_active').eq('cafe_id', cafeId).order('section_id', { ascending: true }).order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
      admin.from('menu_addons').select('id, addon_name, station_code, unit_price, sort_order, is_active').eq('cafe_id', cafeId).order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
      admin.from('menu_product_addons').select('menu_product_id, menu_addon_id').eq('cafe_id', cafeId),
    ]);
    if (sectionsError) throw sectionsError;
    if (productsError) throw productsError;
    if (addonsError) throw addonsError;
    if (productAddonLinksError) throw productAddonLinksError;
    return {
      sections: (sections ?? []).map((row: any) => ({ id: String(row.id), title: String(row.title), stationCode: normalizeStationCode(row.station_code), sortOrder: Number(row.sort_order ?? 0), isActive: Boolean(row.is_active) }) satisfies OpsSection),
      products: (products ?? []).map((row: any) => ({ id: String(row.id), sectionId: String(row.section_id), name: String(row.product_name), stationCode: normalizeStationCode(row.station_code), unitPrice: Number(row.unit_price ?? 0), sortOrder: Number(row.sort_order ?? 0), isActive: Boolean(row.is_active) }) satisfies OpsProduct),
      addons: (addons ?? []).map((row: any) => ({ id: String(row.id), name: String(row.addon_name), stationCode: normalizeStationCode(row.station_code), unitPrice: Number(row.unit_price ?? 0), sortOrder: Number(row.sort_order ?? 0), isActive: Boolean(row.is_active) }) satisfies MenuAddon),
      productAddonLinks: (productAddonLinks ?? []).map((row: any) => ({ productId: String(row.menu_product_id), addonId: String(row.menu_addon_id) }) satisfies ProductAddonLink),
    };
  });
}

async function loadActiveMenuCatalog(cafeId: string, databaseKey: string): Promise<Pick<MenuWorkspace, 'sections' | 'products' | 'addons' | 'productAddonLinks'>> {
  return readThroughCache(cacheKey('active-menu', cafeId, databaseKey), ACTIVE_MENU_CACHE_TTL_MS, async () => {
    const workspace = await loadMenuWorkspaceCatalog(cafeId, databaseKey);
    const sections = workspace.sections.filter((row) => row.isActive);
    const allowedSectionIds = new Set(sections.map((row) => row.id));
    const products = workspace.products.filter((row) => row.isActive && allowedSectionIds.has(row.sectionId));
    const productIds = new Set(products.map((row) => row.id));
    const addons = workspace.addons.filter((row) => row.isActive);
    const addonIds = new Set(addons.map((row) => row.id));
    const productAddonLinks = workspace.productAddonLinks.filter((row) => productIds.has(row.productId) && addonIds.has(row.addonId));
    return { sections, products, addons, productAddonLinks };
  });
}

export async function buildMenuWorkspace(cafeId: string, databaseKey: string): Promise<MenuWorkspace> {
  const [catalog, billingSettings] = await Promise.all([
    loadMenuWorkspaceCatalog(cafeId, databaseKey),
    loadBillingSettings(cafeId, databaseKey),
  ]);

  return { sections: catalog.sections, products: catalog.products, addons: catalog.addons, productAddonLinks: catalog.productAddonLinks, billingSettings };
}


export async function loadBillingSettings(cafeId: string, databaseKey: string): Promise<BillingExtrasSettings> {
  return readThroughCache(cacheKey('billing-settings', cafeId, databaseKey), BILLING_SETTINGS_CACHE_TTL_MS, async () => {
    const { data, error } = await adminOps(databaseKey)
      .from('cafe_billing_settings')
      .select('tax_enabled, tax_rate, service_enabled, service_rate')
      .eq('cafe_id', cafeId)
      .maybeSingle();

    if (error) throw error;

    return {
      taxEnabled: Boolean(data?.tax_enabled),
      taxRate: Number(data?.tax_rate ?? 0),
      serviceEnabled: Boolean(data?.service_enabled),
      serviceRate: Number(data?.service_rate ?? 0),
    } satisfies BillingExtrasSettings;
  });
}

function allowStationCode(stationCode: StationCode, allowed: readonly StationCode[] | null | undefined) {
  return !allowed || allowed.includes(stationCode);
}

export async function buildWaiterWorkspace(
  cafeId: string,
  databaseKey: string,
  scope: WaiterWorkspaceScope = {},
): Promise<WaiterWorkspace> {
  const admin = adminOps(databaseKey);
  const normalizedShift = await loadOpenShift(cafeId, databaseKey);
  const includeCatalog = scope.includeCatalog !== false;
  const includeSessionItems = scope.includeSessionItems !== false;
  const includeReadyItems = scope.includeReadyItems !== false;
  const sessions = normalizedShift ? await loadOpenSessions(cafeId, normalizedShift.id, databaseKey) : [];
  const notePresets = await loadOrderNotePresets(cafeId, databaseKey, scope.sessionItemStationCodes ?? scope.productStationCodes ?? null);

  let sections: OpsSection[] = [];
  let products: OpsProduct[] = [];
  let addons: MenuAddon[] = [];
  let productAddonLinks: ProductAddonLink[] = [];
  if (includeCatalog) {
    const catalog = await loadActiveMenuCatalog(cafeId, databaseKey);
    sections = catalog.sections.filter((row) => allowStationCode(row.stationCode, scope.productStationCodes));
    const allowedSectionIds = new Set(sections.map((row) => row.id));
    products = catalog.products.filter((row) => allowStationCode(row.stationCode, scope.productStationCodes) && allowedSectionIds.has(row.sectionId));
    const productIds = new Set(products.map((row) => row.id));
    addons = catalog.addons.filter((row) => allowStationCode(row.stationCode, scope.productStationCodes));
    const addonIds = new Set(addons.map((row) => row.id));
    productAddonLinks = catalog.productAddonLinks.filter((row) => productIds.has(row.productId) && addonIds.has(row.addonId));
  }

  const openSessionIds = sessions.map((session: any) => String(session.id));
  const openSessionIdsSet = new Set(openSessionIds);

  let itemRows: any[] = [];
  if (normalizedShift && openSessionIds.length > 0 && (includeSessionItems || includeReadyItems)) {
    const { data, error } = await admin
      .from('order_items')
      .select('id, service_session_id, station_code, unit_price, qty_total, qty_ready, qty_delivered, qty_replacement_delivered, qty_paid, qty_deferred, qty_waived, qty_remade, qty_cancelled, notes, created_at, menu_products!inner(product_name), service_sessions!inner(session_label)')
      .eq('cafe_id', cafeId)
      .eq('shift_id', normalizedShift.id)
      .in('service_session_id', openSessionIds)
      .order('created_at', { ascending: true });
    if (error) throw error;
    itemRows = (data ?? []) as any[];
  }

  const sessionItems: SessionOrderItem[] = includeSessionItems
    ? itemRows
        .filter((row) => openSessionIdsSet.has(String(row.service_session_id ?? '')))
        .filter((row) => allowStationCode(normalizeStationCode(row.station_code), scope.sessionItemStationCodes))
        .map((row: any) => {
          const qtyReady = Number(row.qty_ready ?? 0);
          const qtyTotal = Number(row.qty_total ?? 0);
          const qtyCancelled = Number(row.qty_cancelled ?? 0);
          const qtyDelivered = Number(row.qty_delivered ?? 0);
          const qtyReplacementDelivered = Number(row.qty_replacement_delivered ?? 0);
          const qtyPaid = Number(row.qty_paid ?? 0);
          const qtyDeferred = Number(row.qty_deferred ?? 0);
          const qtyWaived = Number(row.qty_waived ?? 0);
          const qtyRemade = Number(row.qty_remade ?? 0);
          const totalOriginalReady = Math.min(qtyReady, Math.max(qtyTotal - qtyCancelled, 0));
          const qtyReadyForNormalDelivery = Math.max(totalOriginalReady - qtyDelivered, 0);
          const qtyReadyForReplacementDelivery = Math.max(qtyReady - totalOriginalReady - qtyReplacementDelivered, 0);
          const qtyReadyForDelivery = qtyReadyForNormalDelivery + qtyReadyForReplacementDelivery;
          const availableRemakeQty = Math.max(qtyDelivered + qtyReplacementDelivered - qtyRemade, 0);
          return {
            orderItemId: String(row.id),
            serviceSessionId: String(row.service_session_id),
            sessionLabel: String(row.service_sessions?.session_label ?? ''),
            productName: String(row.menu_products?.product_name ?? ''),
            stationCode: normalizeStationCode(row.station_code),
            unitPrice: Number(row.unit_price ?? 0),
            qtyTotal,
            qtyReady,
            qtyDelivered,
            qtyReplacementDelivered,
            qtyPaid,
            qtyDeferred,
            qtyWaived,
            qtyRemade,
            qtyCancelled,
            qtyReadyForDelivery,
            qtyReadyForReplacementDelivery,
            availableRemakeQty,
            createdAt: String(row.created_at),
            notes: row.notes ? String(row.notes) : null,
          } satisfies SessionOrderItem;
        })
    : [];

  const readyItems: ReadyItem[] = includeReadyItems
    ? itemRows
        .filter((row) => openSessionIdsSet.has(String(row.service_session_id ?? '')))
        .filter((row) => allowStationCode(normalizeStationCode(row.station_code), scope.readyStationCodes))
        .map((row: any) => {
          const qtyReady = Number(row.qty_ready ?? 0);
          const qtyTotal = Number(row.qty_total ?? 0);
          const qtyCancelled = Number(row.qty_cancelled ?? 0);
          const qtyDelivered = Number(row.qty_delivered ?? 0);
          const qtyReplacementDelivered = Number(row.qty_replacement_delivered ?? 0);
          const totalOriginalReady = Math.min(qtyReady, Math.max(qtyTotal - qtyCancelled, 0));
          const qtyReadyForNormalDelivery = Math.max(totalOriginalReady - qtyDelivered, 0);
          const qtyReadyForReplacementDelivery = Math.max(qtyReady - totalOriginalReady - qtyReplacementDelivered, 0);
          const qtyReadyForDelivery = qtyReadyForNormalDelivery + qtyReadyForReplacementDelivery;
          return {
            orderItemId: String(row.id),
            serviceSessionId: String(row.service_session_id),
            sessionLabel: String(row.service_sessions?.session_label ?? ''),
            productName: String(row.menu_products?.product_name ?? ''),
            stationCode: normalizeStationCode(row.station_code),
            qtyReadyForNormalDelivery,
            qtyReadyForReplacementDelivery,
            qtyReadyForDelivery,
            createdAt: String(row.created_at),
            notes: row.notes ? String(row.notes) : null,
          } satisfies ReadyItem;
        })
        .filter((row) => row.qtyReadyForDelivery > 0 || row.qtyReadyForReplacementDelivery > 0)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    : [];

  return { shift: normalizedShift, sessions, sections, products, addons, productAddonLinks, sessionItems, readyItems, notePresets };
}

export async function buildReadyItemsWorkspace(cafeId: string, databaseKey: string, scope: WaiterWorkspaceScope = {}): Promise<ReadyItem[]> {
  const workspace = await buildWaiterWorkspace(cafeId, databaseKey, {
    ...scope,
    includeCatalog: false,
    includeSessionItems: false,
    includeReadyItems: true,
  });
  return workspace.readyItems;
}

export async function buildWaiterCatalogWorkspace(cafeId: string, databaseKey: string, scope: WaiterWorkspaceScope = {}): Promise<WaiterCatalogWorkspace> {
  const catalog = await loadActiveMenuCatalog(cafeId, databaseKey);
  const sections = catalog.sections.filter((row) => allowStationCode(row.stationCode, scope.productStationCodes));
  const allowedSectionIds = new Set(sections.map((row) => row.id));
  const products = catalog.products.filter((row) => allowStationCode(row.stationCode, scope.productStationCodes) && allowedSectionIds.has(row.sectionId));
  const productIds = new Set(products.map((row) => row.id));
  const addons = catalog.addons.filter((row) => allowStationCode(row.stationCode, scope.productStationCodes));
  const addonIds = new Set(addons.map((row) => row.id));
  const productAddonLinks = catalog.productAddonLinks.filter((row) => productIds.has(row.productId) && addonIds.has(row.addonId));
  return { sections, products, addons, productAddonLinks };
}

export async function buildWaiterLiveWorkspace(cafeId: string, databaseKey: string, scope: WaiterWorkspaceScope = {}): Promise<WaiterLiveWorkspace> {
  const workspace = await buildWaiterWorkspace(cafeId, databaseKey, {
    ...scope,
    includeCatalog: false,
    includeSessionItems: true,
    includeReadyItems: true,
  });
  return { shift: workspace.shift, sessions: workspace.sessions, sessionItems: workspace.sessionItems, readyItems: workspace.readyItems, notePresets: workspace.notePresets };
}

export async function buildStationWorkspace(cafeId: string, stationCode: StationCode, databaseKey: string): Promise<StationWorkspace> {
  const admin = adminOps(databaseKey);
  const normalizedShift = await loadOpenShift(cafeId, databaseKey);
  let rows: any[] = [];
  if (normalizedShift) {
    const openSessions = await loadOpenSessions(cafeId, normalizedShift.id, databaseKey);
    const openSessionIds = openSessions.map((row: any) => String(row.id));
    if (openSessionIds.length > 0) {
      const { data, error } = await admin
        .from('order_items')
        .select('id, service_session_id, station_code, qty_total, qty_submitted, qty_ready, qty_delivered, qty_replacement_delivered, qty_remade, qty_cancelled, notes, created_at, menu_products!inner(product_name), service_sessions!inner(session_label)')
        .eq('cafe_id', cafeId)
        .eq('shift_id', normalizedShift.id)
        .eq('station_code', stationCode)
        .in('service_session_id', openSessionIds)
        .order('created_at', { ascending: true });
      if (error) throw error;
      rows = (data ?? []) as any[];
    }
  }
  const queue: StationQueueItem[] = (rows ?? [])
    .map((row: any) => {
      const qtyWaitingOriginal = Math.max(
        Number(row.qty_submitted ?? 0) - Math.min(Number(row.qty_ready ?? 0), Number(row.qty_submitted ?? 0)) - Number(row.qty_cancelled ?? 0),
        0,
      );
      const qtyWaitingReplacement = Math.max(
        Number(row.qty_remade ?? 0) - Math.max(Number(row.qty_ready ?? 0) - Math.min(Number(row.qty_ready ?? 0), Number(row.qty_submitted ?? 0)), 0),
        0,
      );
      const qtyWaiting = qtyWaitingOriginal + qtyWaitingReplacement;
      return {
        orderItemId: String(row.id),
        serviceSessionId: String(row.service_session_id),
        sessionLabel: String(row.service_sessions?.session_label ?? ''),
        productName: String(row.menu_products?.product_name ?? ''),
        stationCode: normalizeStationCode(row.station_code),
        qtyWaitingOriginal,
        qtyWaitingReplacement,
        qtyWaiting,
        qtyReady: Number(row.qty_ready ?? 0),
        qtyDelivered: Number(row.qty_delivered ?? 0),
        qtyReplacementDelivered: Number(row.qty_replacement_delivered ?? 0),
        createdAt: String(row.created_at),
        notes: row.notes ? String(row.notes) : null,
      };
    })
    .filter((row) => row.qtyWaiting > 0);
  return { shift: normalizedShift, stationCode, queue };
}

type DeferredCustomerSummaryRow = {
  debtor_name: string;
  entry_count: number | string | null;
  debt_total: number | string | null;
  repayment_total: number | string | null;
  balance: number | string | null;
  last_entry_at: string | null;
  last_debt_at: string | null;
  last_repayment_at: string | null;
  last_entry_kind: string | null;
};

type RuntimeContractScope = 'core' | 'reporting';

type RuntimeContractCache = {
  checkedAt: number;
  promise: Promise<void>;
};

const RUNTIME_CONTRACT_TTL_MS = 60_000;
const runtimeContractCache = new Map<string, RuntimeContractCache>();

async function runRuntimeContractCheck(scope: RuntimeContractScope, databaseKey: string): Promise<void> {
  const { error } = await supabaseAdminForDatabase(databaseKey).rpc('ops_assert_runtime_contract', {
    p_require_reporting: scope === 'reporting',
  });
  if (error) throw error;
}

export async function ensureRuntimeContract(scope: RuntimeContractScope, databaseKey: string): Promise<void> {
  const normalizedDatabaseKey = databaseKey.trim();
  const cacheKey = `${scope}:${normalizedDatabaseKey}`;
  const now = Date.now();
  const cached = runtimeContractCache.get(cacheKey);
  if (cached && now - cached.checkedAt < RUNTIME_CONTRACT_TTL_MS) {
    return cached.promise;
  }

  const promise = runRuntimeContractCheck(scope, normalizedDatabaseKey).catch((error) => {
    runtimeContractCache.delete(cacheKey);
    throw error;
  });

  runtimeContractCache.set(cacheKey, {
    checkedAt: now,
    promise,
  });

  await promise;
}

async function loadDeferredCustomerSummaryRows(cafeId: string, databaseKey: string): Promise<DeferredCustomerSummaryRow[]> {
  return readThroughCache(cacheKey('deferred-summary', cafeId, databaseKey), DEFERRED_SUMMARY_CACHE_TTL_MS, async () => {
    const { data, error } = await adminOps(databaseKey)
      .from('deferred_customer_balances')
      .select('debtor_name, entry_count, debt_total, repayment_total, balance, last_entry_at, last_debt_at, last_repayment_at, last_entry_kind')
      .eq('cafe_id', cafeId)
      .order('balance', { ascending: false })
      .order('last_entry_at', { ascending: false })
      .order('debtor_name', { ascending: true });

    if (error) throw error;
    return (data ?? []) as DeferredCustomerSummaryRow[];
  });
}

export async function buildBillingWorkspace(cafeId: string, databaseKey: string): Promise<BillingWorkspace> {
  await ensureRuntimeContract('core', databaseKey);

  const normalizedShift = await loadOpenShift(cafeId, databaseKey);
  const openSessionIds = normalizedShift
    ? (await loadOpenSessions(cafeId, normalizedShift.id, databaseKey)).map((row: any) => String(row.id))
    : [];

  const [items, deferredSummaries, billingSettings] = await Promise.all([
    listBillableRows(cafeId, databaseKey, normalizedShift?.id ?? null, openSessionIds),
    loadDeferredCustomerSummaryRows(cafeId, databaseKey),
    loadBillingSettings(cafeId, databaseKey),
  ]);
  const bySession = new Map<string, BillingSession>();
  for (const item of items) {
    const key = item.serviceSessionId;
    const current = bySession.get(key) ?? {
      sessionId: item.serviceSessionId,
      sessionLabel: item.sessionLabel,
      items: [],
      totalBillableAmount: 0,
      totalBillableQty: 0,
    };
    current.items.push(item);
    current.totalBillableQty += item.qtyBillable;
    current.totalBillableAmount += item.qtyBillable * item.unitPrice;
    bySession.set(key, current);
  }
  const deferredNames = deferredSummaries
    .map((row) => String(row.debtor_name ?? '').trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, 'ar'));

  return { shift: normalizedShift, sessions: Array.from(bySession.values()), deferredNames, billingSettings };
}


type DeferredDerivedState = {
  status: DeferredCustomerSummary['status'];
  agingBucket: DeferredCustomerSummary['agingBucket'];
  ageDays: number | null;
};

function startOfUtcDay(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

const STALLED_SESSION_THRESHOLD_MINUTES = 15;

function minutesSince(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.max(Math.floor((Date.now() - parsed.getTime()) / 60_000), 0);
}

function maxIso(left: string | null | undefined, right: string | null | undefined): string | null {
  if (!left) return right ?? null;
  if (!right) return left;
  return left >= right ? left : right;
}

function computeDeferredDerivedState(balance: number, lastDebtAt: string | null): DeferredDerivedState {
  if (balance <= 0) {
    return { status: 'settled', agingBucket: 'settled', ageDays: null };
  }

  if (!lastDebtAt) {
    return { status: 'active', agingBucket: 'today', ageDays: 0 };
  }

  const parsed = new Date(lastDebtAt);
  if (Number.isNaN(parsed.getTime())) {
    return { status: 'active', agingBucket: 'today', ageDays: 0 };
  }

  const now = new Date();
  const ageDays = Math.max(Math.floor((startOfUtcDay(now) - startOfUtcDay(parsed)) / 86_400_000), 0);

  if (ageDays >= 7) {
    return { status: 'late', agingBucket: 'older', ageDays };
  }

  if (ageDays >= 4) {
    return { status: 'active', agingBucket: 'week', ageDays };
  }

  if (ageDays >= 1) {
    return { status: 'active', agingBucket: 'three_days', ageDays };
  }

  return { status: 'active', agingBucket: 'today', ageDays };
}

export async function buildDeferredCustomersWorkspace(cafeId: string, databaseKey: string): Promise<DeferredCustomerSummary[]> {
  await ensureRuntimeContract('core', databaseKey);

  const rows = await loadDeferredCustomerSummaryRows(cafeId, databaseKey);

  return rows
    .map((row) => {
      const debtorName = String(row.debtor_name ?? '').trim();
      const balance = Number(row.balance ?? 0);
      const debtTotal = Number(row.debt_total ?? 0);
      const repaymentTotal = Number(row.repayment_total ?? 0);
      const lastDebtAt = row.last_debt_at ? String(row.last_debt_at) : null;
      const derived = computeDeferredDerivedState(balance, lastDebtAt);
      return {
        id: encodeURIComponent(debtorName),
        debtorName,
        balance,
        debtTotal,
        repaymentTotal,
        lastEntryAt: row.last_entry_at ? String(row.last_entry_at) : null,
        lastDebtAt,
        lastRepaymentAt: row.last_repayment_at ? String(row.last_repayment_at) : null,
        lastEntryKind:
          row.last_entry_kind === 'debt' || row.last_entry_kind === 'repayment' || row.last_entry_kind === 'adjustment'
            ? row.last_entry_kind
            : null,
        entryCount: Number(row.entry_count ?? 0),
        ...derived,
      } satisfies DeferredCustomerSummary;
    })
    .filter((item) => item.debtorName)
    .sort(
      (left, right) =>
        right.balance - left.balance ||
        (right.lastEntryAt ?? '').localeCompare(left.lastEntryAt ?? '') ||
        left.debtorName.localeCompare(right.debtorName, 'ar'),
    );
}

export async function buildDeferredCustomerLedgerWorkspace(
  cafeId: string,
  debtorName: string,
  databaseKey: string,
): Promise<DeferredCustomerLedgerWorkspace> {
  await ensureRuntimeContract('core', databaseKey);

  const admin = adminOps(databaseKey);
  const normalizedDebtorName = debtorName.trim();
  const [{ data: balanceRows, error: balanceError }, { data, error }] = await Promise.all([
    admin
      .from('deferred_customer_balances')
      .select('balance, debt_total, repayment_total, entry_count, last_entry_at, last_debt_at, last_repayment_at')
      .eq('cafe_id', cafeId)
      .eq('debtor_name', normalizedDebtorName)
      .limit(1),
    admin
      .from('deferred_ledger_entries')
      .select('id, debtor_name, entry_kind, amount, notes, created_at, payment_id, service_session_id, by_staff_id, by_owner_id')
      .eq('cafe_id', cafeId)
      .eq('debtor_name', normalizedDebtorName)
      .order('created_at', { ascending: false }),
  ]);

  if (balanceError) throw balanceError;
  if (error) throw error;

  const balanceRow = (balanceRows ?? [])[0] as Record<string, unknown> | undefined;

  let balance = Number(balanceRow?.balance ?? 0);
  let debtTotal = Number(balanceRow?.debt_total ?? 0);
  let repaymentTotal = Number(balanceRow?.repayment_total ?? 0);
  let lastEntryAt: string | null = balanceRow?.last_entry_at ? String(balanceRow.last_entry_at) : null;
  let lastDebtAt: string | null = balanceRow?.last_debt_at ? String(balanceRow.last_debt_at) : null;
  let lastRepaymentAt: string | null = balanceRow?.last_repayment_at ? String(balanceRow.last_repayment_at) : null;
  const orderedAsc = [...(data ?? [])].reverse();

  if (!balanceRow) {
    for (const row of orderedAsc) {
      const amount = Number((row as any).amount ?? 0);
      const entryKind = String((row as any).entry_kind ?? '');
      const createdAt = String((row as any).created_at ?? '');
      if (!lastEntryAt || createdAt > lastEntryAt) lastEntryAt = createdAt;
      if (entryKind === 'debt') {
        debtTotal += amount;
        balance += amount;
        if (!lastDebtAt || createdAt > lastDebtAt) lastDebtAt = createdAt;
      }
      if (entryKind === 'repayment') {
        repaymentTotal += amount;
        balance -= amount;
        if (!lastRepaymentAt || createdAt > lastRepaymentAt) lastRepaymentAt = createdAt;
      }
    }
  }

  const entries: DeferredLedgerEntry[] = (data ?? []).map(
    (row: any) =>
      ({
        id: String(row.id),
        debtorName: String(row.debtor_name),
        entryKind: String(row.entry_kind) as DeferredLedgerEntry['entryKind'],
        amount: Number(row.amount ?? 0),
        notes: row.notes ? String(row.notes) : null,
        createdAt: String(row.created_at),
        paymentId: row.payment_id ? String(row.payment_id) : null,
        serviceSessionId: row.service_session_id ? String(row.service_session_id) : null,
        actorLabel: row.by_owner_id ? 'owner' : row.by_staff_id ? 'staff' : null,
      }) satisfies DeferredLedgerEntry,
  );

  const derived = computeDeferredDerivedState(balance, lastDebtAt);

  return {
    debtorName,
    balance,
    debtTotal,
    repaymentTotal,
    entryCount: entries.length,
    lastEntryAt,
    lastDebtAt,
    lastRepaymentAt,
    ...derived,
    entries,
  };
}

export async function buildComplaintsWorkspace(
  cafeId: string,
  databaseKey: string,
  scope: ComplaintsWorkspaceScope = {},
): Promise<ComplaintsWorkspace> {
  const admin = adminOps(databaseKey);
  const { data: shift } = await admin
    .from('shifts')
    .select('id, shift_kind, status, opened_at')
    .eq('cafe_id', cafeId)
    .eq('status', 'open')
    .order('opened_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const normalizedShift = normalizeShift(shift);
  if (!normalizedShift) {
    return { shift: null, sessions: [], items: [], complaints: [], itemIssues: [] };
  }

  const [
    { data: sessionRows, error: sessionError },
    { data: itemRows, error: itemError },
    { data: complaintRows, error: complaintError },
    { data: issueRows, error: issueError },
  ] = await Promise.all([
    admin
      .from('service_sessions')
      .select('id, session_label, opened_at')
      .eq('cafe_id', cafeId)
      .eq('shift_id', normalizedShift.id)
      .order('opened_at', { ascending: false }),
    admin
      .from('order_items')
      .select('id, service_session_id, station_code, unit_price, qty_total, qty_delivered, qty_replacement_delivered, qty_paid, qty_deferred, qty_waived, qty_remade, qty_cancelled, menu_products!inner(product_name), service_sessions!inner(session_label)')
      .eq('cafe_id', cafeId)
      .eq('shift_id', normalizedShift.id)
      .order('created_at', { ascending: false }),
    admin
      .from('complaints')
      .select('id, order_item_id, service_session_id, station_code, complaint_kind, complaint_scope, status, resolution_kind, requested_quantity, resolved_quantity, notes, created_at, resolved_at, created_by_staff_id, created_by_owner_id, resolved_by_staff_id, resolved_by_owner_id, service_sessions!inner(session_label), order_items(menu_products(product_name))')
      .eq('cafe_id', cafeId)
      .eq('shift_id', normalizedShift.id)
      .eq('complaint_scope', 'general')
      .order('created_at', { ascending: false })
      .limit(50),
    admin
      .from('order_item_issues')
      .select('id, order_item_id, service_session_id, station_code, issue_kind, action_kind, status, requested_quantity, resolved_quantity, notes, created_at, resolved_at, created_by_staff_id, created_by_owner_id, resolved_by_staff_id, resolved_by_owner_id, service_sessions!inner(session_label), order_items!inner(menu_products(product_name))')
      .eq('cafe_id', cafeId)
      .eq('shift_id', normalizedShift.id)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  if (sessionError) throw sessionError;
  if (itemError) throw itemError;
  if (complaintError) throw complaintError;
  if (issueError) throw issueError;

  const sessions = (sessionRows ?? []).map(
    (row: any) => ({ id: String(row.id), label: String(row.session_label ?? '') }),
  );

  const items: ComplaintItemCandidate[] = (itemRows ?? [])
    .filter((row: any) => allowStationCode(normalizeStationCode(row.station_code), scope.itemStationCodes))
    .map((row: any) => {
      const availableCancelQty = Math.max(Number(row.qty_total ?? 0) - Number(row.qty_cancelled ?? 0) - Number(row.qty_delivered ?? 0), 0);
      const availableRemakeQty = Math.max(Number(row.qty_delivered ?? 0) + Number(row.qty_replacement_delivered ?? 0) - Number(row.qty_remade ?? 0), 0);
      const availableWaiveQty = Math.max(Number(row.qty_delivered ?? 0) - Number(row.qty_paid ?? 0) - Number(row.qty_deferred ?? 0) - Number(row.qty_waived ?? 0), 0);
      return {
        orderItemId: String(row.id),
        serviceSessionId: String(row.service_session_id),
        sessionLabel: String(row.service_sessions?.session_label ?? ''),
        productName: String(row.menu_products?.product_name ?? ''),
        stationCode: normalizeStationCode(row.station_code),
        unitPrice: Number(row.unit_price ?? 0),
        availableCancelQty,
        availableRemakeQty,
        availableWaiveQty,
        qtyDelivered: Number(row.qty_delivered ?? 0),
        qtyReplacementDelivered: Number(row.qty_replacement_delivered ?? 0),
        qtyPaid: Number(row.qty_paid ?? 0),
        qtyDeferred: Number(row.qty_deferred ?? 0),
        qtyWaived: Number(row.qty_waived ?? 0),
      } satisfies ComplaintItemCandidate;
    })
    .filter((item) => item.availableCancelQty > 0 || item.availableRemakeQty > 0 || item.availableWaiveQty > 0);

  const complaints: ComplaintRecord[] = (complaintRows ?? [])
    .filter((row: any) => {
      if (!row.station_code) return true;
      return allowStationCode(normalizeStationCode(row.station_code), scope.itemStationCodes);
    })
    .map((row: any) => {
    const orderItemRef = Array.isArray(row.order_items) ? row.order_items[0] : row.order_items;
    const menuProductRef = Array.isArray(orderItemRef?.menu_products) ? orderItemRef.menu_products[0] : orderItemRef?.menu_products;
    return {
      id: String(row.id),
      orderItemId: row.order_item_id ? String(row.order_item_id) : null,
      serviceSessionId: String(row.service_session_id),
      sessionLabel: String(row.service_sessions?.session_label ?? ''),
      productName: menuProductRef?.product_name ? String(menuProductRef.product_name) : null,
      stationCode: row.station_code ? (normalizeStationCode(row.station_code)) : null,
      complaintKind: String(row.complaint_kind) as ComplaintRecord['complaintKind'],
      status: String(row.status) as ComplaintRecord['status'],
      resolutionKind: row.resolution_kind && String(row.resolution_kind) === 'dismissed'
        ? 'dismissed'
        : row.status === 'resolved'
          ? 'resolved'
          : null,
      requestedQuantity: row.requested_quantity == null ? null : Number(row.requested_quantity),
      resolvedQuantity: row.resolved_quantity == null ? null : Number(row.resolved_quantity),
      notes: row.notes ? String(row.notes) : null,
      createdAt: String(row.created_at),
      resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
      createdByLabel: row.created_by_owner_id ? 'owner' : row.created_by_staff_id ? 'staff' : null,
      resolvedByLabel: row.resolved_by_owner_id ? 'owner' : row.resolved_by_staff_id ? 'staff' : null,
    } satisfies ComplaintRecord;
  });

  const itemIssues = (issueRows ?? [])
    .filter((row: any) => {
      if (!row.station_code) return true;
      return allowStationCode(normalizeStationCode(row.station_code), scope.itemStationCodes);
    })
    .map((row: any) => {
    const orderItemRef = Array.isArray(row.order_items) ? row.order_items[0] : row.order_items;
    const menuProductRef = Array.isArray(orderItemRef?.menu_products) ? orderItemRef.menu_products[0] : orderItemRef?.menu_products;
    return {
      id: String(row.id),
      orderItemId: String(row.order_item_id),
      serviceSessionId: String(row.service_session_id),
      sessionLabel: String(row.service_sessions?.session_label ?? ''),
      productName: String(menuProductRef?.product_name ?? ''),
      stationCode: row.station_code ? (normalizeStationCode(row.station_code)) : null,
      issueKind: String(row.issue_kind ?? 'other') as ComplaintsWorkspace['itemIssues'][number]['issueKind'],
      actionKind: String(row.action_kind ?? 'note') as ComplaintsWorkspace['itemIssues'][number]['actionKind'],
      status: String(row.status ?? 'logged') as ComplaintsWorkspace['itemIssues'][number]['status'],
      requestedQuantity: row.requested_quantity == null ? null : Number(row.requested_quantity),
      resolvedQuantity: row.resolved_quantity == null ? null : Number(row.resolved_quantity),
      notes: row.notes ? String(row.notes) : null,
      createdAt: String(row.created_at),
      resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
      createdByLabel: row.created_by_owner_id ? 'owner' : row.created_by_staff_id ? 'staff' : null,
      resolvedByLabel: row.resolved_by_owner_id ? 'owner' : row.resolved_by_staff_id ? 'staff' : null,
    } satisfies ComplaintsWorkspace['itemIssues'][number];
  });

  return { shift: normalizedShift, sessions, items, complaints, itemIssues };
}

export async function buildDashboardWorkspace(cafeId: string, databaseKey: string): Promise<DashboardWorkspace> {
  await ensureRuntimeContract('core', databaseKey);

  const admin = adminOps(databaseKey);
  const [waiter, stationBarista, stationShisha, billing] = await Promise.all([
    buildWaiterWorkspace(cafeId, databaseKey),
    buildStationWorkspace(cafeId, 'barista', databaseKey),
    buildStationWorkspace(cafeId, 'shisha', databaseKey),
    buildBillingWorkspace(cafeId, databaseKey),
  ]);
  const deferredSummaries = await loadDeferredCustomerSummaryRows(cafeId, databaseKey);
  let deferredOutstanding = 0;
  for (const row of deferredSummaries) {
    deferredOutstanding += Number(row.balance ?? 0);
  }

  let queueHealth: OpsQueueHealth = {
    oldestPendingMinutes: null,
    oldestReadyMinutes: null,
    stalledSessionsCount: 0,
    stalledThresholdMinutes: STALLED_SESSION_THRESHOLD_MINUTES,
  };

  if (waiter.shift) {
    const openSessionIds = waiter.sessions.map((session) => session.id);
    const openSessionIdSet = new Set(openSessionIds);
    const readyItemIds = new Set(waiter.readyItems.map((item) => item.orderItemId));
    const oldestPendingSource = [...stationBarista.queue, ...stationShisha.queue]
      .map((item) => item.createdAt)
      .filter(Boolean)
      .sort()[0] ?? null;

    const [ordersResult, paymentsResult, eventsResult] = openSessionIds.length
      ? await Promise.all([
          admin
            .from('orders')
            .select('service_session_id, created_at, submitted_at')
            .eq('cafe_id', cafeId)
            .eq('shift_id', waiter.shift.id)
            .in('service_session_id', openSessionIds),
          admin
            .from('payments')
            .select('service_session_id, created_at')
            .eq('cafe_id', cafeId)
            .eq('shift_id', waiter.shift.id)
            .in('service_session_id', openSessionIds),
          admin
            .from('fulfillment_events')
            .select('service_session_id, order_item_id, event_code, created_at')
            .eq('cafe_id', cafeId)
            .eq('shift_id', waiter.shift.id)
            .in('service_session_id', openSessionIds),
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
          { data: [], error: null },
        ];

    if (ordersResult.error) throw ordersResult.error;
    if (paymentsResult.error) throw paymentsResult.error;
    if (eventsResult.error) throw eventsResult.error;

    const sessionActivity = new Map<string, string>();
    for (const session of waiter.sessions) {
      sessionActivity.set(session.id, session.openedAt);
    }

    for (const row of ordersResult.data ?? []) {
      const sessionId = String((row as any).service_session_id ?? '');
      if (!sessionId || !openSessionIdSet.has(sessionId)) continue;
      const latest = maxIso(String((row as any).created_at ?? ''), (row as any).submitted_at ? String((row as any).submitted_at) : null);
      sessionActivity.set(sessionId, maxIso(sessionActivity.get(sessionId), latest) ?? sessionActivity.get(sessionId) ?? '');
    }

    for (const row of paymentsResult.data ?? []) {
      const sessionId = String((row as any).service_session_id ?? '');
      if (!sessionId || !openSessionIdSet.has(sessionId)) continue;
      const createdAt = String((row as any).created_at ?? '');
      sessionActivity.set(sessionId, maxIso(sessionActivity.get(sessionId), createdAt) ?? sessionActivity.get(sessionId) ?? '');
    }

    const readyEventByItem = new Map<string, string>();
    for (const row of eventsResult.data ?? []) {
      const sessionId = String((row as any).service_session_id ?? '');
      const createdAt = String((row as any).created_at ?? '');
      if (sessionId && openSessionIdSet.has(sessionId)) {
        sessionActivity.set(sessionId, maxIso(sessionActivity.get(sessionId), createdAt) ?? sessionActivity.get(sessionId) ?? '');
      }

      const orderItemId = String((row as any).order_item_id ?? '');
      const eventCode = String((row as any).event_code ?? '');
      if (orderItemId && readyItemIds.has(orderItemId) && (eventCode === 'ready' || eventCode === 'partial_ready')) {
        readyEventByItem.set(orderItemId, maxIso(readyEventByItem.get(orderItemId), createdAt) ?? createdAt);
      }
    }

    const oldestReadySource = waiter.readyItems
      .map((item) => readyEventByItem.get(item.orderItemId) ?? null)
      .filter(Boolean)
      .sort()[0] ?? null;

    queueHealth = {
      oldestPendingMinutes: minutesSince(oldestPendingSource),
      oldestReadyMinutes: minutesSince(oldestReadySource),
      stalledSessionsCount: waiter.sessions.reduce((count, session) => {
        const age = minutesSince(sessionActivity.get(session.id));
        return count + (age != null && age >= STALLED_SESSION_THRESHOLD_MINUTES ? 1 : 0);
      }, 0),
      stalledThresholdMinutes: STALLED_SESSION_THRESHOLD_MINUTES,
    };
  }

  return {
    shift: waiter.shift,
    openSessions: waiter.sessions.length,
    waitingBarista: stationBarista.queue.reduce((sum, item) => sum + item.qtyWaiting, 0),
    waitingShisha: stationShisha.queue.reduce((sum, item) => sum + item.qtyWaiting, 0),
    readyForDelivery: waiter.readyItems.reduce((sum, item) => sum + item.qtyReadyForDelivery, 0),
    billableQty: billing.sessions.reduce((sum, session) => sum + session.totalBillableQty, 0),
    deferredOutstanding,
    queueHealth,
  };
}

export async function buildOpsNavSummary(cafeId: string, databaseKey: string): Promise<OpsNavSummary> {
  await ensureRuntimeContract('core', databaseKey);

  const shift = await loadOpenShift(cafeId, databaseKey);
  const openSessions = shift ? await loadOpenSessions(cafeId, shift.id, databaseKey) : [];
  const openSessionIds = openSessions.map((row: any) => String(row.id));

  const [readyItems, billableItems, deferredSummaries, stationBarista, stationShisha] = await Promise.all([
    buildReadyItemsWorkspace(cafeId, databaseKey),
    shift ? listBillableRows(cafeId, databaseKey, shift.id, openSessionIds) : Promise.resolve([] as BillableItem[]),
    loadDeferredCustomerSummaryRows(cafeId, databaseKey),
    buildStationWorkspace(cafeId, 'barista', databaseKey),
    buildStationWorkspace(cafeId, 'shisha', databaseKey),
  ]);

  let deferredOutstanding = 0;
  let deferredCustomerCount = 0;
  for (const row of deferredSummaries) {
    const balance = Number(row.balance ?? 0);
    deferredOutstanding += balance;
    if (balance > 0) deferredCustomerCount += 1;
  }

  const oldestPendingSource = [...stationBarista.queue, ...stationShisha.queue].map((item) => item.createdAt).filter(Boolean).sort()[0] ?? null;
  const oldestReadySource = readyItems.map((item) => item.createdAt).filter(Boolean).sort()[0] ?? null;

  return {
    shift,
    openSessions: openSessions.length,
    waitingBarista: stationBarista.queue.reduce((sum, item) => sum + item.qtyWaiting, 0),
    waitingShisha: stationShisha.queue.reduce((sum, item) => sum + item.qtyWaiting, 0),
    readyForDelivery: readyItems.reduce((sum, item) => sum + item.qtyReadyForDelivery, 0),
    billableQty: billableItems.reduce((sum, item) => sum + item.qtyBillable, 0),
    deferredOutstanding,
    deferredCustomerCount,
    queueHealth: {
      oldestPendingMinutes: minutesSince(oldestPendingSource),
      oldestReadyMinutes: minutesSince(oldestReadySource),
      stalledSessionsCount: 0,
      stalledThresholdMinutes: STALLED_SESSION_THRESHOLD_MINUTES,
    },
  };
}
