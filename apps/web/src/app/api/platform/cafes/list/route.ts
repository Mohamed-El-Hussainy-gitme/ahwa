import { controlPlaneAdmin } from '@/lib/control-plane/admin';
import { listCafeDatabaseBindings } from '@/lib/control-plane/cafes';
import { isRuntimeStatusReadModelStale, scheduleCafeRuntimeStatusesSync } from '@/lib/control-plane/runtime-status-sync';
import { isOperationalDatabaseConfigured } from '@/lib/supabase/env';
import { normalizeCafeListRow } from '@/lib/platform-data';
import {
  assertPlatformEnv,
  platformJsonError,
  platformOk,
  requirePlatformAdmin,
} from '@/app/api/platform/_auth';

type CafeBindingRow = {
  cafeId: string;
  databaseKey: string;
  bindingSource: string | null;
  cafeLoadTier?: 'small' | 'medium' | 'heavy' | 'enterprise';
  loadUnits?: number;
};

type BindingStatus = 'bound' | 'unbound' | 'invalid';

type DatabaseBindingPayload = {
  database_key: string;
  binding_source: string;
  cafe_load_tier?: 'small' | 'medium' | 'heavy' | 'enterprise';
  load_units?: number;
};

function toBindingStatus(databaseKey: string | null | undefined): BindingStatus {
  const normalized = typeof databaseKey === 'string' ? databaseKey.trim() : '';
  if (!normalized) return 'unbound';

  return isOperationalDatabaseConfigured(normalized) ? 'bound' : 'invalid';
}

function toDatabaseBinding(row: CafeBindingRow | undefined): DatabaseBindingPayload | null {
  if (!row?.databaseKey?.trim()) {
    return null;
  }

  return {
    database_key: row.databaseKey.trim(),
    binding_source: row.bindingSource?.trim() || 'unknown',
    cafe_load_tier: row.cafeLoadTier,
    load_units: row.loadUnits,
  };
}

const LIST_RUNTIME_STATUS_MAX_AGE_MS = 60_000;
const LIST_RUNTIME_STATUS_BATCH_LIMIT = 12;

function readRuntimeStatusUpdatedAt(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const row = value as { runtime_status_updated_at?: string | null };
  return typeof row.runtime_status_updated_at === 'string' ? row.runtime_status_updated_at : null;
}

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin();
    assertPlatformEnv();

    const admin = controlPlaneAdmin();
    const bindingRows = await listCafeDatabaseBindings();

    const { data, error } = await admin.rpc('platform_list_cafes');

    if (error) {
      throw error;
    }

    const bindings = new Map<string, CafeBindingRow>();
    for (const row of (bindingRows as CafeBindingRow[])) {
      bindings.set(row.cafeId, row);
    }

    const rawItems = Array.isArray(data)
      ? data.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      : [];

    const staleBindings = rawItems
      .map((cafe) => {
        const cafeId = typeof cafe.id === 'string' ? cafe.id : '';
        const bindingRow = cafeId ? bindings.get(cafeId) : undefined;
        if (!bindingRow?.databaseKey) return null;
        const runtimeStatusUpdatedAt = readRuntimeStatusUpdatedAt(cafe.database_binding);
        if (!isRuntimeStatusReadModelStale(runtimeStatusUpdatedAt, LIST_RUNTIME_STATUS_MAX_AGE_MS)) {
          return null;
        }
        return { cafeId: bindingRow.cafeId, databaseKey: bindingRow.databaseKey };
      })
      .filter((item): item is { cafeId: string; databaseKey: string } => item !== null)
      .slice(0, LIST_RUNTIME_STATUS_BATCH_LIMIT);

    if (staleBindings.length > 0) {
      const origin = new URL(request.url).origin;
      await scheduleCafeRuntimeStatusesSync(staleBindings, {
        requestOrigin: origin,
        source: 'api/platform/cafes/list',
        concurrency: 2,
      }).catch(() => undefined);
    }

    const items = rawItems
      .map((cafe) => {
        const binding = typeof cafe.id === 'string' ? toDatabaseBinding(bindings.get(cafe.id)) : null;
        const bindingStatus = toBindingStatus(binding?.database_key);
        return normalizeCafeListRow({
          ...cafe,
          owners: Array.isArray(cafe.owners) ? cafe.owners : [],
          database_key: binding?.database_key ?? null,
          database_binding: binding,
          binding_status: bindingStatus,
        });
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    return platformOk({ items });
  } catch (error) {
    return platformJsonError(error);
  }
}
