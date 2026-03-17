import { controlPlaneAdmin } from '@/lib/control-plane/admin';
import {
  assertPlatformEnv,
  platformJsonError,
  platformOk,
  requirePlatformAdmin,
} from '@/app/api/platform/_auth';

type CafeBindingRow = { cafe_id: string; database_key: string };

export async function GET() {
  try {
    await requirePlatformAdmin();
    assertPlatformEnv();

    const admin = controlPlaneAdmin();
    const [{ data, error }, bindingsResult] = await Promise.all([
      admin.rpc('platform_list_cafes'),
      admin.schema('control').from('cafe_database_bindings').select('cafe_id, database_key'),
    ]);

    if (error) {
      throw error;
    }
    if (bindingsResult.error) {
      throw bindingsResult.error;
    }

    const bindings = new Map<string, string>();
    for (const row of ((bindingsResult.data ?? []) as CafeBindingRow[])) {
      bindings.set(row.cafe_id, row.database_key);
    }

    const items = Array.isArray(data)
      ? data.map((item) => {
          if (!item || typeof item !== 'object' || item === null) return item;
          const cafe = item as Record<string, unknown>;
          return {
            ...cafe,
            database_key: typeof cafe.id === 'string' ? bindings.get(cafe.id) ?? 'ops-db-01' : 'ops-db-01',
          };
        })
      : [];

    return platformOk({ items });
  } catch (error) {
    return platformJsonError(error);
  }
}
