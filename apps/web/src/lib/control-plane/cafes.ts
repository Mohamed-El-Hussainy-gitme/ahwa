import 'server-only';
import { controlPlaneAdmin } from '@/lib/control-plane/admin';
import { supabaseAdminForDatabase } from '@/lib/supabase/admin';
import { isOperationalDatabaseConfigured, listConfiguredOperationalDatabaseKeys } from '@/lib/supabase/env';
import { normalizeCafeSlugForLookup } from '@/lib/cafes/slug';

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

type OperationalDatabaseRpcRow = {
  database_key?: string | null;
  display_name?: string | null;
  description?: string | null;
  is_active?: boolean | null;
  is_accepting_new_cafes?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type OperationalDatabaseOption = {
  databaseKey: string;
  displayName: string;
  description: string | null;
  isActive: boolean;
  isAcceptingNewCafes: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

function normalizeCafeSlug(slug: string): string {
  return normalizeCafeSlugForLookup(slug);
}

function isControlSchemaPermissionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error && typeof (error as { code?: unknown }).code === 'string' ? String((error as { code: string }).code) : '';
  const message = 'message' in error && typeof (error as { message?: unknown }).message === 'string' ? String((error as { message: string }).message) : '';
  return code === '42501' && message.toLowerCase().includes('schema control');
}

function fallbackOperationalDatabaseOptions(): OperationalDatabaseOption[] {
  return listConfiguredOperationalDatabaseKeys().map((databaseKey) => ({
    databaseKey,
    displayName: databaseKey,
    description: 'env fallback',
    isActive: true,
    isAcceptingNewCafes: true,
    createdAt: null,
    updatedAt: null,
  }));
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
  expectedCafeId?: string,
): CafeDatabaseBinding | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const cafeId = typeof payload.cafe_id === 'string' ? payload.cafe_id.trim() : '';
  if (!cafeId) {
    return null;
  }

  if (expectedCafeId && cafeId !== expectedCafeId) {
    throw new Error(`control plane returned a mismatched cafe binding. expected ${expectedCafeId}, got ${cafeId}`);
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

function parseCafeDatabaseBindingList(payload: unknown): CafeDatabaseBinding[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .map((row) => parseCafeDatabaseBinding(row as CafeBindingRpcRow | null))
    .filter((row): row is CafeDatabaseBinding => row !== null);
}

function parseOperationalDatabaseOption(row: OperationalDatabaseRpcRow | null | undefined): OperationalDatabaseOption | null {
  if (!row || typeof row !== 'object') {
    return null;
  }

  const databaseKey = typeof row.database_key === 'string' ? row.database_key.trim() : '';
  if (!databaseKey) {
    return null;
  }

  return {
    databaseKey,
    displayName:
      typeof row.display_name === 'string' && row.display_name.trim()
        ? row.display_name.trim()
        : databaseKey,
    description: typeof row.description === 'string' ? row.description : null,
    isActive: !!row.is_active,
    isAcceptingNewCafes: !!row.is_accepting_new_cafes,
    createdAt: typeof row.created_at === 'string' ? row.created_at : null,
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
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

async function listOperationalDatabases(): Promise<OperationalDatabaseOption[]> {
  const { data, error } = await controlPlaneAdmin().rpc('control_list_operational_databases');

  if (error) {
    if (isControlSchemaPermissionError(error)) {
      return fallbackOperationalDatabaseOptions();
    }
    throw error;
  }
  if (!Array.isArray(data)) return fallbackOperationalDatabaseOptions();

  return data
    .map((row) => parseOperationalDatabaseOption(row as OperationalDatabaseRpcRow | null))
    .filter((row): row is OperationalDatabaseOption => row !== null);
}

async function loadCafeBySlugFromOperationalDatabase(
  databaseKey: string,
  slug: string,
): Promise<ResolvedCafe | null> {
  const normalizedSlug = normalizeCafeSlug(slug);
  if (!normalizedSlug) return null;
  if (!isOperationalDatabaseConfigured(databaseKey)) return null;

  const { data, error } = await supabaseAdminForDatabase(databaseKey)
    .schema('ops')
    .from('cafes')
    .select('id, slug, display_name, is_active')
    .eq('slug', normalizedSlug)
    .maybeSingle<CafeRow>();

  if (error) {
    return null;
  }

  if (!data) {
    return null;
  }

  return parseCafeRow(data);
}

async function scanOperationalCafeBindingBySlug(
  slug: string,
  preferredDatabaseKey?: string | null,
): Promise<ResolvedCafeBinding | null> {
  const normalizedSlug = normalizeCafeSlug(slug);
  if (!normalizedSlug) return null;

  const candidates = (await listOperationalDatabases())
    .filter((row) => row.isActive)
    .filter((row) => isOperationalDatabaseConfigured(row.databaseKey))
    .sort((a, b) => {
      const aPreferred = preferredDatabaseKey && a.databaseKey === preferredDatabaseKey ? 1 : 0;
      const bPreferred = preferredDatabaseKey && b.databaseKey === preferredDatabaseKey ? 1 : 0;
      return bPreferred - aPreferred;
    });

  if (!candidates.length) {
    return null;
  }

  const scanned = await Promise.all(
    candidates.map(async (candidate): Promise<ResolvedCafeBinding | null> => {
      const cafe = await loadCafeBySlugFromOperationalDatabase(candidate.databaseKey, normalizedSlug);
      if (!cafe) {
        return null;
      }

      return {
        ...cafe,
        databaseKey: candidate.databaseKey,
        bindingSource: 'runtime_scan',
        bindingCreatedAt: null,
        bindingUpdatedAt: null,
      };
    }),
  );

  const matches = scanned.filter((row): row is ResolvedCafeBinding => row !== null);

  if (!matches.length) {
    return null;
  }

  if (matches.length > 1) {
    const descriptor = matches.map((row) => `${row.databaseKey}:${row.id}`).join(',');
    throw new Error(`AMBIGUOUS_CAFE_SLUG:${normalizedSlug}:${descriptor}`);
  }

  return matches[0] ?? null;
}

export async function resolveCafeDatabaseBinding(cafeId: string): Promise<CafeDatabaseBinding | null> {
  const normalizedCafeId = cafeId.trim();
  if (!normalizedCafeId) return null;

  const { data, error } = await controlPlaneAdmin().rpc('control_get_cafe_database_binding', {
    p_cafe_id: normalizedCafeId,
  });

  if (error) {
    if (isControlSchemaPermissionError(error)) {
      return null;
    }
    throw error;
  }
  return parseCafeDatabaseBinding((data ?? null) as CafeBindingRpcRow | null, normalizedCafeId);
}

export async function listCafeDatabaseBindings(): Promise<CafeDatabaseBinding[]> {
  const { data, error } = await controlPlaneAdmin().rpc('control_list_cafe_database_bindings');

  if (error) {
    if (isControlSchemaPermissionError(error)) {
      return [];
    }
    throw error;
  }
  return parseCafeDatabaseBindingList(data);
}

export async function resolveCafeBindingBySlug(slug: string): Promise<ResolvedCafeBinding | null> {
  const normalizedSlug = normalizeCafeSlug(slug);
  if (!normalizedSlug) {
    return null;
  }

  const cafe = await loadCafeBySlugFromControlPlane(normalizedSlug);
  let preferredDatabaseKey: string | null = null;

  if (cafe) {
    const binding = await resolveCafeDatabaseBinding(cafe.id);
    if (binding) {
      preferredDatabaseKey = binding.databaseKey;
      const operationalCafe = await loadCafeBySlugFromOperationalDatabase(binding.databaseKey, normalizedSlug);
      if (operationalCafe) {
        return {
          ...operationalCafe,
          isActive: cafe.isActive,
          displayName: operationalCafe.displayName || cafe.displayName,
          databaseKey: binding.databaseKey,
          bindingSource: binding.bindingSource,
          bindingCreatedAt: binding.createdAt,
          bindingUpdatedAt: binding.updatedAt,
        };
      }
    }
  }

  const fallback = await scanOperationalCafeBindingBySlug(normalizedSlug, preferredDatabaseKey);
  if (!fallback) {
    return null;
  }

  if (!cafe) {
    return fallback;
  }

  return {
    ...fallback,
    isActive: cafe.isActive,
    displayName: fallback.displayName || cafe.displayName,
  };
}

export async function resolveCafeBySlug(slug: string): Promise<ResolvedCafe | null> {
  const binding = await resolveCafeBindingBySlug(slug);
  if (!binding) {
    return null;
  }

  return {
    id: binding.id,
    slug: binding.slug,
    displayName: binding.displayName,
    isActive: binding.isActive,
  };
}
