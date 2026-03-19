import { controlPlaneAdmin } from '@/lib/control-plane/admin';
import { listCafeDatabaseBindings } from '@/lib/control-plane/cafes';
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

export async function GET() {
  try {
    await requirePlatformAdmin();
    assertPlatformEnv();

    const admin = controlPlaneAdmin();
    const [{ data, error }, bindingRows] = await Promise.all([
      admin.rpc('platform_list_cafes'),
      listCafeDatabaseBindings(),
    ]);

    if (error) {
      throw error;
    }

    const bindings = new Map<string, CafeBindingRow>();
    for (const row of (bindingRows as CafeBindingRow[])) {
      bindings.set(row.cafeId, row);
    }

    const items = Array.isArray(data)
      ? data
          .map((item) => {
            if (!item || typeof item !== 'object') return null;
            const cafe = item as Record<string, unknown>;
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
          .filter((item): item is NonNullable<typeof item> => item !== null)
      : [];

    return platformOk({ items });
  } catch (error) {
    return platformJsonError(error);
  }
}
