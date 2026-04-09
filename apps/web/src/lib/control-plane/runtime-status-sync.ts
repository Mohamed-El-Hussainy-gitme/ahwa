import 'server-only';

import { controlPlaneAdmin } from '@/lib/control-plane/admin';
import { enqueueInternalRequestWithQStash, isQStashConfigured } from '@/lib/platform/qstash';
import { isOperationalDatabaseConfigured } from '@/lib/supabase/env';
import { supabaseAdminForDatabase } from '@/lib/supabase/admin';

export type CafeRuntimeSyncBinding = {
  cafeId: string;
  databaseKey: string;
};

type RuntimeSnapshot = {
  cafe_id?: string | null;
  last_activity_at?: string | null;
  usage_state?: string | null;
  has_open_shift?: boolean | null;
  open_shift_id?: string | null;
  open_shift_kind?: string | null;
  open_shift_business_date?: string | null;
  open_shift_opened_at?: string | null;
  last_shift_closed_at?: string | null;
  source_updated_at?: string | null;
  source_kind?: string | null;
  notes?: unknown;
};

type RpcResponse<T> = {
  data: T | null;
  error: { message?: string } | null;
};

type SyncResult = {
  cafeId: string;
  databaseKey: string;
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  error?: string;
};

type SyncOptions = {
  force?: boolean;
  ttlMs?: number;
  timeoutMs?: number;
  concurrency?: number;
  source?: string;
};

declare global {
  // eslint-disable-next-line no-var
  var __ahwaControlRuntimeSyncCache__: Map<string, number> | undefined;
  // eslint-disable-next-line no-var
  var __ahwaControlRuntimeSyncScheduleCache__: Map<string, number> | undefined;
}

const DEFAULT_TTL_MS = 15_000;
const DEFAULT_TIMEOUT_MS = 3_500;
const DEFAULT_CONCURRENCY = 4;

function getSyncCache() {
  if (!globalThis.__ahwaControlRuntimeSyncCache__) {
    globalThis.__ahwaControlRuntimeSyncCache__ = new Map<string, number>();
  }

  return globalThis.__ahwaControlRuntimeSyncCache__;
}

function getScheduleCache() {
  if (!globalThis.__ahwaControlRuntimeSyncScheduleCache__) {
    globalThis.__ahwaControlRuntimeSyncScheduleCache__ = new Map<string, number>();
  }

  return globalThis.__ahwaControlRuntimeSyncScheduleCache__;
}

function syncCacheKey(binding: CafeRuntimeSyncBinding) {
  return `${binding.databaseKey.trim().toLowerCase()}:${binding.cafeId.trim()}`;
}

function normalizeBinding(binding: CafeRuntimeSyncBinding | null | undefined): CafeRuntimeSyncBinding | null {
  if (!binding) return null;

  const cafeId = binding.cafeId.trim();
  const databaseKey = binding.databaseKey.trim();
  if (!cafeId || !databaseKey) return null;

  return { cafeId, databaseKey };
}

function shouldSkipDueToTtl(binding: CafeRuntimeSyncBinding, ttlMs: number) {
  const cache = getSyncCache();
  const key = syncCacheKey(binding);
  const lastRunAt = cache.get(key) ?? 0;
  const now = Date.now();

  if (now - lastRunAt < ttlMs) {
    return true;
  }

  cache.set(key, now);
  return false;
}

function normalizeSnapshot(value: unknown): RuntimeSnapshot | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  return value as RuntimeSnapshot;
}

async function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`${label}_TIMEOUT`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([Promise.resolve(promise), timeoutPromise]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

async function fetchRuntimeSnapshot(binding: CafeRuntimeSyncBinding, timeoutMs: number): Promise<RuntimeSnapshot | null> {
  const admin = supabaseAdminForDatabase(binding.databaseKey);

  const response = (await withTimeout(
    admin.rpc('ops_get_cafe_runtime_status_snapshot', {
      p_cafe_id: binding.cafeId,
    }),
    timeoutMs,
    'OPS_RUNTIME_STATUS_SNAPSHOT',
  )) as RpcResponse<unknown>;

  if (response.error) {
    throw new Error(response.error.message || 'OPS_RUNTIME_STATUS_SNAPSHOT_FAILED');
  }

  return normalizeSnapshot(response.data);
}

async function upsertRuntimeSnapshot(
  binding: CafeRuntimeSyncBinding,
  snapshot: RuntimeSnapshot,
  timeoutMs: number,
  source: string,
): Promise<void> {
  const admin = controlPlaneAdmin();

  const response = (await withTimeout(
    admin.rpc('control_upsert_cafe_runtime_status_read_model', {
      p_cafe_id: binding.cafeId,
      p_database_key: binding.databaseKey,
      p_last_activity_at: snapshot.last_activity_at ?? null,
      p_usage_state: snapshot.usage_state ?? null,
      p_has_open_shift: typeof snapshot.has_open_shift === 'boolean' ? snapshot.has_open_shift : null,
      p_open_shift_id: snapshot.open_shift_id ?? null,
      p_open_shift_kind: snapshot.open_shift_kind ?? null,
      p_open_shift_business_date: snapshot.open_shift_business_date ?? null,
      p_open_shift_opened_at: snapshot.open_shift_opened_at ?? null,
      p_last_shift_closed_at: snapshot.last_shift_closed_at ?? null,
      p_source_updated_at: snapshot.source_updated_at ?? null,
      p_source_kind: 'manual_sync',
      p_notes: {
        ...(snapshot.notes && typeof snapshot.notes === 'object' ? (snapshot.notes as Record<string, unknown>) : {}),
        synced_by: source,
        synced_from_database_key: binding.databaseKey,
      },
    }),
    timeoutMs,
    'CONTROL_RUNTIME_STATUS_UPSERT',
  )) as RpcResponse<unknown>;

  if (response.error) {
    throw new Error(response.error.message || 'CONTROL_RUNTIME_STATUS_UPSERT_FAILED');
  }
}

export async function syncCafeRuntimeStatusToControlPlane(
  bindingInput: CafeRuntimeSyncBinding,
  options: SyncOptions = {},
): Promise<SyncResult> {
  const binding = normalizeBinding(bindingInput);
  if (!binding) {
    return {
      cafeId: bindingInput.cafeId,
      databaseKey: bindingInput.databaseKey,
      ok: false,
      skipped: true,
      reason: 'invalid_binding',
    };
  }

  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const source = options.source?.trim() || 'control-runtime-sync';

  if (!isOperationalDatabaseConfigured(binding.databaseKey)) {
    return {
      cafeId: binding.cafeId,
      databaseKey: binding.databaseKey,
      ok: false,
      skipped: true,
      reason: 'database_not_configured',
    };
  }

  if (!options.force && shouldSkipDueToTtl(binding, ttlMs)) {
    return {
      cafeId: binding.cafeId,
      databaseKey: binding.databaseKey,
      ok: true,
      skipped: true,
      reason: 'ttl_not_expired',
    };
  }

  try {
    const snapshot = await fetchRuntimeSnapshot(binding, timeoutMs);
    if (!snapshot) {
      return {
        cafeId: binding.cafeId,
        databaseKey: binding.databaseKey,
        ok: false,
        skipped: true,
        reason: 'empty_snapshot',
      };
    }

    await upsertRuntimeSnapshot(binding, snapshot, timeoutMs, source);

    return {
      cafeId: binding.cafeId,
      databaseKey: binding.databaseKey,
      ok: true,
    };
  } catch (error) {
    return {
      cafeId: binding.cafeId,
      databaseKey: binding.databaseKey,
      ok: false,
      error: error instanceof Error ? error.message : 'unknown_error',
    };
  }
}

export async function syncCafeRuntimeStatusesToControlPlane(
  bindingsInput: CafeRuntimeSyncBinding[],
  options: SyncOptions = {},
): Promise<SyncResult[]> {
  const deduped = new Map<string, CafeRuntimeSyncBinding>();

  for (const item of bindingsInput) {
    const binding = normalizeBinding(item);
    if (!binding) continue;
    deduped.set(syncCacheKey(binding), binding);
  }

  const bindings = Array.from(deduped.values());
  if (bindings.length === 0) {
    return [];
  }

  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
  const results: SyncResult[] = [];

  for (let index = 0; index < bindings.length; index += concurrency) {
    const chunk = bindings.slice(index, index + concurrency);
    const chunkResults = await Promise.all(
      chunk.map((binding) => syncCafeRuntimeStatusToControlPlane(binding, options)),
    );
    results.push(...chunkResults);
  }

  return results;
}

export type RuntimeStatusBackgroundScheduleOptions = {
  requestOrigin?: string | null;
  source?: string;
  dedupeTtlMs?: number;
  ttlMs?: number;
  timeoutMs?: number;
  concurrency?: number;
  force?: boolean;
};

const DEFAULT_SCHEDULE_DEDUPE_TTL_MS = 30_000;
const DEFAULT_STALE_AFTER_MS = 60_000;
const DIRECT_DISPATCH_TIMEOUT_MS = 1_500;

function shouldSkipScheduleDueToTtl(binding: CafeRuntimeSyncBinding, ttlMs: number) {
  const cache = getScheduleCache();
  const key = syncCacheKey(binding);
  const lastRunAt = cache.get(key) ?? 0;
  const now = Date.now();

  if (now - lastRunAt < ttlMs) {
    return true;
  }

  cache.set(key, now);
  return false;
}

function resolveInternalBaseUrl(requestOrigin?: string | null) {
  const origin = typeof requestOrigin === 'string' ? requestOrigin.trim() : '';
  if (origin) return origin.replace(/\/$/, '');

  const envBase = String(process.env.NEXT_PUBLIC_APP_URL ?? '').trim();
  return envBase.replace(/\/$/, '');
}

export function isRuntimeStatusReadModelStale(updatedAt: string | null | undefined, maxAgeMs = DEFAULT_STALE_AFTER_MS) {
  const normalized = typeof updatedAt === 'string' ? updatedAt.trim() : '';
  if (!normalized) return true;

  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) return true;

  return Date.now() - parsed > maxAgeMs;
}

export async function scheduleCafeRuntimeStatusesSync(
  bindingInputs: CafeRuntimeSyncBinding[],
  options: RuntimeStatusBackgroundScheduleOptions = {},
): Promise<{ queued: number; skipped: number; mode: 'qstash' | 'direct' | 'noop' }> {
  const source = options.source?.trim() || 'control-runtime-sync-scheduler';
  const dedupeTtlMs = options.dedupeTtlMs ?? DEFAULT_SCHEDULE_DEDUPE_TTL_MS;
  const bindings = bindingInputs
    .map((binding) => normalizeBinding(binding))
    .filter((binding): binding is CafeRuntimeSyncBinding => Boolean(binding))
    .filter((binding) => isOperationalDatabaseConfigured(binding.databaseKey));

  if (bindings.length === 0) {
    return { queued: 0, skipped: 0, mode: 'noop' };
  }

  const scheduled: CafeRuntimeSyncBinding[] = [];
  let skipped = 0;
  for (const binding of bindings) {
    if (!options.force && shouldSkipScheduleDueToTtl(binding, dedupeTtlMs)) {
      skipped += 1;
      continue;
    }
    scheduled.push(binding);
  }

  if (scheduled.length === 0) {
    return { queued: 0, skipped, mode: 'noop' };
  }

  const body = {
    bindings: scheduled,
    source,
    ttlMs: options.ttlMs,
    timeoutMs: options.timeoutMs,
    concurrency: options.concurrency,
    force: options.force === true,
  };

  if (isQStashConfigured()) {
    await enqueueInternalRequestWithQStash({
      path: '/api/internal/platform/runtime-status/sync',
      method: 'POST',
      body,
      retries: 2,
      timeoutSeconds: 20,
      dedupeKey: `runtime-sync:${scheduled.map((binding) => syncCacheKey(binding)).sort().join('|')}`,
    });
    return { queued: scheduled.length, skipped, mode: 'qstash' };
  }

  const baseUrl = resolveInternalBaseUrl(options.requestOrigin);
  const secret = String(process.env.CRON_SECRET ?? '').trim();
  if (!baseUrl || !secret) {
    return { queued: 0, skipped: skipped + scheduled.length, mode: 'noop' };
  }

  const target = new URL('/api/internal/platform/runtime-status/sync', `${baseUrl}/`).toString();
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), DIRECT_DISPATCH_TIMEOUT_MS);

  try {
    const response = await fetch(target, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secret}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!response.ok) {
      return { queued: 0, skipped: skipped + scheduled.length, mode: 'noop' };
    }

    return { queued: scheduled.length, skipped, mode: 'direct' };
  } catch {
    return { queued: 0, skipped: skipped + scheduled.length, mode: 'noop' };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

export async function scheduleCafeRuntimeStatusSync(
  bindingInput: CafeRuntimeSyncBinding,
  options: RuntimeStatusBackgroundScheduleOptions = {},
) {
  return scheduleCafeRuntimeStatusesSync([bindingInput], options);
}
