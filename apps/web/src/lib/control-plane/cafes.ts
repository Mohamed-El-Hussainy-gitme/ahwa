import 'server-only';
import { controlPlaneAdmin } from '@/lib/control-plane/admin';
import { normalizeCafeSlug } from '@/lib/cafes/slug';
import { supabaseAdminForDatabase } from '@/lib/supabase/admin';
import {
  isOperationalDatabaseConfigured,
  listConfiguredOperationalDatabasesFromEnv,
} from '@/lib/supabase/env';

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

type ErrorLike = {
  code?: string | null;
  message?: string | null;
};

const CAFE_SCAN_PAGE_SIZE = 500;

function isControlSchemaPermissionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const value = error as ErrorLike;
  return value.code === '42501' && String(value.message ?? '').toLowerCase().includes('schema control');
}

function parseCafeRow(row: CafeRow): ResolvedCafe {
  return {
    id: String(row.id),
    slug: normalizeCafeSlug(row.slug),
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

function operationalDatabasesFromEnv(): OperationalDatabaseOption[] {
  return listConfiguredOperationalDatabasesFromEnv().map((row) => ({
    databaseKey: row.databaseKey,
    displayName: row.databaseKey,
    description: 'env-configured operational database',
    isActive: true,
    isAcceptingNewCafes: true,
    createdAt: null,
    updatedAt: null,
  }));
}

function ensureUniqueCafeMatch(matches: ResolvedCafe[], normalizedSlug: string, context: string): ResolvedCafe | null {
  if (!matches.length) {
    return null;
  }

  if (matches.length > 1) {
    const descriptor = matches.map((row) => `${row.id}:${row.slug}`).join(',');
    throw new Error(`AMBIGUOUS_CAFE_SLUG_NORMALIZATION:${context}:${normalizedSlug}:${descriptor}`);
  }

  return matches[0] ?? null;
}

async function findCafeByNormalizedSlugFallback(
  loader: (from: number, to: number) => Promise<CafeRow[] | null>,
  normalizedSlug: string,
  context: string,
): Promise<ResolvedCafe | null> {
  const matches: ResolvedCafe[] = [];

  for (let from = 0; ; from += CAFE_SCAN_PAGE_SIZE) {
    const rows = await loader(from, from + CAFE_SCAN_PAGE_SIZE - 1);
    if (!rows?.length) {
      break;
    }

    for (const row of rows) {
      if (normalizeCafeSlug(row.slug) === normalizedSlug) {
        matches.push(parseCafeRow(row));
      }
    }

    if (rows.length < CAFE_SCAN_PAGE_SIZE) {
      break;
    }
  }

  return ensureUniqueCafeMatch(matches, normalizedSlug, context);
}

async function loadCafeBySlugFromControlPlane(slug: string): Promise<ResolvedCafe | null> {
  const normalized = normalizeCafeSlug(slug);
  if (!normalized) return null;

  const exact = await controlPlaneAdmin()
    .schema('ops')
    .from('cafes')
    .select('id, slug, display_name, is_active')
    .eq('slug', normalized)
    .maybeSingle<CafeRow>();

  if (exact.error) throw exact.error;
  if (exact.data) {
    return parseCafeRow(exact.data);
  }

  return findCafeByNormalizedSlugFallback(
    async (from, to) => {
      const { data, error } = await controlPlaneAdmin()
        .schema('ops')
        .from('cafes')
        .select('id, slug, display_name, is_active')
        .range(from, to);

      if (error) throw error;
      return (data ?? []) as CafeRow[];
    },
    normalized,
    'control_plane',
  );
}

async function listOperationalDatabases(): Promise<OperationalDatabaseOption[]> {
  const envFallback = operationalDatabasesFromEnv();

  try {
    const { data, error } = await controlPlaneAdmin().rpc('control_list_operational_databases');
    if (error) {
      if (isControlSchemaPermissionError(error)) {
        return envFallback;
      }
      throw error;
    }
    if (!Array.isArray(data)) return envFallback;

    const parsed = data
      .map((row) => parseOperationalDatabaseOption(row as OperationalDatabaseRpcRow | null))
      .filter((row): row is OperationalDatabaseOption => row !== null);

    return parsed.length ? parsed : envFallback;
  } catch (error) {
    if (isControlSchemaPermissionError(error)) {
      return envFallback;
    }
    throw error;
  }
}

async function loadCafeBySlugFromOperationalDatabase(
  databaseKey: string,
  slug: string,
): Promise<ResolvedCafe | null> {
  const normalizedSlug = normalizeCafeSlug(slug);
  if (!normalizedSlug) return null;
  if (!isOperationalDatabaseConfigured(databaseKey)) return null;

  const admin = supabaseAdminForDatabase(databaseKey).schema('ops');

  const exact = await admin
    .from('cafes')
    .select('id, slug, display_name, is_active')
    .eq('slug', normalizedSlug)
    .maybeSingle<CafeRow>();

  if (exact.error) {
    return null;
  }

  if (exact.data) {
    return parseCafeRow(exact.data);
  }

  try {
    return await findCafeByNormalizedSlugFallback(
      async (from, to) => {
        const { data, error } = await admin
          .from('cafes')
          .select('id, slug, display_name, is_active')
          .range(from, to);

        if (error) throw error;
        return (data ?? []) as CafeRow[];
      },
      normalizedSlug,
      `operational:${databaseKey}`,
    );
  } catch {
    return null;
  }
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

  try {
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
  } catch (error) {
    if (isControlSchemaPermissionError(error)) {
      return null;
    }
    throw error;
  }
}

export async function listCafeDatabaseBindings(): Promise<CafeDatabaseBinding[]> {
  try {
    const { data, error } = await controlPlaneAdmin().rpc('control_list_cafe_database_bindings');

    if (error) {
      if (isControlSchemaPermissionError(error)) {
        return [];
      }
      throw error;
    }
    return parseCafeDatabaseBindingList(data);
  } catch (error) {
    if (isControlSchemaPermissionError(error)) {
      return [];
    }
    throw error;
  }
}

export async function resolveCafeBindingBySlug(slug: string): Promise<ResolvedCafeBinding | null> {
  const normalizedSlug = normalizeCafeSlug(slug);
  if (!normalizedSlug) {
    return null;
  }

  let cafe: ResolvedCafe | null = null;
  let preferredDatabaseKey: string | null = null;

  try {
    cafe = await loadCafeBySlugFromControlPlane(normalizedSlug);
  } catch {
    cafe = null;
  }

  if (cafe) {
    try {
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
    } catch {
      preferredDatabaseKey = null;
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
