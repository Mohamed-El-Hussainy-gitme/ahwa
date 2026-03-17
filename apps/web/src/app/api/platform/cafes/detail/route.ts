import { controlPlaneAdmin } from '@/lib/control-plane/admin';
import { isOperationalDatabaseConfigured } from '@/lib/supabase/env';
import {
  assertPlatformEnv,
  platformFail,
  platformJsonError,
  platformOk,
  requirePlatformAdmin,
} from '@/app/api/platform/_auth';

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

function toDatabaseBinding(value: unknown): DatabaseBindingPayload | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as { database_key?: string | null; binding_source?: string | null };
  const databaseKey = typeof row.database_key === 'string' ? row.database_key.trim() : '';
  if (!databaseKey) return null;
  return {
    database_key: databaseKey,
    binding_source: row.binding_source?.trim() || 'unknown',
  };
}

export async function POST(request: Request) {
  try {
    const session = await requirePlatformAdmin();
    const body = (await request.json().catch(() => ({}))) as { cafeId?: string };

    if (!body.cafeId?.trim()) {
      return platformFail(400, 'INVALID_INPUT', 'Cafe ID is required.');
    }

    assertPlatformEnv();

    const admin = controlPlaneAdmin();
    const [{ data, error }, bindingResult] = await Promise.all([
      admin.rpc('platform_get_cafe_detail', {
        p_super_admin_user_id: session.superAdminUserId,
        p_cafe_id: body.cafeId.trim(),
      }),
      admin
        .schema('control')
        .from('cafe_database_bindings')
        .select('database_key, binding_source')
        .eq('cafe_id', body.cafeId.trim())
        .maybeSingle(),
    ]);

    if (error) throw error;
    if (bindingResult.error) throw bindingResult.error;

    const binding = toDatabaseBinding(bindingResult.data ?? null);
    const enriched =
      data && typeof data === 'object'
        ? {
            ...(data as Record<string, unknown>),
            database_key: binding?.database_key ?? null,
            database_binding: binding,
            binding_status: toBindingStatus(binding?.database_key),
          }
        : data;

    return platformOk({ data: enriched ?? null });
  } catch (error) {
    return platformJsonError(error);
  }
}
