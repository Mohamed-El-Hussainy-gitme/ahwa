import 'server-only';

import { cache } from 'react';
import { controlPlaneAdmin } from '@/lib/control-plane/admin';

export type ControlPlaneCafeRoute = {
  cafeId: string;
  cafeSlug: string;
  cafeDisplayName: string;
  cafeIsActive: boolean;
  databaseKey: string;
  databaseDisplayName: string | null;
  databaseStatus: string | null;
  isAcceptingNewCafes: boolean | null;
  isDefaultDatabase: boolean | null;
  schemaVersion: string | null;
  bindingBoundAt: string | null;
  bindingUpdatedAt: string | null;
  bindingNotes: string | null;
  bindingSource: 'binding' | 'default-fallback';
};

type CafeRow = {
  id: string;
  slug: string;
  display_name: string | null;
  is_active: boolean | null;
};

type BindingRow = {
  cafe_id: string;
  database_key: string;
  database_display_name: string | null;
  database_status: string | null;
  is_accepting_new_cafes: boolean | null;
  is_default: boolean | null;
  schema_version: string | null;
  bound_at: string | null;
  updated_at: string | null;
  notes: string | null;
};

type DefaultDatabaseRow = { database_key: string };

const readCafeBySlug = cache(async (slug: string): Promise<CafeRow | null> => {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return null;

  const { data, error } = await controlPlaneAdmin()
    .schema('ops')
    .from('cafes')
    .select('id, slug, display_name, is_active')
    .eq('slug', normalized)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return data as CafeRow;
});

const readCafeById = cache(async (cafeId: string): Promise<CafeRow | null> => {
  const normalized = cafeId.trim();
  if (!normalized) return null;

  const { data, error } = await controlPlaneAdmin()
    .schema('ops')
    .from('cafes')
    .select('id, slug, display_name, is_active')
    .eq('id', normalized)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return data as CafeRow;
});

const readCafeBinding = cache(async (cafeId: string): Promise<BindingRow | null> => {
  const normalized = cafeId.trim();
  if (!normalized) return null;

  const { data, error } = await controlPlaneAdmin().rpc('control_get_cafe_database_binding', {
    p_cafe_id: normalized,
  });

  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  return row ? (row as BindingRow) : null;
});

const readDefaultDatabaseKey = cache(async (): Promise<string | null> => {
  const { data, error } = await controlPlaneAdmin().rpc('control_get_default_operational_database_key');
  if (error) throw error;

  if (typeof data === 'string' && data.trim()) {
    return data.trim();
  }

  const row = Array.isArray(data) ? (data[0] as DefaultDatabaseRow | undefined) : undefined;
  return row?.database_key ? String(row.database_key) : null;
});

function toRoute(cafe: CafeRow, binding: BindingRow | null, fallbackDatabaseKey: string | null): ControlPlaneCafeRoute | null {
  const databaseKey = binding?.database_key?.trim() || fallbackDatabaseKey?.trim() || '';
  if (!databaseKey) {
    return null;
  }

  return {
    cafeId: String(cafe.id),
    cafeSlug: String(cafe.slug),
    cafeDisplayName: String(cafe.display_name ?? cafe.slug),
    cafeIsActive: !!cafe.is_active,
    databaseKey,
    databaseDisplayName: binding?.database_display_name ? String(binding.database_display_name) : null,
    databaseStatus: binding?.database_status ? String(binding.database_status) : null,
    isAcceptingNewCafes: binding?.is_accepting_new_cafes ?? null,
    isDefaultDatabase: binding?.is_default ?? null,
    schemaVersion: binding?.schema_version ? String(binding.schema_version) : null,
    bindingBoundAt: binding?.bound_at ? String(binding.bound_at) : null,
    bindingUpdatedAt: binding?.updated_at ? String(binding.updated_at) : null,
    bindingNotes: binding?.notes ? String(binding.notes) : null,
    bindingSource: binding ? 'binding' : 'default-fallback',
  };
}

export const resolveCafeOperationalRouteBySlug = cache(async (slug: string): Promise<ControlPlaneCafeRoute | null> => {
  const cafe = await readCafeBySlug(slug);
  if (!cafe) return null;

  const [binding, fallbackDatabaseKey] = await Promise.all([
    readCafeBinding(String(cafe.id)),
    readDefaultDatabaseKey(),
  ]);

  return toRoute(cafe, binding, fallbackDatabaseKey);
});

export const resolveCafeOperationalRouteByCafeId = cache(async (cafeId: string): Promise<ControlPlaneCafeRoute | null> => {
  const cafe = await readCafeById(cafeId);
  if (!cafe) return null;

  const [binding, fallbackDatabaseKey] = await Promise.all([
    readCafeBinding(String(cafe.id)),
    readDefaultDatabaseKey(),
  ]);

  return toRoute(cafe, binding, fallbackDatabaseKey);
});

export async function requireCafeOperationalRouteBySlug(slug: string): Promise<ControlPlaneCafeRoute> {
  const route = await resolveCafeOperationalRouteBySlug(slug);
  if (!route) {
    throw new Error('CAFE_NOT_FOUND');
  }
  return route;
}

export async function requireCafeOperationalRouteByCafeId(cafeId: string): Promise<ControlPlaneCafeRoute> {
  const route = await resolveCafeOperationalRouteByCafeId(cafeId);
  if (!route) {
    throw new Error('CAFE_NOT_FOUND');
  }
  return route;
}
