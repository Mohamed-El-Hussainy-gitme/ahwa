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
  StationCode,
} from '@/lib/ops/types';
import { cleanCustomerText, normalizeCustomerName } from '@/lib/ops/customers';
import { supabaseAdminForDatabase } from '@/lib/supabase/admin';

type CafeDatabaseScope = {
  cafeId: string;
  databaseKey: string;
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
    .select('id, item_name, normalized_name, item_code, category_label, unit_label, current_balance, low_stock_threshold, notes, is_active, last_movement_at, created_at, updated_at')
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
  lowStockThreshold?: number;
  notes?: string | null;
  openingBalance?: number;
}) {
  const { data, error } = await ops(input.databaseKey)
    .from('inventory_items')
    .insert({
      cafe_id: input.cafeId,
      item_name: input.itemName,
      normalized_name: input.normalizedName,
      item_code: input.itemCode ?? null,
      category_label: input.categoryLabel ?? null,
      unit_label: input.unitLabel,
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
    await recordInventoryMovement({
      cafeId: input.cafeId,
      databaseKey: input.databaseKey,
      actorOwnerId: input.actorOwnerId,
      inventoryItemId: itemId,
      movementKind: 'adjustment',
      deltaQuantity: input.openingBalance ?? 0,
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
  lowStockThreshold?: number;
  notes?: string | null;
  isActive?: boolean;
}) {
  const { error } = await ops(input.databaseKey)
    .from('inventory_items')
    .update({
      item_name: input.itemName,
      normalized_name: input.normalizedName,
      item_code: input.itemCode ?? null,
      category_label: input.categoryLabel ?? null,
      unit_label: input.unitLabel,
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
  notes: string | null;
  occurred_at: string;
  created_at: string;
};

async function listInventoryMovementRows(scope: CafeDatabaseScope, limit = 60): Promise<InventoryMovementRow[]> {
  const { data, error } = await ops(scope.databaseKey)
    .from('inventory_movements')
    .select('id, inventory_item_id, supplier_id, movement_kind, delta_quantity, unit_label, notes, occurred_at, created_at')
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
  });

  if (rpc.error) throw rpc.error;
  return (rpc.data ?? {}) as { movement_id?: string | null; new_balance?: number | null; unit_label?: string | null };
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

export async function loadInventoryWorkspace(scope: CafeDatabaseScope): Promise<InventoryWorkspace> {
  const [items, suppliers, movementRows, menuProducts, menuAddons, productRecipeRows, addonRecipeRows] = await Promise.all([
    listInventoryItems(scope, true),
    listInventorySuppliers(scope, true),
    listInventoryMovementRows(scope, 80),
    listMenuProductSummaries(scope),
    listMenuAddonSummaries(scope),
    listProductRecipeRows(scope),
    listAddonRecipeRows(scope),
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
    analysisWindowDays: INVENTORY_ANALYSIS_WINDOW_DAYS,
  } satisfies InventoryWorkspace;
}
