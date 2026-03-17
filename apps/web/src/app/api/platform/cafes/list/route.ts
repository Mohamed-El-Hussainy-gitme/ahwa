import { controlPlaneAdmin } from '@/lib/control-plane/admin';
import { isOperationalDatabaseConfigured } from '@/lib/supabase/env';
import { normalizeCafeListRow } from '@/lib/platform-data';
import {
  assertPlatformEnv,
  platformJsonError,
  platformOk,
  requirePlatformAdmin,
} from '@/app/api/platform/_auth';

type CafeBindingRow = {
  cafe_id: string;
  database_key: string;
  binding_source: string | null;
};

type BindingStatus = 'bound' | 'unbound' | 'invalid';

type DatabaseBindingPayload = {
  database_key: string;
  binding_source: string;
};

function toBindingStatus(databaseKey: string | null | undefined): BindingStatus {
  const normalized = typeof databaseKey === 'string' ? databaseKey.trim() : '';
  if (!normalized) return 'unbound';

  return isOperationalDatabaseConfigured(normalized) ? 'bound' : 'invalid';
}

function toDatabaseBinding(row: CafeBindingRow | undefined): DatabaseBindingPayload | null {
  if (!row?.database_key?.trim()) {
    return null;
  }

  return {
    database_key: row.database_key.trim(),
    binding_source: row.binding_source?.trim() || 'unknown',
  };
}

export async function GET() {
  try {
    await requirePlatformAdmin();
    assertPlatformEnv();

    const admin = controlPlaneAdmin();
    const [{ data, error }, bindingsResult] = await Promise.all([
      admin.rpc('platform_list_cafes'),
      admin.schema('control').from('cafe_database_bindings').select('cafe_id, database_key, binding_source'),
    ]);

    if (error) {
      throw error;
    }
    if (bindingsResult.error) {
      throw bindingsResult.error;
    }

    const bindings = new Map<string, CafeBindingRow>();
    for (const row of ((bindingsResult.data ?? []) as CafeBindingRow[])) {
      bindings.set(row.cafe_id, row);
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
