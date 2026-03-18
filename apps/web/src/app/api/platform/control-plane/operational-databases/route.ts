import { controlPlaneAdmin } from '@/lib/control-plane/admin';
import { listConfiguredOperationalDatabasesFromEnv } from '@/lib/supabase/env';
import {
  assertPlatformEnv,
  platformJsonError,
  platformOk,
  requirePlatformAdmin,
} from '@/app/api/platform/_auth';

function envItems() {
  return listConfiguredOperationalDatabasesFromEnv().map((row) => ({
    database_key: row.databaseKey,
    display_name: row.databaseKey,
    description: 'env-configured operational database',
    is_active: true,
    is_accepting_new_cafes: true,
    cafe_count: 0,
    created_at: null,
    updated_at: null,
  }));
}

function isControlPermissionError(error: unknown): boolean {
  return !!error
    && typeof error === 'object'
    && 'code' in error
    && 'message' in error
    && String((error as { code?: unknown }).code ?? '') === '42501'
    && String((error as { message?: unknown }).message ?? '').toLowerCase().includes('schema control');
}

export async function GET() {
  try {
    await requirePlatformAdmin();
    assertPlatformEnv();

    const admin = controlPlaneAdmin();
    const { data, error } = await admin.rpc('control_list_operational_databases');
    if (error) {
      if (isControlPermissionError(error)) {
        return platformOk({ items: envItems() });
      }
      throw error;
    }

    const items = Array.isArray(data) && data.length ? data : envItems();
    return platformOk({ items });
  } catch (error) {
    if (isControlPermissionError(error)) {
      return platformOk({ items: envItems() });
    }
    return platformJsonError(error);
  }
}
