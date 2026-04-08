import { adminOps } from '@/app/api/ops/_server';

type SelectedOrderAddon = {
  addonId: string;
};

type RequestedOrderItem = {
  productId: string;
  quantity: number;
  addonIds?: string[];
};

type PersistAddonsInput = {
  cafeId: string;
  orderId: string;
  databaseKey: string;
  items: RequestedOrderItem[];
};

type ValidAddonRow = {
  menu_product_id: string;
  menu_addon_id: string;
  addon_name: string;
  station_code: string;
  unit_price: number | string | null;
  is_active: boolean | null;
};

type CreatedOrderItemRow = {
  id: string;
  menu_product_id: string;
  qty_total: number | string | null;
  unit_price: number | string | null;
  notes: string | null;
};

function normalizeAddonIds(addonIds: string[] | undefined): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of addonIds ?? []) {
    const id = String(value ?? '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    normalized.push(id);
  }
  return normalized;
}

function buildAddonSummary(addons: Array<{ name: string }>): string | null {
  if (!addons.length) return null;
  return `إضافات: ${addons.map((addon) => addon.name).join(' + ')}`;
}

function appendAddonSummaryToNotes(existingNotes: string | null | undefined, addonSummary: string | null): string | null {
  const base = String(existingNotes ?? '').trim();
  const summary = String(addonSummary ?? '').trim();
  if (!summary) return base || null;
  if (!base) return summary;
  if (base.includes(summary)) return base;
  return `${base} | ${summary}`;
}

export async function persistOrderItemAddons(input: PersistAddonsInput): Promise<void> {
  const requestedItems = input.items.map((item) => ({
    productId: String(item.productId ?? '').trim(),
    quantity: Number(item.quantity ?? 0),
    addonIds: normalizeAddonIds(item.addonIds),
  }));

  const itemsWithAddons = requestedItems.filter((item) => item.productId && item.quantity > 0 && item.addonIds.length > 0);
  if (!itemsWithAddons.length) {
    return;
  }

  const productIdToItem = new Map<string, (typeof itemsWithAddons)[number]>();
  for (const item of itemsWithAddons) {
    if (productIdToItem.has(item.productId)) {
      throw new Error('DUPLICATE_PRODUCT_ADDON_SELECTION_NOT_SUPPORTED');
    }
    productIdToItem.set(item.productId, item);
  }

  const productIds = [...productIdToItem.keys()];
  const addonIds = [...new Set(itemsWithAddons.flatMap((item) => item.addonIds))];
  const admin = adminOps(input.databaseKey);

  const [{ data: createdOrderItems, error: orderItemsError }, { data: validAddonRows, error: addonRowsError }] = await Promise.all([
    admin
      .from('order_items')
      .select('id, menu_product_id, qty_total, unit_price, notes')
      .eq('cafe_id', input.cafeId)
      .eq('order_id', input.orderId)
      .in('menu_product_id', productIds),
    admin
      .from('menu_product_addons')
      .select('menu_product_id, menu_addon_id, menu_addons!inner(addon_name, station_code, unit_price, is_active)')
      .eq('cafe_id', input.cafeId)
      .in('menu_product_id', productIds)
      .in('menu_addon_id', addonIds),
  ]);

  if (orderItemsError) throw orderItemsError;
  if (addonRowsError) throw addonRowsError;

  const orderItemsByProductId = new Map<string, CreatedOrderItemRow>();
  for (const row of (createdOrderItems ?? []) as any[]) {
    const productId = String(row.menu_product_id ?? '').trim();
    if (productId && !orderItemsByProductId.has(productId)) {
      orderItemsByProductId.set(productId, row as CreatedOrderItemRow);
    }
  }

  const allowedAddonsByProductId = new Map<string, ValidAddonRow[]>();
  for (const row of (validAddonRows ?? []) as any[]) {
    const addonRef = Array.isArray(row.menu_addons) ? row.menu_addons[0] : row.menu_addons;
    const normalized: ValidAddonRow = {
      menu_product_id: String(row.menu_product_id ?? ''),
      menu_addon_id: String(row.menu_addon_id ?? ''),
      addon_name: String(addonRef?.addon_name ?? ''),
      station_code: String(addonRef?.station_code ?? ''),
      unit_price: addonRef?.unit_price ?? 0,
      is_active: Boolean(addonRef?.is_active),
    };
    if (!normalized.menu_product_id || !normalized.menu_addon_id || !normalized.is_active) continue;
    const current = allowedAddonsByProductId.get(normalized.menu_product_id);
    if (current) current.push(normalized);
    else allowedAddonsByProductId.set(normalized.menu_product_id, [normalized]);
  }

  const addonInsertRows: Array<Record<string, unknown>> = [];
  for (const item of itemsWithAddons) {
    const createdOrderItem = orderItemsByProductId.get(item.productId);
    if (!createdOrderItem?.id) {
      throw new Error('ORDER_ITEM_NOT_FOUND_FOR_ADDONS');
    }

    const validAddons = allowedAddonsByProductId.get(item.productId) ?? [];
    const validAddonMap = new Map(validAddons.map((row) => [row.menu_addon_id, row]));
    const selectedAddons = item.addonIds.map((addonId) => validAddonMap.get(addonId)).filter((row): row is ValidAddonRow => Boolean(row));
    if (selectedAddons.length !== item.addonIds.length) {
      throw new Error('INVALID_PRODUCT_ADDON_SELECTION');
    }

    const addonUnitTotal = selectedAddons.reduce((sum, addon) => sum + Number(addon.unit_price ?? 0), 0);
    const nextUnitPrice = Number(createdOrderItem.unit_price ?? 0) + addonUnitTotal;
    const addonSummary = buildAddonSummary(selectedAddons.map((addon) => ({ name: addon.addon_name })));
    const nextNotes = appendAddonSummaryToNotes(createdOrderItem.notes, addonSummary);

    const { error: updateOrderItemError } = await admin
      .from('order_items')
      .update({ unit_price: nextUnitPrice, notes: nextNotes })
      .eq('cafe_id', input.cafeId)
      .eq('id', createdOrderItem.id);
    if (updateOrderItemError) throw updateOrderItemError;

    for (const addon of selectedAddons) {
      addonInsertRows.push({
        cafe_id: input.cafeId,
        order_item_id: createdOrderItem.id,
        menu_addon_id: addon.menu_addon_id,
        addon_name_snapshot: addon.addon_name,
        station_code: addon.station_code,
        unit_price: Number(addon.unit_price ?? 0),
        quantity: item.quantity,
      });
    }
  }

  if (!addonInsertRows.length) {
    return;
  }

  const { error: insertAddonsError } = await admin.from('order_item_addons').insert(addonInsertRows);
  if (insertAddonsError) throw insertAddonsError;
}
