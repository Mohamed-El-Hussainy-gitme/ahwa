import { controlPlaneAdmin } from '@/lib/control-plane/admin';
import { listConfiguredOperationalDatabaseKeys } from '@/lib/supabase/env';
import {
  assertPlatformEnv,
  platformJsonError,
  platformOk,
  requirePlatformAdmin,
} from '@/app/api/platform/_auth';

export async function GET() {
  try {
    await requirePlatformAdmin();
    assertPlatformEnv();

    const admin = controlPlaneAdmin();
    const { data, error } = await admin.rpc('control_list_operational_databases');
    if (error) {
      const message = typeof error.message === 'string' ? error.message.toLowerCase() : '';
      if (error.code === '42501' && message.includes('schema control')) {
        return platformOk({
          items: listConfiguredOperationalDatabaseKeys().map((databaseKey) => ({
            database_key: databaseKey,
            display_name: databaseKey,
            description: 'env fallback',
            is_active: true,
            is_accepting_new_cafes: true,
            cafe_count: 0,
          })),
        });
      }
      throw error;
    }

    return platformOk({ items: Array.isArray(data) ? data : [] });
  } catch (error) {
    return platformJsonError(error);
  }
}
