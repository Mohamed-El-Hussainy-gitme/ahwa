import type {
  InventoryAddonRecipe,
  InventoryEstimatedConsumptionItem,
  InventoryItem,
  InventoryMenuAddonSummary,
  InventoryMenuProductSummary,
  InventoryMovement,
  InventoryMovementKind,
  InventoryProductRecipe,
  InventorySupplier,
  InventoryWorkspace,
  ShiftInventoryPostingSummary,
  ShiftInventorySnapshot,
  ShiftInventorySnapshotAddon,
  ShiftInventorySnapshotLine,
  ShiftInventorySnapshotProduct,
  StationCode,
} from '@/lib/ops/types';
import { cleanCustomerText, normalizeCustomerName } from '@/lib/ops/customers';
import { supabaseAdminForDatabase } from '@/lib/supabase/admin';

type CafeDatabaseScope = {
  cafeId: string;
  databaseKey: string;
};

type InventoryEntryUnitMode = 'stock' | 'purchase';

type InventoryEntryResolution = {
  deltaQuantity: number;
  inputQuantity: number;
  inputUnitLabel: string;
  conversionFactor: number;
};

const INVENTORY_ANALYSIS_WINDOW_DAYS = 30;

function ops(databaseKey: string) {
  return supabaseAdminForDatabase(databaseKey).schema('ops');
}

export function cleanInventoryText(value: string | null | undefined): string | null {
  return cleanCustomerText(value);
}

export function normalizeInventoryText(value: string): string {
  return normalizeCustomerName(value);
}

function normalizePurchaseUnitConfig(purchaseUnitLabel: string | null | undefined, purchaseToStockFactor: number | null | undefined) {
  const cleanedPurchaseUnitLabel = cleanInventoryText(purchaseUnitLabel);
  if (!cleanedPurchaseUnitLabel) {
    return { purchaseUnitLabel: null, purchaseToStockFactor: 1 };
  }
  const factor = Number(purchaseToStockFactor ?? 1);
  return {
    purchaseUnitLabel: cleanedPurchaseUnitLabel,
    purchaseToStockFactor: Number.isFinite(factor) && factor > 0 ? factor : 1,
  };
}

function resolveInventoryEntry(input: {
  quantity: number;
  entryUnitMode?: InventoryEntryUnitMode | null;
  item: Pick<InventoryItem, 'unitLabel' | 'purchaseUnitLabel' | 'purchaseToStockFactor'>;
}): InventoryEntryResolution {
  const quantity = Number(input.quantity ?? 0);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('inventory_entry_quantity_invalid');
  }

  if (input.entryUnitMode === 'purchase' && input.item.purchaseUnitLabel) {
    const factor = Number(input.item.purchaseToStockFactor ?? 1);
    const safeFactor = Number.isFinite(factor) && factor > 0 ? factor : 1;
    return {
      deltaQuantity: quantity * safeFactor,
      inputQuantity: quantity,
      inputUnitLabel: input.item.purchaseUnitLabel,
      conversionFactor: safeFactor,
    } satisfies InventoryEntryResolution;
  }

  return {
    deltaQuantity: quantity,
    inputQuantity: quantity,
    inputUnitLabel: input.item.unitLabel,
    conversionFactor: 1,
  } satisfies InventoryEntryResolution;
}

async function getInventoryItem(scope: CafeDatabaseScope, itemId: string): Promise<InventoryItem | null> {
  const { data, error } = await ops(scope.databaseKey)
    .from('inventory_items')
    .select('id, item_name, normalized_name, item_code, category_label, unit_label, purchase_unit_label, purchase_to_stock_factor, current_balance, low_stock_threshold, notes, is_active, last_movement_at, created_at, updated_at')
    .eq('cafe_id', scope.cafeId)
    .eq('id', itemId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const currentBalance = Number(data.current_balance ?? 0);
  const lowStockThreshold = Number(data.low_stock_threshold ?? 0);
  const isActive = !!data.is_active;
  return {
    id: String(data.id),
    itemName: String(data.item_name ?? ''),
    normalizedName: String(data.normalized_name ?? ''),
    itemCode: data.item_code ? String(data.item_code) : null,
    categoryLabel: data.category_label ? String(data.category_label) : null,
    unitLabel: String(data.unit_label ?? ''),
    purchaseUnitLabel: data.purchase_unit_label ? String(data.purchase_unit_label) : null,
    purchaseToStockFactor: Number(data.purchase_to_stock_factor ?? 1),
    currentBalance,
    lowStockThreshold,
    notes: data.notes ? String(data.notes) : null,
    isActive,
    lastMovementAt: data.last_movement_at ? String(data.last_movement_at) : null,
    createdAt: String(data.created_at),
    updatedAt: String(data.updated_at),
    stockStatus: mapStockStatus(currentBalance, lowStockThreshold, isActive),
  } satisfies InventoryItem;
}

export async function resolveInventoryMovementEntry(input: CafeDatabaseScope & {
  inventoryItemId: string;
  quantity: number;
  entryUnitMode?: InventoryEntryUnitMode | null;
}) {
  const item = await getInventoryItem({ cafeId: input.cafeId, databaseKey: input.databaseKey }, input.inventoryItemId);
  if (!item) {
    throw new Error('inventory_item_not_found');
  }
  return resolveInventoryEntry({ quantity: input.quantity, entryUnitMode: input.entryUnitMode, item });
}

function formatInventoryNoteQuantity(value: number) {
  return Number(value.toFixed(3));
}

export async function applyInventoryQuickCount(input: CafeDatabaseScope & {
  actorOwnerId: string;
  inventoryItemId: string;
  actualQuantity: number;
  actualEntryUnit?: InventoryEntryUnitMode | null;
  notes?: string | null;
  countedAt?: string | null;
}) {
  const item = await getInventoryItem({ cafeId: input.cafeId, databaseKey: input.databaseKey }, input.inventoryItemId);
  if (!item) {
    throw new Error('inventory_item_not_found');
  }

  const resolvedActual = resolveInventoryEntry({
    quantity: input.actualQuantity,
    entryUnitMode: input.actualEntryUnit ?? 'stock',
    item,
  });

  const expectedBalance = Number(item.currentBalance ?? 0);
  const actualBalance = Number(resolvedActual.deltaQuantity ?? 0);
  const varianceQuantity = Number((actualBalance - expectedBalance).toFixed(3));

  if (Math.abs(varianceQuantity) < 0.0005) {
    return {
      skipped: true,
      expectedBalance: formatInventoryNoteQuantity(expectedBalance),
      actualBalance: formatInventoryNoteQuantity(actualBalance),
      varianceQuantity: 0,
      unitLabel: item.unitLabel,
    };
  }

  const noteParts = [
    `جرد سريع — المتوقع ${formatInventoryNoteQuantity(expectedBalance)} ${item.unitLabel}`,
    `الفعلي ${formatInventoryNoteQuantity(actualBalance)} ${item.unitLabel}`,
  ];
  const extraNotes = cleanInventoryText(input.notes);
  if (extraNotes) {
    noteParts.push(extraNotes);
  }

  const movement = await recordInventoryMovement({
    cafeId: input.cafeId,
    databaseKey: input.databaseKey,
    actorOwnerId: input.actorOwnerId,
    inventoryItemId: input.inventoryItemId,
    movementKind: 'adjustment',
    deltaQuantity: varianceQuantity,
    inputQuantity: resolvedActual.inputQuantity,
    inputUnitLabel: resolvedActual.inputUnitLabel,
    conversionFactor: resolvedActual.conversionFactor,
    notes: noteParts.join(' • '),
    occurredAt: input.countedAt ?? null,
  });

  return {
    skipped: false,
    expectedBalance: formatInventoryNoteQuantity(expectedBalance),
    actualBalance: formatInventoryNoteQuantity(actualBalance),
    varianceQuantity: formatInventoryNoteQuantity(varianceQuantity),
    unitLabel: item.unitLabel,
    movement,
  };
}

function mapStockStatus(currentBalance: number, threshold: number, isActive: boolean): InventoryItem['stockStatus'] {
  if (!isActive) return 'inactive';
  if (currentBalance <= 0) return 'empty';
  if (threshold > 0 && currentBalance <= threshold) return 'low';
  return 'ok';
}

function mapStationCode(value: unknown): StationCode {
  return String(value ?? '').trim() === 'shisha' ? 'shisha' : 'barista';
}

export async function listInventoryItems(scope: CafeDatabaseScope, includeInactive = true): Promise<InventoryItem[]> {
  let query = ops(scope.databaseKey)
    .from('inventory_items')
    .select('id, item_name, normalized_name, item_code, category_label, unit_label, purchase_unit_label, purchase_to_stock_factor, current_balance, low_stock_threshold, notes, is_active, last_movement_at, created_at, updated_at')
    .eq('cafe_id', scope.cafeId)
    .order('updated_at', { ascending: false })
    .order('item_name', { ascending: true });

  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((item) => {
    const currentBalance = Number(item.current_balance ?? 0);
    const lowStockThreshold = Number(item.low_stock_threshold ?? 0);
    const isActive = !!item.is_active;
    return {
      id: String(item.id),
      itemName: String(item.item_name ?? ''),
      normalizedName: String(item.normalized_name ?? ''),
      itemCode: item.item_code ? String(item.item_code) : null,
      categoryLabel: item.category_label ? String(item.category_label) : null,
      unitLabel: String(item.unit_label ?? ''),
      purchaseUnitLabel: item.purchase_unit_label ? String(item.purchase_unit_label) : null,
      purchaseToStockFactor: Number(item.purchase_to_stock_factor ?? 1),
      currentBalance,
      lowStockThreshold,
      notes: item.notes ? String(item.notes) : null,
      isActive,
      lastMovementAt: item.last_movement_at ? String(item.last_movement_at) : null,
      createdAt: String(item.created_at),
      updatedAt: String(item.updated_at),
      stockStatus: mapStockStatus(currentBalance, lowStockThreshold, isActive),
    } satisfies InventoryItem;
  });
}

export async function createInventoryItem(input: CafeDatabaseScope & {
  actorOwnerId: string;
  itemName: string;
  normalizedName: string;
  itemCode?: string | null;
  categoryLabel?: string | null;
  unitLabel: string;
  purchaseUnitLabel?: string | null;
  purchaseToStockFactor?: number | null;
  lowStockThreshold?: number;
  notes?: string | null;
  openingBalance?: number;
  openingBalanceEntryUnit?: InventoryEntryUnitMode | null;
}) {
  const purchaseConfig = normalizePurchaseUnitConfig(input.purchaseUnitLabel, input.purchaseToStockFactor);
  const { data, error } = await ops(input.databaseKey)
    .from('inventory_items')
    .insert({
      cafe_id: input.cafeId,
      item_name: input.itemName,
      normalized_name: input.normalizedName,
      item_code: input.itemCode ?? null,
      category_label: input.categoryLabel ?? null,
      unit_label: input.unitLabel,
      purchase_unit_label: purchaseConfig.purchaseUnitLabel,
      purchase_to_stock_factor: purchaseConfig.purchaseToStockFactor,
      low_stock_threshold: input.lowStockThreshold ?? 0,
      notes: input.notes ?? null,
      updated_at: new Date().toISOString(),
      updated_by_owner_id: input.actorOwnerId,
    })
    .select('id')
    .single();

  if (error) throw error;
  const itemId = String(data.id);

  if ((input.openingBalance ?? 0) > 0) {
    const openingEntry = resolveInventoryEntry({
      quantity: input.openingBalance ?? 0,
      entryUnitMode: input.openingBalanceEntryUnit ?? 'stock',
      item: {
        unitLabel: input.unitLabel,
        purchaseUnitLabel: purchaseConfig.purchaseUnitLabel,
        purchaseToStockFactor: purchaseConfig.purchaseToStockFactor,
      },
    });
    await recordInventoryMovement({
      cafeId: input.cafeId,
      databaseKey: input.databaseKey,
      actorOwnerId: input.actorOwnerId,
      inventoryItemId: itemId,
      movementKind: 'adjustment',
      deltaQuantity: openingEntry.deltaQuantity,
      inputQuantity: openingEntry.inputQuantity,
      inputUnitLabel: openingEntry.inputUnitLabel,
      conversionFactor: openingEntry.conversionFactor,
      notes: 'رصيد افتتاحي',
    });
  }

  return itemId;
}

export async function updateInventoryItem(input: CafeDatabaseScope & {
  actorOwnerId: string;
  itemId: string;
  itemName: string;
  normalizedName: string;
  itemCode?: string | null;
  categoryLabel?: string | null;
  unitLabel: string;
  purchaseUnitLabel?: string | null;
  purchaseToStockFactor?: number | null;
  lowStockThreshold?: number;
  notes?: string | null;
  isActive?: boolean;
}) {
  const purchaseConfig = normalizePurchaseUnitConfig(input.purchaseUnitLabel, input.purchaseToStockFactor);
  const { error } = await ops(input.databaseKey)
    .from('inventory_items')
    .update({
      item_name: input.itemName,
      normalized_name: input.normalizedName,
      item_code: input.itemCode ?? null,
      category_label: input.categoryLabel ?? null,
      unit_label: input.unitLabel,
      purchase_unit_label: purchaseConfig.purchaseUnitLabel,
      purchase_to_stock_factor: purchaseConfig.purchaseToStockFactor,
      low_stock_threshold: input.lowStockThreshold ?? 0,
      notes: input.notes ?? null,
      is_active: typeof input.isActive === 'boolean' ? input.isActive : true,
      updated_at: new Date().toISOString(),
      updated_by_owner_id: input.actorOwnerId,
    })
    .eq('cafe_id', input.cafeId)
    .eq('id', input.itemId);

  if (error) throw error;
}

export async function setInventoryItemActive(input: CafeDatabaseScope & {
  actorOwnerId: string;
  itemId: string;
  isActive: boolean;
}) {
  const { error } = await ops(input.databaseKey)
    .from('inventory_items')
    .update({
      is_active: input.isActive,
      updated_at: new Date().toISOString(),
      updated_by_owner_id: input.actorOwnerId,
    })
    .eq('cafe_id', input.cafeId)
    .eq('id', input.itemId);

  if (error) throw error;
}

export async function listInventorySuppliers(scope: CafeDatabaseScope, includeInactive = true): Promise<InventorySupplier[]> {
  let query = ops(scope.databaseKey)
    .from('inventory_suppliers')
    .select('id, supplier_name, normalized_name, phone, notes, is_active, created_at, updated_at')
    .eq('cafe_id', scope.cafeId)
    .order('updated_at', { ascending: false })
    .order('supplier_name', { ascending: true });

  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((item) => ({
    id: String(item.id),
    supplierName: String(item.supplier_name ?? ''),
    normalizedName: String(item.normalized_name ?? ''),
    phone: item.phone ? String(item.phone) : null,
    notes: item.notes ? String(item.notes) : null,
    isActive: !!item.is_active,
    createdAt: String(item.created_at),
    updatedAt: String(item.updated_at),
  }) satisfies InventorySupplier);
}

export async function createInventorySupplier(input: CafeDatabaseScope & {
  actorOwnerId: string;
  supplierName: string;
  normalizedName: string;
  phone?: string | null;
  notes?: string | null;
}) {
  const { data, error } = await ops(input.databaseKey)
    .from('inventory_suppliers')
    .insert({
      cafe_id: input.cafeId,
      supplier_name: input.supplierName,
      normalized_name: input.normalizedName,
      phone: input.phone ?? null,
      notes: input.notes ?? null,
      updated_at: new Date().toISOString(),
      updated_by_owner_id: input.actorOwnerId,
    })
    .select('id')
    .single();

  if (error) throw error;
  return String(data.id);
}

export async function updateInventorySupplier(input: CafeDatabaseScope & {
  actorOwnerId: string;
  supplierId: string;
  supplierName: string;
  normalizedName: string;
  phone?: string | null;
  notes?: string | null;
  isActive?: boolean;
}) {
  const { error } = await ops(input.databaseKey)
    .from('inventory_suppliers')
    .update({
      supplier_name: input.supplierName,
      normalized_name: input.normalizedName,
      phone: input.phone ?? null,
      notes: input.notes ?? null,
      is_active: typeof input.isActive === 'boolean' ? input.isActive : true,
      updated_at: new Date().toISOString(),
      updated_by_owner_id: input.actorOwnerId,
    })
    .eq('cafe_id', input.cafeId)
    .eq('id', input.supplierId);

  if (error) throw error;
}

export async function setInventorySupplierActive(input: CafeDatabaseScope & {
  actorOwnerId: string;
  supplierId: string;
  isActive: boolean;
}) {
  const { error } = await ops(input.databaseKey)
    .from('inventory_suppliers')
    .update({
      is_active: input.isActive,
      updated_at: new Date().toISOString(),
      updated_by_owner_id: input.actorOwnerId,
    })
    .eq('cafe_id', input.cafeId)
    .eq('id', input.supplierId);

  if (error) throw error;
}

type InventoryMovementRow = {
  id: string;
  inventory_item_id: string;
  supplier_id: string | null;
  movement_kind: string;
  delta_quantity: number | string;
  unit_label: string;
  input_quantity: number | string | null;
  input_unit_label: string | null;
  conversion_factor: number | string | null;
  notes: string | null;
  occurred_at: string;
  created_at: string;
};

async function listInventoryMovementRows(scope: CafeDatabaseScope, limit = 60): Promise<InventoryMovementRow[]> {
  const { data, error } = await ops(scope.databaseKey)
    .from('inventory_movements')
    .select('id, inventory_item_id, supplier_id, movement_kind, delta_quantity, unit_label, input_quantity, input_unit_label, conversion_factor, notes, occurred_at, created_at')
    .eq('cafe_id', scope.cafeId)
    .order('occurred_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: String(row.id),
    inventory_item_id: String(row.inventory_item_id),
    supplier_id: row.supplier_id ? String(row.supplier_id) : null,
    movement_kind: String(row.movement_kind),
    delta_quantity: row.delta_quantity ?? 0,
    unit_label: String(row.unit_label ?? ''),
    input_quantity: row.input_quantity ?? null,
    input_unit_label: row.input_unit_label ? String(row.input_unit_label) : null,
    conversion_factor: row.conversion_factor ?? null,
    notes: row.notes ? String(row.notes) : null,
    occurred_at: String(row.occurred_at),
    created_at: String(row.created_at),
  }));
}

export async function recordInventoryMovement(input: CafeDatabaseScope & {
  actorOwnerId: string;
  inventoryItemId: string;
  movementKind: InventoryMovementKind;
  deltaQuantity: number;
  inputQuantity?: number | null;
  inputUnitLabel?: string | null;
  conversionFactor?: number | null;
  supplierId?: string | null;
  notes?: string | null;
  occurredAt?: string | null;
}) {
  const rpc = await supabaseAdminForDatabase(input.databaseKey).rpc('ops_record_inventory_movement', {
    p_cafe_id: input.cafeId,
    p_inventory_item_id: input.inventoryItemId,
    p_movement_kind: input.movementKind,
    p_delta_quantity: input.deltaQuantity,
    p_supplier_id: input.supplierId ?? null,
    p_notes: input.notes ?? null,
    p_occurred_at: input.occurredAt ?? null,
    p_actor_owner_id: input.actorOwnerId,
    p_input_quantity: input.inputQuantity ?? null,
    p_input_unit_label: input.inputUnitLabel ?? null,
    p_conversion_factor: input.conversionFactor ?? null,
  });

  if (rpc.error) throw rpc.error;
  return (rpc.data ?? {}) as {
    movement_id?: string | null;
    new_balance?: number | null;
    unit_label?: string | null;
    input_quantity?: number | null;
    input_unit_label?: string | null;
    conversion_factor?: number | null;
  };
}

async function listMenuProductSummaries(scope: CafeDatabaseScope): Promise<InventoryMenuProductSummary[]> {
  const { data, error } = await ops(scope.databaseKey)
    .from('menu_products')
    .select('id, product_name, station_code, is_active')
    .eq('cafe_id', scope.cafeId)
    .order('sort_order', { ascending: true })
    .order('product_name', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.product_name ?? ''),
    stationCode: mapStationCode(row.station_code),
    isActive: !!row.is_active,
  }) satisfies InventoryMenuProductSummary);
}

async function listMenuAddonSummaries(scope: CafeDatabaseScope): Promise<InventoryMenuAddonSummary[]> {
  const { data, error } = await ops(scope.databaseKey)
    .from('menu_addons')
    .select('id, addon_name, station_code, is_active')
    .eq('cafe_id', scope.cafeId)
    .order('sort_order', { ascending: true })
    .order('addon_name', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.addon_name ?? ''),
    stationCode: mapStationCode(row.station_code),
    isActive: !!row.is_active,
  }) satisfies InventoryMenuAddonSummary);
}

type ProductRecipeRow = {
  id: string;
  menu_product_id: string;
  inventory_item_id: string;
  quantity_per_unit: number | string;
  wastage_percent: number | string;
  notes: string | null;
  is_active: boolean;
  updated_at: string;
};

type AddonRecipeRow = {
  id: string;
  menu_addon_id: string;
  inventory_item_id: string;
  quantity_per_unit: number | string;
  wastage_percent: number | string;
  notes: string | null;
  is_active: boolean;
  updated_at: string;
};

async function listProductRecipeRows(scope: CafeDatabaseScope): Promise<ProductRecipeRow[]> {
  const { data, error } = await ops(scope.databaseKey)
    .from('inventory_product_recipes')
    .select('id, menu_product_id, inventory_item_id, quantity_per_unit, wastage_percent, notes, is_active, updated_at')
    .eq('cafe_id', scope.cafeId)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: String(row.id),
    menu_product_id: String(row.menu_product_id),
    inventory_item_id: String(row.inventory_item_id),
    quantity_per_unit: row.quantity_per_unit ?? 0,
    wastage_percent: row.wastage_percent ?? 0,
    notes: row.notes ? String(row.notes) : null,
    is_active: !!row.is_active,
    updated_at: String(row.updated_at),
  }));
}

async function listAddonRecipeRows(scope: CafeDatabaseScope): Promise<AddonRecipeRow[]> {
  const { data, error } = await ops(scope.databaseKey)
    .from('inventory_addon_recipes')
    .select('id, menu_addon_id, inventory_item_id, quantity_per_unit, wastage_percent, notes, is_active, updated_at')
    .eq('cafe_id', scope.cafeId)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: String(row.id),
    menu_addon_id: String(row.menu_addon_id),
    inventory_item_id: String(row.inventory_item_id),
    quantity_per_unit: row.quantity_per_unit ?? 0,
    wastage_percent: row.wastage_percent ?? 0,
    notes: row.notes ? String(row.notes) : null,
    is_active: !!row.is_active,
    updated_at: String(row.updated_at),
  }));
}

function mapProductRecipes(
  rows: ProductRecipeRow[],
  menuProducts: InventoryMenuProductSummary[],
  items: InventoryItem[],
): InventoryProductRecipe[] {
  const productMap = new Map(menuProducts.map((product) => [product.id, product]));
  const itemMap = new Map(items.map((item) => [item.id, item]));
  return rows
    .map((row) => {
      const product = productMap.get(row.menu_product_id);
      const item = itemMap.get(row.inventory_item_id);
      if (!product || !item) return null;
      return {
        id: row.id,
        menuProductId: row.menu_product_id,
        productName: product.name,
        stationCode: product.stationCode,
        inventoryItemId: row.inventory_item_id,
        inventoryItemName: item.itemName,
        unitLabel: item.unitLabel,
        quantityPerUnit: Number(row.quantity_per_unit ?? 0),
        wastagePercent: Number(row.wastage_percent ?? 0),
        notes: row.notes,
        isActive: row.is_active,
        updatedAt: row.updated_at,
      } satisfies InventoryProductRecipe;
    })
    .filter((row): row is InventoryProductRecipe => Boolean(row))
    .sort((a, b) => a.productName.localeCompare(b.productName, 'ar'));
}

function mapAddonRecipes(
  rows: AddonRecipeRow[],
  menuAddons: InventoryMenuAddonSummary[],
  items: InventoryItem[],
): InventoryAddonRecipe[] {
  const addonMap = new Map(menuAddons.map((addon) => [addon.id, addon]));
  const itemMap = new Map(items.map((item) => [item.id, item]));
  return rows
    .map((row) => {
      const addon = addonMap.get(row.menu_addon_id);
      const item = itemMap.get(row.inventory_item_id);
      if (!addon || !item) return null;
      return {
        id: row.id,
        menuAddonId: row.menu_addon_id,
        addonName: addon.name,
        stationCode: addon.stationCode,
        inventoryItemId: row.inventory_item_id,
        inventoryItemName: item.itemName,
        unitLabel: item.unitLabel,
        quantityPerUnit: Number(row.quantity_per_unit ?? 0),
        wastagePercent: Number(row.wastage_percent ?? 0),
        notes: row.notes,
        isActive: row.is_active,
        updatedAt: row.updated_at,
      } satisfies InventoryAddonRecipe;
    })
    .filter((row): row is InventoryAddonRecipe => Boolean(row))
    .sort((a, b) => a.addonName.localeCompare(b.addonName, 'ar'));
}

export async function createInventoryProductRecipe(input: CafeDatabaseScope & {
  actorOwnerId: string;
  menuProductId: string;
  inventoryItemId: string;
  quantityPerUnit: number;
  wastagePercent?: number;
  notes?: string | null;
}) {
  const { data, error } = await ops(input.databaseKey)
    .from('inventory_product_recipes')
    .insert({
      cafe_id: input.cafeId,
      menu_product_id: input.menuProductId,
      inventory_item_id: input.inventoryItemId,
      quantity_per_unit: input.quantityPerUnit,
      wastage_percent: input.wastagePercent ?? 0,
      notes: input.notes ?? null,
      updated_at: new Date().toISOString(),
      updated_by_owner_id: input.actorOwnerId,
    })
    .select('id')
    .single();

  if (error) throw error;
  return String(data.id);
}

export async function updateInventoryProductRecipe(input: CafeDatabaseScope & {
  actorOwnerId: string;
  recipeId: string;
  quantityPerUnit: number;
  wastagePercent?: number;
  notes?: string | null;
  isActive?: boolean;
}) {
  const { error } = await ops(input.databaseKey)
    .from('inventory_product_recipes')
    .update({
      quantity_per_unit: input.quantityPerUnit,
      wastage_percent: input.wastagePercent ?? 0,
      notes: input.notes ?? null,
      is_active: typeof input.isActive === 'boolean' ? input.isActive : true,
      updated_at: new Date().toISOString(),
      updated_by_owner_id: input.actorOwnerId,
    })
    .eq('cafe_id', input.cafeId)
    .eq('id', input.recipeId);

  if (error) throw error;
}

export async function createInventoryAddonRecipe(input: CafeDatabaseScope & {
  actorOwnerId: string;
  menuAddonId: string;
  inventoryItemId: string;
  quantityPerUnit: number;
  wastagePercent?: number;
  notes?: string | null;
}) {
  const { data, error } = await ops(input.databaseKey)
    .from('inventory_addon_recipes')
    .insert({
      cafe_id: input.cafeId,
      menu_addon_id: input.menuAddonId,
      inventory_item_id: input.inventoryItemId,
      quantity_per_unit: input.quantityPerUnit,
      wastage_percent: input.wastagePercent ?? 0,
      notes: input.notes ?? null,
      updated_at: new Date().toISOString(),
      updated_by_owner_id: input.actorOwnerId,
    })
    .select('id')
    .single();

  if (error) throw error;
  return String(data.id);
}

export async function updateInventoryAddonRecipe(input: CafeDatabaseScope & {
  actorOwnerId: string;
  recipeId: string;
  quantityPerUnit: number;
  wastagePercent?: number;
  notes?: string | null;
  isActive?: boolean;
}) {
  const { error } = await ops(input.databaseKey)
    .from('inventory_addon_recipes')
    .update({
      quantity_per_unit: input.quantityPerUnit,
      wastage_percent: input.wastagePercent ?? 0,
      notes: input.notes ?? null,
      is_active: typeof input.isActive === 'boolean' ? input.isActive : true,
      updated_at: new Date().toISOString(),
      updated_by_owner_id: input.actorOwnerId,
    })
    .eq('cafe_id', input.cafeId)
    .eq('id', input.recipeId);

  if (error) throw error;
}

export async function upsertInventoryAddonRecipesBulk(input: CafeDatabaseScope & {
  actorOwnerId: string;
  inventoryItemId: string;
  rows: Array<{
    menuAddonId: string;
    quantityPerUnit: number;
    wastagePercent?: number;
    notes?: string | null;
  }>;
}) {
  const sanitizedRows = input.rows
    .map((row) => ({
      menuAddonId: String(row.menuAddonId ?? '').trim(),
      quantityPerUnit: Number(row.quantityPerUnit ?? 0),
      wastagePercent: Number(row.wastagePercent ?? 0),
      notes: cleanInventoryText(row.notes),
    }))
    .filter((row) => row.menuAddonId && Number.isFinite(row.quantityPerUnit) && row.quantityPerUnit > 0);

  if (!sanitizedRows.length) {
    throw new Error('inventory_bulk_recipes_empty');
  }

  const { error, data } = await ops(input.databaseKey)
    .from('inventory_addon_recipes')
    .upsert(
      sanitizedRows.map((row) => ({
        cafe_id: input.cafeId,
        menu_addon_id: row.menuAddonId,
        inventory_item_id: input.inventoryItemId,
        quantity_per_unit: row.quantityPerUnit,
        wastage_percent: row.wastagePercent > 0 ? row.wastagePercent : 0,
        notes: row.notes ?? null,
        is_active: true,
        updated_at: new Date().toISOString(),
        updated_by_owner_id: input.actorOwnerId,
      })),
      { onConflict: 'cafe_id,menu_addon_id,inventory_item_id' },
    )
    .select('id');

  if (error) throw error;

  return {
    count: data?.length ?? sanitizedRows.length,
    requested: input.rows.length,
    applied: sanitizedRows.length,
  };
}

type OrderItemEstimateRow = {
  menu_product_id: string;
  qty_total: number | string;
  qty_delivered: number | string;
  qty_replacement_delivered: number | string;
};

type OrderAddonEstimateRow = {
  menu_addon_id: string;
  quantity: number | string;
  order_items: {
    qty_total?: number | string | null;
    qty_delivered?: number | string | null;
    qty_replacement_delivered?: number | string | null;
  } | Array<{
    qty_total?: number | string | null;
    qty_delivered?: number | string | null;
    qty_replacement_delivered?: number | string | null;
  }> | null;
};

function deliveredUnits(row: { qty_delivered?: number | string | null; qty_replacement_delivered?: number | string | null }) {
  return Number(row.qty_delivered ?? 0) + Number(row.qty_replacement_delivered ?? 0);
}

function recipeMultiplier(quantityPerUnit: number, wastagePercent: number) {
  return quantityPerUnit * (1 + (wastagePercent > 0 ? wastagePercent / 100 : 0));
}

async function buildEstimatedConsumption(
  scope: CafeDatabaseScope,
  items: InventoryItem[],
  productRecipes: InventoryProductRecipe[],
  addonRecipes: InventoryAddonRecipe[],
): Promise<InventoryEstimatedConsumptionItem[]> {
  const since = new Date(Date.now() - INVENTORY_ANALYSIS_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const admin = ops(scope.databaseKey);

  const [{ data: orderItems, error: orderItemsError }, { data: addonRows, error: addonRowsError }, { data: movementRows, error: movementRowsError }] = await Promise.all([
    admin
      .from('order_items')
      .select('menu_product_id, qty_total, qty_delivered, qty_replacement_delivered')
      .eq('cafe_id', scope.cafeId)
      .gte('created_at', since),
    admin
      .from('order_item_addons')
      .select('menu_addon_id, quantity, order_items!inner(qty_total, qty_delivered, qty_replacement_delivered)')
      .eq('cafe_id', scope.cafeId)
      .gte('created_at', since),
    admin
      .from('inventory_movements')
      .select('inventory_item_id, movement_kind, delta_quantity')
      .eq('cafe_id', scope.cafeId)
      .gte('occurred_at', since),
  ]);

  if (orderItemsError) throw orderItemsError;
  if (addonRowsError) throw addonRowsError;
  if (movementRowsError) throw movementRowsError;

  const estimateByItem = new Map<string, { products: number; addons: number; recipeCount: number }>();
  const recipeCountByItem = new Map<string, number>();

  for (const recipe of productRecipes) {
    if (!recipe.isActive) continue;
    recipeCountByItem.set(recipe.inventoryItemId, (recipeCountByItem.get(recipe.inventoryItemId) ?? 0) + 1);
  }
  for (const recipe of addonRecipes) {
    if (!recipe.isActive) continue;
    recipeCountByItem.set(recipe.inventoryItemId, (recipeCountByItem.get(recipe.inventoryItemId) ?? 0) + 1);
  }

  const productRecipeMap = new Map<string, InventoryProductRecipe[]>();
  for (const recipe of productRecipes) {
    if (!recipe.isActive) continue;
    const current = productRecipeMap.get(recipe.menuProductId) ?? [];
    current.push(recipe);
    productRecipeMap.set(recipe.menuProductId, current);
  }

  for (const row of (orderItems ?? []) as any[]) {
    const productId = String(row.menu_product_id ?? '').trim();
    const deliveredQty = deliveredUnits(row);
    if (!productId || deliveredQty <= 0) continue;
    const recipes = productRecipeMap.get(productId) ?? [];
    for (const recipe of recipes) {
      const multiplier = recipeMultiplier(recipe.quantityPerUnit, recipe.wastagePercent);
      const current = estimateByItem.get(recipe.inventoryItemId) ?? { products: 0, addons: 0, recipeCount: recipeCountByItem.get(recipe.inventoryItemId) ?? 0 };
      current.products += deliveredQty * multiplier;
      estimateByItem.set(recipe.inventoryItemId, current);
    }
  }

  const addonRecipeMap = new Map<string, InventoryAddonRecipe[]>();
  for (const recipe of addonRecipes) {
    if (!recipe.isActive) continue;
    const current = addonRecipeMap.get(recipe.menuAddonId) ?? [];
    current.push(recipe);
    addonRecipeMap.set(recipe.menuAddonId, current);
  }

  for (const row of (addonRows ?? []) as any[]) {
    const addonId = String(row.menu_addon_id ?? '').trim();
    if (!addonId) continue;
    const recipes = addonRecipeMap.get(addonId) ?? [];
    if (!recipes.length) continue;
    const orderItemRef = Array.isArray(row.order_items) ? row.order_items[0] : row.order_items;
    const totalQty = Number(orderItemRef?.qty_total ?? 0);
    const deliveredQty = deliveredUnits(orderItemRef ?? {});
    if (totalQty <= 0 || deliveredQty <= 0) continue;
    const soldRatio = Math.min(deliveredQty / totalQty, 1);
    const soldAddonQty = Number(row.quantity ?? 0) * soldRatio;
    if (soldAddonQty <= 0) continue;
    for (const recipe of recipes) {
      const multiplier = recipeMultiplier(recipe.quantityPerUnit, recipe.wastagePercent);
      const current = estimateByItem.get(recipe.inventoryItemId) ?? { products: 0, addons: 0, recipeCount: recipeCountByItem.get(recipe.inventoryItemId) ?? 0 };
      current.addons += soldAddonQty * multiplier;
      estimateByItem.set(recipe.inventoryItemId, current);
    }
  }

  const outflowByItem = new Map<string, number>();
  for (const row of (movementRows ?? []) as any[]) {
    const itemId = String(row.inventory_item_id ?? '').trim();
    const kind = String(row.movement_kind ?? '').trim();
    const delta = Number(row.delta_quantity ?? 0);
    if (!itemId || delta >= 0) continue;
    if (!['outbound', 'waste', 'adjustment'].includes(kind)) continue;
    outflowByItem.set(itemId, (outflowByItem.get(itemId) ?? 0) + Math.abs(delta));
  }

  return items
    .map((item) => {
      const estimates = estimateByItem.get(item.id) ?? { products: 0, addons: 0, recipeCount: recipeCountByItem.get(item.id) ?? 0 };
      const estimatedTotal = estimates.products + estimates.addons;
      const recordedOutflow = outflowByItem.get(item.id) ?? 0;
      const avgDailyConsumption = estimatedTotal > 0 ? estimatedTotal / INVENTORY_ANALYSIS_WINDOW_DAYS : 0;
      const coverageDays = avgDailyConsumption > 0 ? Number((item.currentBalance / avgDailyConsumption).toFixed(1)) : null;
      return {
        inventoryItemId: item.id,
        itemName: item.itemName,
        unitLabel: item.unitLabel,
        currentBalance: item.currentBalance,
        lowStockThreshold: item.lowStockThreshold,
        stockStatus: item.stockStatus,
        estimatedFromProducts: Number(estimates.products.toFixed(3)),
        estimatedFromAddons: Number(estimates.addons.toFixed(3)),
        estimatedTotal: Number(estimatedTotal.toFixed(3)),
        recordedOutflow: Number(recordedOutflow.toFixed(3)),
        varianceQuantity: Number((recordedOutflow - estimatedTotal).toFixed(3)),
        avgDailyConsumption: Number(avgDailyConsumption.toFixed(3)),
        coverageDays,
        recipeCount: estimates.recipeCount,
      } satisfies InventoryEstimatedConsumptionItem;
    })
    .filter((item) => item.recipeCount > 0 || item.stockStatus === 'low' || item.stockStatus === 'empty')
    .sort((a, b) => {
      const aCritical = (a.stockStatus === 'empty' ? 2 : a.stockStatus === 'low' ? 1 : 0) + (a.coverageDays !== null && a.coverageDays <= 3 ? 1 : 0);
      const bCritical = (b.stockStatus === 'empty' ? 2 : b.stockStatus === 'low' ? 1 : 0) + (b.coverageDays !== null && b.coverageDays <= 3 ? 1 : 0);
      if (bCritical !== aCritical) return bCritical - aCritical;
      if (b.estimatedTotal !== a.estimatedTotal) return b.estimatedTotal - a.estimatedTotal;
      return a.itemName.localeCompare(b.itemName, 'ar');
    });
}



type ShiftSnapshotRow = {
  id: string;
  shift_id: string;
  business_date: string | null;
  shift_kind: string | null;
  shift_status: string;
  snapshot_phase: 'preview' | 'closed' | string;
  generated_at: string;
  inventory_posted_at: string | null;
  inventory_posting_id: string | null;
  inventory_posted_by_owner_id: string | null;
  inventory_posting_summary_json: unknown;
  summary_json: unknown;
  snapshot_json: unknown;
};

type ShiftRowForInventorySnapshot = {
  id: string;
  business_date: string | null;
  shift_kind: string | null;
  status: string;
  opened_at: string | null;
  closed_at: string | null;
};

type OrderItemSnapshotRow = {
  menu_product_id: string;
  qty_total: number | string;
  qty_delivered: number | string;
  qty_replacement_delivered: number | string;
};

type OrderAddonSnapshotRow = {
  menu_addon_id: string;
  quantity: number | string;
  addon_name_snapshot: string | null;
  station_code: string | null;
  order_items: {
    qty_total?: number | string | null;
    qty_delivered?: number | string | null;
    qty_replacement_delivered?: number | string | null;
  } | Array<{
    qty_total?: number | string | null;
    qty_delivered?: number | string | null;
    qty_replacement_delivered?: number | string | null;
  }> | null;
};

function roundSnapshotQty(value: number) {
  return Number(value.toFixed(3));
}

function parseStoredShiftInventorySnapshot(row: ShiftSnapshotRow): ShiftInventorySnapshot {
  const snapshot = (row.snapshot_json ?? {}) as Record<string, any>;
  const summary = (snapshot.summary ?? row.summary_json ?? {}) as Record<string, any>;
  const postingSummary = (row.inventory_posting_summary_json ?? snapshot.posting ?? {}) as Record<string, any>;
  const lines = Array.isArray(snapshot.lines) ? snapshot.lines : [];
  const products = Array.isArray(snapshot.products) ? snapshot.products : [];
  const addons = Array.isArray(snapshot.addons) ? snapshot.addons : [];
  const posting: ShiftInventoryPostingSummary = {
    isPosted: !!(row.inventory_posted_at || row.inventory_posting_id || postingSummary.postedAt || postingSummary.postingId),
    postingId: row.inventory_posting_id ? String(row.inventory_posting_id) : postingSummary.postingId ? String(postingSummary.postingId) : null,
    postedAt: row.inventory_posted_at ? String(row.inventory_posted_at) : postingSummary.postedAt ? String(postingSummary.postedAt) : null,
    postedByOwnerId: row.inventory_posted_by_owner_id ? String(row.inventory_posted_by_owner_id) : null,
    totalInventoryItems: Number(postingSummary.totalInventoryItems ?? postingSummary.total_inventory_items ?? 0),
    totalConsumptionQty: Number(postingSummary.totalConsumptionQty ?? postingSummary.total_consumption_qty ?? 0),
    movementCount: Number(postingSummary.movementCount ?? postingSummary.movement_count ?? 0),
    alreadyPosted: Boolean(postingSummary.alreadyPosted ?? postingSummary.already_posted ?? false),
  };

  return {
    id: String(row.id),
    shiftId: String(row.shift_id),
    businessDate: row.business_date ? String(row.business_date) : null,
    shiftKind: row.shift_kind ? String(row.shift_kind) : null,
    shiftStatus: String(row.shift_status ?? 'open'),
    snapshotPhase: String(row.snapshot_phase ?? 'preview') === 'closed' ? 'closed' : 'preview',
    generatedAt: String(row.generated_at),
    posting,
    summary: {
      totalInventoryItems: Number(summary.totalInventoryItems ?? summary.total_inventory_items ?? 0),
      totalConsumptionQty: Number(summary.totalConsumptionQty ?? summary.total_consumption_qty ?? 0),
      productConsumptionQty: Number(summary.productConsumptionQty ?? summary.product_consumption_qty ?? 0),
      addonConsumptionQty: Number(summary.addonConsumptionQty ?? summary.addon_consumption_qty ?? 0),
      remakeWasteQty: Number(summary.remakeWasteQty ?? summary.remake_waste_qty ?? 0),
      remakeReplacementQty: Number(summary.remakeReplacementQty ?? summary.remake_replacement_qty ?? 0),
      coveredProductsCount: Number(summary.coveredProductsCount ?? summary.covered_products_count ?? 0),
      coveredAddonsCount: Number(summary.coveredAddonsCount ?? summary.covered_addons_count ?? 0),
    },
    lines: lines.map((line: any) => ({
      inventoryItemId: String(line.inventoryItemId ?? line.inventory_item_id ?? ''),
      itemName: String(line.itemName ?? line.item_name ?? ''),
      unitLabel: String(line.unitLabel ?? line.unit_label ?? ''),
      currentBalance: Number(line.currentBalance ?? line.current_balance ?? 0),
      lowStockThreshold: Number(line.lowStockThreshold ?? line.low_stock_threshold ?? 0),
      stockStatus: mapStockStatus(Number(line.currentBalance ?? line.current_balance ?? 0), Number(line.lowStockThreshold ?? line.low_stock_threshold ?? 0), String(line.stockStatus ?? line.stock_status ?? 'ok') !== 'inactive'),
      fromProducts: Number(line.fromProducts ?? line.from_products ?? 0),
      fromAddons: Number(line.fromAddons ?? line.from_addons ?? 0),
      remakeWasteQty: Number(line.remakeWasteQty ?? line.remake_waste_qty ?? 0),
      remakeReplacementQty: Number(line.remakeReplacementQty ?? line.remake_replacement_qty ?? 0),
      totalConsumption: Number(line.totalConsumption ?? line.total_consumption ?? 0),
      recipeSourcesCount: Number(line.recipeSourcesCount ?? line.recipe_sources_count ?? 0),
    }) satisfies ShiftInventorySnapshotLine),
    products: products.map((row: any) => ({
      menuProductId: String(row.menuProductId ?? row.menu_product_id ?? ''),
      productName: String(row.productName ?? row.product_name ?? ''),
      stationCode: mapStationCode(row.stationCode ?? row.station_code),
      acceptedOriginalQty: Number(row.acceptedOriginalQty ?? row.accepted_original_qty ?? 0),
      remakeWasteQty: Number(row.remakeWasteQty ?? row.remake_waste_qty ?? 0),
      remakeReplacementQty: Number(row.remakeReplacementQty ?? row.remake_replacement_qty ?? 0),
      totalPreparedQty: Number(row.totalPreparedQty ?? row.total_prepared_qty ?? 0),
      estimatedConsumptionQty: Number(row.estimatedConsumptionQty ?? row.estimated_consumption_qty ?? 0),
      recipeLinesCount: Number(row.recipeLinesCount ?? row.recipe_lines_count ?? 0),
    }) satisfies ShiftInventorySnapshotProduct),
    addons: addons.map((row: any) => ({
      menuAddonId: String(row.menuAddonId ?? row.menu_addon_id ?? ''),
      addonName: String(row.addonName ?? row.addon_name ?? ''),
      stationCode: mapStationCode(row.stationCode ?? row.station_code),
      acceptedOriginalQty: Number(row.acceptedOriginalQty ?? row.accepted_original_qty ?? 0),
      remakeWasteQty: Number(row.remakeWasteQty ?? row.remake_waste_qty ?? 0),
      remakeReplacementQty: Number(row.remakeReplacementQty ?? row.remake_replacement_qty ?? 0),
      totalPreparedQty: Number(row.totalPreparedQty ?? row.total_prepared_qty ?? 0),
      estimatedConsumptionQty: Number(row.estimatedConsumptionQty ?? row.estimated_consumption_qty ?? 0),
      recipeLinesCount: Number(row.recipeLinesCount ?? row.recipe_lines_count ?? 0),
    }) satisfies ShiftInventorySnapshotAddon),
  } satisfies ShiftInventorySnapshot;
}

export async function listRecentShiftInventorySnapshots(scope: CafeDatabaseScope, limit = 6): Promise<ShiftInventorySnapshot[]> {
  const { data, error } = await ops(scope.databaseKey)
    .from('shift_inventory_snapshots')
    .select('id, shift_id, business_date, shift_kind, shift_status, snapshot_phase, generated_at, inventory_posted_at, inventory_posting_id, inventory_posted_by_owner_id, inventory_posting_summary_json, summary_json, snapshot_json')
    .eq('cafe_id', scope.cafeId)
    .order('generated_at', { ascending: false })
    .limit(limit);

  if (error) {
    const message = String(error.message ?? '');
    if (/shift_inventory_snapshots/i.test(message) || /does not exist/i.test(message)) {
      return [];
    }
  }
  if (error) throw error;
  return ((data ?? []) as ShiftSnapshotRow[]).map(parseStoredShiftInventorySnapshot);
}



export async function buildShiftInventorySnapshot(input: CafeDatabaseScope & {
  shiftId: string;
  actorOwnerId?: string | null;
  persist?: boolean;
}): Promise<ShiftInventorySnapshot> {
  const admin = ops(input.databaseKey);
  const [shiftResult, items, menuProducts, menuAddons, productRecipeRows, addonRecipeRows, orderItemsResult, addonRowsResult] = await Promise.all([
    admin
      .from('shifts')
      .select('id, business_date, shift_kind, status, opened_at, closed_at')
      .eq('cafe_id', input.cafeId)
      .eq('id', input.shiftId)
      .maybeSingle(),
    listInventoryItems({ cafeId: input.cafeId, databaseKey: input.databaseKey }, true),
    listMenuProductSummaries({ cafeId: input.cafeId, databaseKey: input.databaseKey }),
    listMenuAddonSummaries({ cafeId: input.cafeId, databaseKey: input.databaseKey }),
    listProductRecipeRows({ cafeId: input.cafeId, databaseKey: input.databaseKey }),
    listAddonRecipeRows({ cafeId: input.cafeId, databaseKey: input.databaseKey }),
    admin
      .from('order_items')
      .select('menu_product_id, qty_total, qty_delivered, qty_replacement_delivered')
      .eq('cafe_id', input.cafeId)
      .eq('shift_id', input.shiftId),
    admin
      .from('order_item_addons')
      .select('menu_addon_id, quantity, addon_name_snapshot, station_code, order_items!inner(qty_total, qty_delivered, qty_replacement_delivered)')
      .eq('cafe_id', input.cafeId)
      .eq('order_items.shift_id', input.shiftId),
  ]);

  if (shiftResult.error) throw shiftResult.error;
  const shift = shiftResult.data as ShiftRowForInventorySnapshot | null;
  if (!shift) {
    throw new Error('shift_not_found');
  }
  if (orderItemsResult.error) throw orderItemsResult.error;
  if (addonRowsResult.error) throw addonRowsResult.error;

  const productRecipes = mapProductRecipes(productRecipeRows, menuProducts, items).filter((row) => row.isActive);
  const addonRecipes = mapAddonRecipes(addonRecipeRows, menuAddons, items).filter((row) => row.isActive);
  const itemMap = new Map(items.map((item) => [item.id, item]));
  const productRecipeMap = new Map<string, InventoryProductRecipe[]>();
  const addonRecipeMap = new Map<string, InventoryAddonRecipe[]>();

  for (const recipe of productRecipes) {
    const current = productRecipeMap.get(recipe.menuProductId) ?? [];
    current.push(recipe);
    productRecipeMap.set(recipe.menuProductId, current);
  }
  for (const recipe of addonRecipes) {
    const current = addonRecipeMap.get(recipe.menuAddonId) ?? [];
    current.push(recipe);
    addonRecipeMap.set(recipe.menuAddonId, current);
  }

  const lineMap = new Map<string, ShiftInventorySnapshotLine>();
  const sourceSetByItem = new Map<string, Set<string>>();
  const productSummaryMap = new Map<string, ShiftInventorySnapshotProduct>();
  const addonSummaryMap = new Map<string, ShiftInventorySnapshotAddon>();

  function ensureLine(inventoryItemId: string) {
    const existing = lineMap.get(inventoryItemId);
    if (existing) return existing;
    const item = itemMap.get(inventoryItemId);
    if (!item) {
      throw new Error('inventory_item_not_found_for_snapshot');
    }
    const created: ShiftInventorySnapshotLine = {
      inventoryItemId,
      itemName: item.itemName,
      unitLabel: item.unitLabel,
      currentBalance: Number(item.currentBalance ?? 0),
      lowStockThreshold: Number(item.lowStockThreshold ?? 0),
      stockStatus: item.stockStatus,
      fromProducts: 0,
      fromAddons: 0,
      remakeWasteQty: 0,
      remakeReplacementQty: 0,
      totalConsumption: 0,
      recipeSourcesCount: 0,
    };
    lineMap.set(inventoryItemId, created);
    sourceSetByItem.set(inventoryItemId, new Set());
    return created;
  }

  for (const row of (orderItemsResult.data ?? []) as OrderItemSnapshotRow[]) {
    const menuProductId = String(row.menu_product_id ?? '').trim();
    if (!menuProductId) continue;
    const deliveredQty = Number(row.qty_delivered ?? 0);
    const replacementDeliveredQty = Number(row.qty_replacement_delivered ?? 0);
    const acceptedOriginalQty = Math.max(deliveredQty - replacementDeliveredQty, 0);
    const remakeWasteQty = Math.max(replacementDeliveredQty, 0);
    const remakeReplacementQty = Math.max(replacementDeliveredQty, 0);
    const totalPreparedQty = acceptedOriginalQty + remakeWasteQty + remakeReplacementQty;
    const recipes = productRecipeMap.get(menuProductId) ?? [];
    if (totalPreparedQty <= 0 || !recipes.length) continue;

    let estimatedConsumptionQty = 0;
    for (const recipe of recipes) {
      const multiplier = recipeMultiplier(recipe.quantityPerUnit, recipe.wastagePercent);
      const consumption = totalPreparedQty * multiplier;
      const wasteConsumption = remakeWasteQty * multiplier;
      const replacementConsumption = remakeReplacementQty * multiplier;
      const line = ensureLine(recipe.inventoryItemId);
      line.fromProducts += consumption;
      line.remakeWasteQty += wasteConsumption;
      line.remakeReplacementQty += replacementConsumption;
      line.totalConsumption += consumption;
      sourceSetByItem.get(recipe.inventoryItemId)?.add(`product:${menuProductId}`);
      estimatedConsumptionQty += consumption;
    }

    const existingProduct = productSummaryMap.get(menuProductId);
    if (existingProduct) {
      existingProduct.acceptedOriginalQty += acceptedOriginalQty;
      existingProduct.remakeWasteQty += remakeWasteQty;
      existingProduct.remakeReplacementQty += remakeReplacementQty;
      existingProduct.totalPreparedQty += totalPreparedQty;
      existingProduct.estimatedConsumptionQty += estimatedConsumptionQty;
      existingProduct.recipeLinesCount = Math.max(existingProduct.recipeLinesCount, recipes.length);
    } else {
      const product = menuProducts.find((item) => item.id === menuProductId);
      productSummaryMap.set(menuProductId, {
        menuProductId,
        productName: product?.name ?? menuProductId,
        stationCode: product?.stationCode ?? 'barista',
        acceptedOriginalQty,
        remakeWasteQty,
        remakeReplacementQty,
        totalPreparedQty,
        estimatedConsumptionQty,
        recipeLinesCount: recipes.length,
      });
    }
  }

  for (const row of (addonRowsResult.data ?? []) as OrderAddonSnapshotRow[]) {
    const menuAddonId = String(row.menu_addon_id ?? '').trim();
    if (!menuAddonId) continue;
    const recipes = addonRecipeMap.get(menuAddonId) ?? [];
    if (!recipes.length) continue;
    const orderItemRef = Array.isArray(row.order_items) ? row.order_items[0] : row.order_items;
    const totalQty = Number(orderItemRef?.qty_total ?? 0);
    const deliveredQty = Number(orderItemRef?.qty_delivered ?? 0);
    const replacementDeliveredQty = Number(orderItemRef?.qty_replacement_delivered ?? 0);
    const acceptedOriginalQty = Math.max(deliveredQty - replacementDeliveredQty, 0);
    const remakeWasteQty = Math.max(replacementDeliveredQty, 0);
    const remakeReplacementQty = Math.max(replacementDeliveredQty, 0);
    const totalPreparedQty = acceptedOriginalQty + remakeWasteQty + remakeReplacementQty;
    const baseQuantity = Number(row.quantity ?? 0);
    if (totalQty <= 0 || totalPreparedQty <= 0 || baseQuantity <= 0) continue;

    const acceptedAddonUnits = baseQuantity * (acceptedOriginalQty / totalQty);
    const remakeWasteAddonUnits = baseQuantity * (remakeWasteQty / totalQty);
    const remakeReplacementAddonUnits = baseQuantity * (remakeReplacementQty / totalQty);
    const totalAddonUnits = acceptedAddonUnits + remakeWasteAddonUnits + remakeReplacementAddonUnits;

    let estimatedConsumptionQty = 0;
    for (const recipe of recipes) {
      const multiplier = recipeMultiplier(recipe.quantityPerUnit, recipe.wastagePercent);
      const consumption = totalAddonUnits * multiplier;
      const wasteConsumption = remakeWasteAddonUnits * multiplier;
      const replacementConsumption = remakeReplacementAddonUnits * multiplier;
      const line = ensureLine(recipe.inventoryItemId);
      line.fromAddons += consumption;
      line.remakeWasteQty += wasteConsumption;
      line.remakeReplacementQty += replacementConsumption;
      line.totalConsumption += consumption;
      sourceSetByItem.get(recipe.inventoryItemId)?.add(`addon:${menuAddonId}`);
      estimatedConsumptionQty += consumption;
    }

    const existingAddon = addonSummaryMap.get(menuAddonId);
    if (existingAddon) {
      existingAddon.acceptedOriginalQty += acceptedAddonUnits;
      existingAddon.remakeWasteQty += remakeWasteAddonUnits;
      existingAddon.remakeReplacementQty += remakeReplacementAddonUnits;
      existingAddon.totalPreparedQty += totalAddonUnits;
      existingAddon.estimatedConsumptionQty += estimatedConsumptionQty;
      existingAddon.recipeLinesCount = Math.max(existingAddon.recipeLinesCount, recipes.length);
    } else {
      const addon = menuAddons.find((item) => item.id === menuAddonId);
      addonSummaryMap.set(menuAddonId, {
        menuAddonId,
        addonName: addon?.name ?? String(row.addon_name_snapshot ?? menuAddonId),
        stationCode: addon?.stationCode ?? mapStationCode(row.station_code),
        acceptedOriginalQty: acceptedAddonUnits,
        remakeWasteQty: remakeWasteAddonUnits,
        remakeReplacementQty: remakeReplacementAddonUnits,
        totalPreparedQty: totalAddonUnits,
        estimatedConsumptionQty,
        recipeLinesCount: recipes.length,
      });
    }
  }

  const lines = Array.from(lineMap.values())
    .map((line) => ({
      ...line,
      fromProducts: roundSnapshotQty(line.fromProducts),
      fromAddons: roundSnapshotQty(line.fromAddons),
      remakeWasteQty: roundSnapshotQty(line.remakeWasteQty),
      remakeReplacementQty: roundSnapshotQty(line.remakeReplacementQty),
      totalConsumption: roundSnapshotQty(line.totalConsumption),
      recipeSourcesCount: sourceSetByItem.get(line.inventoryItemId)?.size ?? 0,
    }))
    .sort((a, b) => (b.totalConsumption - a.totalConsumption) || a.itemName.localeCompare(b.itemName, 'ar'));

  const products = Array.from(productSummaryMap.values())
    .map((row) => ({
      ...row,
      acceptedOriginalQty: roundSnapshotQty(row.acceptedOriginalQty),
      remakeWasteQty: roundSnapshotQty(row.remakeWasteQty),
      remakeReplacementQty: roundSnapshotQty(row.remakeReplacementQty),
      totalPreparedQty: roundSnapshotQty(row.totalPreparedQty),
      estimatedConsumptionQty: roundSnapshotQty(row.estimatedConsumptionQty),
    }))
    .sort((a, b) => (b.estimatedConsumptionQty - a.estimatedConsumptionQty) || a.productName.localeCompare(b.productName, 'ar'));

  const addons = Array.from(addonSummaryMap.values())
    .map((row) => ({
      ...row,
      acceptedOriginalQty: roundSnapshotQty(row.acceptedOriginalQty),
      remakeWasteQty: roundSnapshotQty(row.remakeWasteQty),
      remakeReplacementQty: roundSnapshotQty(row.remakeReplacementQty),
      totalPreparedQty: roundSnapshotQty(row.totalPreparedQty),
      estimatedConsumptionQty: roundSnapshotQty(row.estimatedConsumptionQty),
    }))
    .sort((a, b) => (b.estimatedConsumptionQty - a.estimatedConsumptionQty) || a.addonName.localeCompare(b.addonName, 'ar'));

  const productConsumptionQty = roundSnapshotQty(lines.reduce((sum, line) => sum + line.fromProducts, 0));
  const addonConsumptionQty = roundSnapshotQty(lines.reduce((sum, line) => sum + line.fromAddons, 0));
  const remakeWasteQty = roundSnapshotQty(lines.reduce((sum, line) => sum + line.remakeWasteQty, 0));
  const remakeReplacementQty = roundSnapshotQty(lines.reduce((sum, line) => sum + line.remakeReplacementQty, 0));
  const summary = {
    totalInventoryItems: lines.length,
    totalConsumptionQty: roundSnapshotQty(productConsumptionQty + addonConsumptionQty),
    productConsumptionQty,
    addonConsumptionQty,
    remakeWasteQty,
    remakeReplacementQty,
    coveredProductsCount: products.length,
    coveredAddonsCount: addons.length,
  };

  const snapshotPayload = {
    version: 1,
    shift: {
      shift_id: shift.id,
      business_date: shift.business_date,
      shift_kind: shift.shift_kind,
      status: shift.status,
      opened_at: shift.opened_at,
      closed_at: shift.closed_at,
      snapshotTakenAt: new Date().toISOString(),
      snapshotPhase: shift.status === 'closed' ? 'closed' : 'preview',
    },
    summary,
    lines,
    products,
    addons,
  };

  let snapshotId = input.shiftId;
  let generatedAt = snapshotPayload.shift.snapshotTakenAt as string;
  let posting: ShiftInventoryPostingSummary = {
    isPosted: false,
    postingId: null,
    postedAt: null,
    postedByOwnerId: null,
    totalInventoryItems: 0,
    totalConsumptionQty: 0,
    movementCount: 0,
    alreadyPosted: false,
  };
  if (input.persist !== false) {
    const upsert = await admin
      .from('shift_inventory_snapshots')
      .upsert({
        cafe_id: input.cafeId,
        shift_id: input.shiftId,
        business_date: shift.business_date,
        shift_kind: shift.shift_kind,
        shift_status: shift.status,
        snapshot_phase: shift.status === 'closed' ? 'closed' : 'preview',
        summary_json: summary,
        snapshot_json: snapshotPayload,
        generated_at: generatedAt,
        created_by_owner_id: input.actorOwnerId ?? null,
      }, { onConflict: 'cafe_id,shift_id' })
      .select('id, generated_at, inventory_posted_at, inventory_posting_id, inventory_posted_by_owner_id, inventory_posting_summary_json')
      .single();
    if (upsert.error) {
      const message = String(upsert.error.message ?? '');
      if (!/does not exist/i.test(message)) {
        throw upsert.error;
      }
    } else {
      snapshotId = String(upsert.data.id);
      generatedAt = String(upsert.data.generated_at ?? generatedAt);
      const persistedPostingSummary = (upsert.data.inventory_posting_summary_json ?? {}) as Record<string, unknown>;
      posting = {
        isPosted: !!(upsert.data.inventory_posted_at ?? upsert.data.inventory_posting_id),
        postingId: upsert.data.inventory_posting_id ? String(upsert.data.inventory_posting_id) : null,
        postedAt: upsert.data.inventory_posted_at ? String(upsert.data.inventory_posted_at) : null,
        postedByOwnerId: upsert.data.inventory_posted_by_owner_id ? String(upsert.data.inventory_posted_by_owner_id) : null,
        totalInventoryItems: Number(persistedPostingSummary.totalInventoryItems ?? persistedPostingSummary.total_inventory_items ?? 0),
        totalConsumptionQty: Number(persistedPostingSummary.totalConsumptionQty ?? persistedPostingSummary.total_consumption_qty ?? 0),
        movementCount: Number(persistedPostingSummary.movementCount ?? persistedPostingSummary.movement_count ?? 0),
        alreadyPosted: Boolean(persistedPostingSummary.alreadyPosted ?? persistedPostingSummary.already_posted ?? false),
      };
      const deleteLines = await admin
        .from('shift_inventory_snapshot_lines')
        .delete()
        .eq('cafe_id', input.cafeId)
        .eq('shift_id', input.shiftId);
      if (deleteLines.error && !/does not exist/i.test(String(deleteLines.error.message ?? ''))) {
        throw deleteLines.error;
      }
      if (lines.length) {
        const insertLines = await admin
          .from('shift_inventory_snapshot_lines')
          .insert(lines.map((line) => ({
            cafe_id: input.cafeId,
            shift_inventory_snapshot_id: snapshotId,
            shift_id: input.shiftId,
            inventory_item_id: line.inventoryItemId,
            item_name_snapshot: line.itemName,
            unit_label_snapshot: line.unitLabel,
            current_balance_snapshot: line.currentBalance,
            low_stock_threshold_snapshot: line.lowStockThreshold,
            stock_status_snapshot: line.stockStatus,
            from_products: line.fromProducts,
            from_addons: line.fromAddons,
            remake_waste_qty: line.remakeWasteQty,
            remake_replacement_qty: line.remakeReplacementQty,
            total_consumption: line.totalConsumption,
            recipe_sources_count: line.recipeSourcesCount,
            detail_json: {
              fromProducts: line.fromProducts,
              fromAddons: line.fromAddons,
              remakeWasteQty: line.remakeWasteQty,
              remakeReplacementQty: line.remakeReplacementQty,
            },
          })));
        if (insertLines.error && !/does not exist/i.test(String(insertLines.error.message ?? ''))) {
          throw insertLines.error;
        }
      }
    }
  }

  return {
    id: snapshotId,
    shiftId: input.shiftId,
    businessDate: shift.business_date,
    shiftKind: shift.shift_kind,
    shiftStatus: shift.status,
    snapshotPhase: shift.status === 'closed' ? 'closed' : 'preview',
    generatedAt,
    posting,
    summary,
    lines,
    products,
    addons,
  } satisfies ShiftInventorySnapshot;
}


type ShiftInventoryPostingRpcResult = {
  posting_id?: string | null;
  already_posted?: boolean | null;
  posted_at?: string | null;
  total_inventory_items?: number | string | null;
  total_consumption_qty?: number | string | null;
  movement_count?: number | string | null;
  shift_id?: string | null;
  snapshot_id?: string | null;
};

export async function postShiftInventorySnapshot(input: CafeDatabaseScope & {
  shiftId: string;
  actorOwnerId: string;
  notes?: string | null;
}): Promise<ShiftInventoryPostingSummary> {
  const rpc = await supabaseAdminForDatabase(input.databaseKey).rpc('ops_post_shift_inventory_snapshot', {
    p_cafe_id: input.cafeId,
    p_shift_id: input.shiftId,
    p_actor_owner_id: input.actorOwnerId,
    p_notes: input.notes ?? null,
  });

  if (rpc.error) throw rpc.error;

  const data = ((rpc.data ?? {}) as ShiftInventoryPostingRpcResult);
  return {
    isPosted: true,
    postingId: data.posting_id ? String(data.posting_id) : null,
    postedAt: data.posted_at ? String(data.posted_at) : null,
    postedByOwnerId: input.actorOwnerId,
    totalInventoryItems: Number(data.total_inventory_items ?? 0),
    totalConsumptionQty: Number(data.total_consumption_qty ?? 0),
    movementCount: Number(data.movement_count ?? data.total_inventory_items ?? 0),
    alreadyPosted: Boolean(data.already_posted ?? false),
  } satisfies ShiftInventoryPostingSummary;
}


export async function loadInventoryWorkspace(scope: CafeDatabaseScope): Promise<InventoryWorkspace> {
  const [items, suppliers, movementRows, menuProducts, menuAddons, productRecipeRows, addonRecipeRows, recentShiftSnapshots] = await Promise.all([
    listInventoryItems(scope, true),
    listInventorySuppliers(scope, true),
    listInventoryMovementRows(scope, 80),
    listMenuProductSummaries(scope),
    listMenuAddonSummaries(scope),
    listProductRecipeRows(scope),
    listAddonRecipeRows(scope),
    listRecentShiftInventorySnapshots(scope, 8),
  ]);

  const itemMap = new Map(items.map((item) => [item.id, item]));
  const supplierMap = new Map(suppliers.map((supplier) => [supplier.id, supplier]));

  const recentMovements = movementRows.map((row) => ({
    id: row.id,
    inventoryItemId: row.inventory_item_id,
    itemName: itemMap.get(row.inventory_item_id)?.itemName ?? 'خامة محذوفة',
    supplierId: row.supplier_id,
    supplierName: row.supplier_id ? supplierMap.get(row.supplier_id)?.supplierName ?? null : null,
    movementKind: (row.movement_kind === 'outbound' || row.movement_kind === 'waste' || row.movement_kind === 'adjustment' ? row.movement_kind : 'inbound') as InventoryMovementKind,
    deltaQuantity: Number(row.delta_quantity ?? 0),
    unitLabel: row.unit_label,
    inputQuantity: row.input_quantity === null ? null : Number(row.input_quantity ?? 0),
    inputUnitLabel: row.input_unit_label,
    conversionFactor: row.conversion_factor === null ? null : Number(row.conversion_factor ?? 1),
    notes: row.notes,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
  }) satisfies InventoryMovement);

  const productRecipes = mapProductRecipes(productRecipeRows, menuProducts, items);
  const addonRecipes = mapAddonRecipes(addonRecipeRows, menuAddons, items);
  const estimatedConsumption = await buildEstimatedConsumption(scope, items, productRecipes, addonRecipes);

  return {
    items,
    suppliers,
    recentMovements,
    menuProducts,
    menuAddons,
    productRecipes,
    addonRecipes,
    estimatedConsumption,
    recentShiftSnapshots,
    analysisWindowDays: INVENTORY_ANALYSIS_WINDOW_DAYS,
  } satisfies InventoryWorkspace;
}
