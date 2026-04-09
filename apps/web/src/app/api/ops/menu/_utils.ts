import { adminOps } from '@/app/api/ops/_server';
import { kickOpsOutboxDispatch, type OpsActorContext } from '@/app/api/ops/_helpers';
import { invalidateMenuWorkspaceCaches } from '@/app/api/ops/_cache';

export function normalizeStationCode(value: unknown) {
  if (value === 'shisha') return value;
  return 'barista' as const;
}

export async function nextSectionSortOrder(cafeId: string, databaseKey: string) {
  const { data, error } = await adminOps(databaseKey)
    .from('menu_sections')
    .select('sort_order')
    .eq('cafe_id', cafeId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return Number(data?.sort_order ?? -1) + 1;
}

export async function nextProductSortOrder(cafeId: string, sectionId: string, databaseKey: string) {
  const { data, error } = await adminOps(databaseKey)
    .from('menu_products')
    .select('sort_order')
    .eq('cafe_id', cafeId)
    .eq('section_id', sectionId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return Number(data?.sort_order ?? -1) + 1;
}

export async function loadSection(cafeId: string, sectionId: string, databaseKey: string) {
  const { data, error } = await adminOps(databaseKey)
    .from('menu_sections')
    .select('id, title, station_code, sort_order, is_active')
    .eq('cafe_id', cafeId)
    .eq('id', sectionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('SECTION_NOT_FOUND');
  return data;
}

export async function loadProduct(cafeId: string, productId: string, databaseKey: string) {
  const { data, error } = await adminOps(databaseKey)
    .from('menu_products')
    .select('id, section_id, product_name, station_code, unit_price, sort_order, is_active')
    .eq('cafe_id', cafeId)
    .eq('id', productId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('PRODUCT_NOT_FOUND');
  return data;
}

export async function productUsageCount(cafeId: string, productId: string, databaseKey: string) {
  const { count, error } = await adminOps(databaseKey)
    .from('order_items')
    .select('id', { count: 'exact', head: true })
    .eq('cafe_id', cafeId)
    .eq('menu_product_id', productId);
  if (error) throw error;
  return Number(count ?? 0);
}

export async function sectionUsageCount(cafeId: string, sectionId: string, databaseKey: string) {
  const { data: products, error: productsError } = await adminOps(databaseKey)
    .from('menu_products')
    .select('id')
    .eq('cafe_id', cafeId)
    .eq('section_id', sectionId);
  if (productsError) throw productsError;
  const productIds = (products ?? []).map((row) => String(row.id)).filter(Boolean);
  if (!productIds.length) return 0;
  const { count, error } = await adminOps(databaseKey)
    .from('order_items')
    .select('id', { count: 'exact', head: true })
    .eq('cafe_id', cafeId)
    .in('menu_product_id', productIds);
  if (error) throw error;
  return Number(count ?? 0);
}

export async function renumberSectionSortOrders(cafeId: string, databaseKey: string) {
  const { data, error } = await adminOps(databaseKey)
    .from('menu_sections')
    .select('id')
    .eq('cafe_id', cafeId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  for (const [index, row] of (data ?? []).entries()) {
    const { error: updateError } = await adminOps(databaseKey)
      .from('menu_sections')
      .update({ sort_order: index })
      .eq('cafe_id', cafeId)
      .eq('id', String(row.id));
    if (updateError) throw updateError;
  }
}

export async function renumberProductSortOrders(cafeId: string, sectionId: string, databaseKey: string) {
  const { data, error } = await adminOps(databaseKey)
    .from('menu_products')
    .select('id')
    .eq('cafe_id', cafeId)
    .eq('section_id', sectionId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  for (const [index, row] of (data ?? []).entries()) {
    const { error: updateError } = await adminOps(databaseKey)
      .from('menu_products')
      .update({ sort_order: index })
      .eq('cafe_id', cafeId)
      .eq('id', String(row.id));
    if (updateError) throw updateError;
  }
}


export async function nextAddonSortOrder(cafeId: string, databaseKey: string) {
  const { data, error } = await adminOps(databaseKey)
    .from('menu_addons')
    .select('sort_order')
    .eq('cafe_id', cafeId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return Number(data?.sort_order ?? -1) + 1;
}

export async function loadAddon(cafeId: string, addonId: string, databaseKey: string) {
  const { data, error } = await adminOps(databaseKey)
    .from('menu_addons')
    .select('id, addon_name, station_code, unit_price, sort_order, is_active')
    .eq('cafe_id', cafeId)
    .eq('id', addonId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('ADDON_NOT_FOUND');
  return data;
}

export async function renumberAddonSortOrders(cafeId: string, databaseKey: string) {
  const { data, error } = await adminOps(databaseKey)
    .from('menu_addons')
    .select('id')
    .eq('cafe_id', cafeId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  for (const [index, row] of (data ?? []).entries()) {
    const { error: updateError } = await adminOps(databaseKey)
      .from('menu_addons')
      .update({ sort_order: index })
      .eq('cafe_id', cafeId)
      .eq('id', String(row.id));
    if (updateError) throw updateError;
  }
}

export async function addonUsageCount(cafeId: string, addonId: string, databaseKey: string) {
  const { count, error } = await adminOps(databaseKey)
    .from('order_item_addons')
    .select('id', { count: 'exact', head: true })
    .eq('cafe_id', cafeId)
    .eq('menu_addon_id', addonId);
  if (error) throw error;
  return Number(count ?? 0);
}


export function finalizeMenuMutation(ctx: Pick<OpsActorContext, 'cafeId' | 'databaseKey'>) {
  invalidateMenuWorkspaceCaches(ctx.cafeId, ctx.databaseKey);
  kickOpsOutboxDispatch(ctx);
}
