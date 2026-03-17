import 'server-only';
import { controlPlaneAdmin } from '@/lib/control-plane/admin';

export type CafeDatabaseBinding = {
  cafeId: string;
  databaseKey: string;
  bindingSource: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export type ResolvedCafe = {
  id: string;
  slug: string;
  displayName: string;
  isActive: boolean;
};

export type ResolvedCafeBinding = ResolvedCafe & {
  databaseKey: string;
  bindingSource: string;
  bindingCreatedAt: string | null;
  bindingUpdatedAt: string | null;
};

type CafeRow = {
  id: string;
  slug: string;
  display_name: string | null;
  is_active: boolean | null;
};

type CafeBindingRpcRow = {
  cafe_id?: string | null;
  database_key?: string | null;
  binding_source?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function normalizeCafeSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

function parseCafeRow(row: CafeRow): ResolvedCafe {
  return {
    id: String(row.id),
    slug: String(row.slug),
    displayName: String(row.display_name ?? row.slug),
    isActive: !!row.is_active,
  };
}

function parseCafeDatabaseBinding(
  payload: CafeBindingRpcRow | null | undefined,
  cafeId: string,
): CafeDatabaseBinding | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const resolvedCafeId =
    typeof payload.cafe_id === 'string' && payload.cafe_id.trim() ? payload.cafe_id.trim() : cafeId;
  if (resolvedCafeId !== cafeId) {
    throw new Error(`control plane returned a mismatched cafe binding. expected ${cafeId}, got ${resolvedCafeId}`);
  }

  const databaseKey = typeof payload.database_key === 'string' ? payload.database_key.trim() : '';
  if (!databaseKey) {
    return null;
  }

  return {
    cafeId,
    databaseKey,
    bindingSource:
      typeof payload.binding_source === 'string' && payload.binding_source.trim()
        ? payload.binding_source.trim()
        : 'unknown',
    createdAt: typeof payload.created_at === 'string' ? payload.created_at : null,
    updatedAt: typeof payload.updated_at === 'string' ? payload.updated_at : null,
  };
}

async function loadCafeBySlugFromControlPlane(slug: string): Promise<ResolvedCafe | null> {
  const normalized = normalizeCafeSlug(slug);
  if (!normalized) return null;

  const { data, error } = await controlPlaneAdmin()
    .schema('ops')
    .from('cafes')
    .select('id, slug, display_name, is_active')
    .eq('slug', normalized)
    .maybeSingle<CafeRow>();

  if (error) throw error;
  if (!data) return null;

  return parseCafeRow(data);
}

export async function resolveCafeDatabaseBinding(cafeId: string): Promise<CafeDatabaseBinding | null> {
  const normalizedCafeId = cafeId.trim();
  if (!normalizedCafeId) return null;

  const { data, error } = await controlPlaneAdmin().rpc('control_get_cafe_database_binding', {
    p_cafe_id: normalizedCafeId,
  });

  if (error) throw error;
  return parseCafeDatabaseBinding((data ?? null) as CafeBindingRpcRow | null, normalizedCafeId);
}

export async function resolveCafeBindingBySlug(slug: string): Promise<ResolvedCafeBinding | null> {
  const cafe = await loadCafeBySlugFromControlPlane(slug);
  if (!cafe) return null;

  const binding = await resolveCafeDatabaseBinding(cafe.id);
  if (!binding) return null;

  return {
    ...cafe,
    databaseKey: binding.databaseKey,
    bindingSource: binding.bindingSource,
    bindingCreatedAt: binding.createdAt,
    bindingUpdatedAt: binding.updatedAt,
  };
}

export async function resolveCafeBySlug(slug: string): Promise<ResolvedCafe | null> {
  return loadCafeBySlugFromControlPlane(slug);
}
