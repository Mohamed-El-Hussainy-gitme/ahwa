import { controlPlaneAdmin } from '@/lib/control-plane/admin';
import { resolveCafeDatabaseBinding } from '@/lib/control-plane/cafes';
import { isRuntimeStatusReadModelStale, scheduleCafeRuntimeStatusSync, syncCafeRuntimeStatusToControlPlane } from '@/lib/control-plane/runtime-status-sync';
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
  cafe_load_tier?: 'small' | 'medium' | 'heavy' | 'enterprise';
  load_units?: number;
};

function toBindingStatus(databaseKey: string | null | undefined): BindingStatus {
  const normalized = typeof databaseKey === 'string' ? databaseKey.trim() : '';
  if (!normalized) return 'unbound';

  return isOperationalDatabaseConfigured(normalized) ? 'bound' : 'invalid';
}

function toDatabaseBinding(value: unknown): DatabaseBindingPayload | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as { database_key?: string | null; binding_source?: string | null; cafe_load_tier?: 'small' | 'medium' | 'heavy' | 'enterprise'; load_units?: number | null };
  const databaseKey = typeof row.database_key === 'string' ? row.database_key.trim() : '';
  if (!databaseKey) return null;
  return {
    database_key: databaseKey,
    binding_source: row.binding_source?.trim() || 'unknown',
    cafe_load_tier: row.cafe_load_tier,
    load_units: typeof row.load_units === 'number' ? row.load_units : undefined,
  };
}

const DETAIL_RUNTIME_STATUS_MAX_AGE_MS = 60_000;

function readRuntimeStatusUpdatedAt(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const row = value as { runtime_status_updated_at?: string | null };
  return typeof row.runtime_status_updated_at === 'string' ? row.runtime_status_updated_at : null;
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
    const cafeId = body.cafeId.trim();
    const bindingRow = await resolveCafeDatabaseBinding(cafeId);

    let { data, error } = await admin.rpc('platform_get_cafe_detail', {
      p_super_admin_user_id: session.superAdminUserId,
      p_cafe_id: cafeId,
    });

    if (error) throw error;

    const binding = toDatabaseBinding(bindingRow
      ? {
          database_key: bindingRow.databaseKey,
          binding_source: bindingRow.bindingSource,
          cafe_load_tier: bindingRow.cafeLoadTier,
          load_units: bindingRow.loadUnits,
        }
      : null);

    if (bindingRow?.databaseKey) {
      const runtimeStatusUpdatedAt = readRuntimeStatusUpdatedAt(
        data && typeof data === 'object' ? (data as Record<string, unknown>).database_binding : null,
      );
      if (isRuntimeStatusReadModelStale(runtimeStatusUpdatedAt, DETAIL_RUNTIME_STATUS_MAX_AGE_MS)) {
        await syncCafeRuntimeStatusToControlPlane(
          { cafeId, databaseKey: bindingRow.databaseKey },
          { force: true, ttlMs: 0, timeoutMs: 3_500, source: 'api/platform/cafes/detail:inline' },
        ).catch(() => undefined);

        const refreshed = await admin.rpc('platform_get_cafe_detail', {
          p_super_admin_user_id: session.superAdminUserId,
          p_cafe_id: cafeId,
        });

        if (!refreshed.error && refreshed.data) {
          data = refreshed.data;
        } else {
          const origin = new URL(request.url).origin;
          await scheduleCafeRuntimeStatusSync(
            { cafeId, databaseKey: bindingRow.databaseKey },
            { requestOrigin: origin, source: 'api/platform/cafes/detail', concurrency: 1 },
          ).catch(() => undefined);
        }
      }
    }

    const finalEnriched =
      data && typeof data === 'object'
        ? {
            ...(data as Record<string, unknown>),
            database_key: binding?.database_key ?? null,
            database_binding: binding,
            binding_status: toBindingStatus(binding?.database_key),
          }
        : data;

    return platformOk({ data: finalEnriched ?? null });
  } catch (error) {
    return platformJsonError(error);
  }
}
