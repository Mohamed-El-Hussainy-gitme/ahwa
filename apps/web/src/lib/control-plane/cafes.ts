import 'server-only';
import { controlPlaneAdmin } from '@/lib/control-plane/admin';
import { supabaseAdminForDatabase } from '@/lib/supabase/admin';
import { isOperationalDatabaseConfigured } from '@/lib/supabase/env';

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

  if (error) throw error;
  if (!Array.isArray(data)) return [];

  return data
    .map((row) => parseOperationalDatabaseOption(row as OperationalDatabaseRpcRow | null))
    .filter((row): row is OperationalDatabaseOption => row !== null);
}

async function scanOperationalCafeBindingBySlug(slug: string): Promise<ResolvedCafeBinding | null> {
  const normalizedSlug = normalizeCafeSlug(slug);
  if (!normalizedSlug) return null;

  const candidates = (await listOperationalDatabases())
    .filter((row) => row.isActive)
    .filter((row) => isOperationalDatabaseConfigured(row.databaseKey));

  if (!candidates.length) {
    return null;
  }

  const scanned = await Promise.all(
    candidates.map(async (candidate): Promise<ResolvedCafeBinding | null> => {
      const { data, error } = await supabaseAdminForDatabase(candidate.databaseKey)
        .schema('ops')
        .from('cafes')
        .select('id, slug, display_name, is_active')
        .eq('slug', normalizedSlug)
        .maybeSingle<CafeRow>();

      if (error) {
        throw new Error(`OPERATIONAL_CAFE_SCAN_FAILED:${candidate.databaseKey}:${error.message}`);
      }

      if (!data) {
        return null;
      }

      const cafe = parseCafeRow(data);
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

  if (error) throw error;
  return parseCafeDatabaseBinding((data ?? null) as CafeBindingRpcRow | null, normalizedCafeId);
}

export async function listCafeDatabaseBindings(): Promise<CafeDatabaseBinding[]> {
  const { data, error } = await controlPlaneAdmin().rpc('control_list_cafe_database_bindings');

  if (error) throw error;
  return parseCafeDatabaseBindingList(data);
}

export async function resolveCafeBindingBySlug(slug: string): Promise<ResolvedCafeBinding | null> {
  const cafe = await loadCafeBySlugFromControlPlane(slug);
  if (cafe) {
    const binding = await resolveCafeDatabaseBinding(cafe.id);
    if (binding) {
      return {
        ...cafe,
        databaseKey: binding.databaseKey,
        bindingSource: binding.bindingSource,
        bindingCreatedAt: binding.createdAt,
        bindingUpdatedAt: binding.updatedAt,
      };
    }
  }

  return scanOperationalCafeBindingBySlug(slug);
}

export async function resolveCafeBySlug(slug: string): Promise<ResolvedCafe | null> {
  const direct = await loadCafeBySlugFromControlPlane(slug);
  if (direct) {
    return direct;
  }

  const fallback = await scanOperationalCafeBindingBySlug(slug);
  if (!fallback) {
    return null;
  }

  return {
    id: fallback.id,
    slug: fallback.slug,
    displayName: fallback.displayName,
    isActive: fallback.isActive,
  };
}
