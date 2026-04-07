import 'server-only';
import crypto from 'node:crypto';
import { beginServerObservation, logServerObservation } from '@/lib/observability/server';
import { getOutboxDispatchPolicy } from '@/lib/platform/env-contract';
import type { OpsRealtimeEvent } from '@/lib/ops/types';
import { publishOpsEvent } from '@/lib/ops/events';
import { supabaseAdminForDatabase } from '@/lib/supabase/admin';
import { listConfiguredOperationalDatabasesFromEnv } from '@/lib/supabase/env';

type OutboxClaimRow = {
  id?: string | null;
  cafe_id?: string | null;
  shift_id?: string | null;
  stream_name?: string | null;
  event_type?: string | null;
  scope_codes?: string[] | null;
  entity_id?: string | null;
  payload?: Record<string, unknown> | null;
  occurred_at?: string | null;
};

export type DispatchOpsOutboxBatchInput = {
  databaseKey: string;
  cafeId?: string | null;
  limit?: number;
  triggerSource?: string | null;
};

export type DispatchOpsOutboxBatchResult = {
  databaseKey: string;
  cafeId: string | null;
  claimed: number;
  published: number;
  failed: number;
  deadLettered: number;
};

const DEFAULT_BATCH_LIMIT = 100;
const DEFAULT_RETRY_AFTER_SECONDS = 15;
const DEFAULT_MAX_ATTEMPTS = 20;
const OPS_OUTBOX_KICK_KEY = '__ahwa_ops_outbox_kick__';

type GlobalKickScope = typeof globalThis & {
  [OPS_OUTBOX_KICK_KEY]?: Map<string, Promise<void>>;
};

function envNumber(name: string, fallback: number) {
  const parsed = Number(process.env[name] ?? fallback);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

function getKickMap() {
  const scope = globalThis as GlobalKickScope;
  if (!scope[OPS_OUTBOX_KICK_KEY]) {
    scope[OPS_OUTBOX_KICK_KEY] = new Map<string, Promise<void>>();
  }
  return scope[OPS_OUTBOX_KICK_KEY] as Map<string, Promise<void>>;
}

function resolveLimit(limit?: number) {
  if (Number.isFinite(limit) && Number(limit) > 0) {
    return Math.min(Math.trunc(Number(limit)), 500);
  }
  return Math.min(envNumber('AHWA_OPS_OUTBOX_DISPATCH_BATCH_LIMIT', DEFAULT_BATCH_LIMIT), 500);
}

function buildEvent(row: OutboxClaimRow): OpsRealtimeEvent {
  const eventId = String(row.id ?? '').trim();
  const cafeId = String(row.cafe_id ?? '').trim();
  const eventType = String(row.event_type ?? '').trim();
  if (!eventId || !cafeId || !eventType) {
    throw new Error('INVALID_OUTBOX_ROW');
  }

  return {
    id: eventId,
    type: eventType,
    cafeId,
    shiftId: row.shift_id ? String(row.shift_id) : null,
    entityId: row.entity_id ? String(row.entity_id) : null,
    at: row.occurred_at ? new Date(row.occurred_at).toISOString() : new Date().toISOString(),
    data: row.payload && typeof row.payload === 'object' ? row.payload : {},
    version: 1,
    stream: String(row.stream_name ?? '').trim() || 'ops',
    cursor: eventId,
    scopes: Array.isArray(row.scope_codes)
      ? row.scope_codes.map((value) => String(value ?? '').trim()).filter(Boolean)
      : [],
  } satisfies OpsRealtimeEvent;
}

async function claimOpsOutboxRows(databaseKey: string, cafeId: string | null, limit: number, claimToken: string) {
  const { data, error } = await supabaseAdminForDatabase(databaseKey).rpc('ops_claim_outbox_events', {
    p_limit: limit,
    p_claim_token: claimToken,
    p_cafe_id: cafeId,
  });

  if (error) {
    throw error;
  }

  return (data ?? []) as OutboxClaimRow[];
}

async function markOpsOutboxRowsPublished(databaseKey: string, claimToken: string, ids: string[]) {
  if (!ids.length) return;
  const { error } = await supabaseAdminForDatabase(databaseKey).rpc('ops_mark_outbox_events_published', {
    p_ids: ids,
    p_claim_token: claimToken,
  });
  if (error) {
    throw error;
  }
}

async function markOpsOutboxRowsFailed(
  databaseKey: string,
  claimToken: string,
  ids: string[],
  errorMessage: string,
) {
  if (!ids.length) return { deadLettered: 0 };
  const { data, error } = await supabaseAdminForDatabase(databaseKey).rpc('ops_mark_outbox_events_failed', {
    p_ids: ids,
    p_claim_token: claimToken,
    p_error: errorMessage,
    p_retry_after_seconds: envNumber('AHWA_OPS_OUTBOX_RETRY_AFTER_SECONDS', DEFAULT_RETRY_AFTER_SECONDS),
    p_max_attempts: envNumber('AHWA_OPS_OUTBOX_MAX_ATTEMPTS', DEFAULT_MAX_ATTEMPTS),
  });
  if (error) {
    throw error;
  }

  const rows = Array.isArray(data) ? data as Array<{ id?: string | null; dead_lettered?: boolean | null }> : [];
  return {
    deadLettered: rows.reduce((total, row) => total + (row.dead_lettered ? 1 : 0), 0),
  };
}


async function recordOpsOutboxDispatchRun(
  result: DispatchOpsOutboxBatchResult,
  startedAt: Date,
  triggerSource: string,
) {
  const finishedAt = new Date();
  const durationMs = Math.max(finishedAt.getTime() - startedAt.getTime(), 0);
  try {
    const { error } = await supabaseAdminForDatabase(result.databaseKey).rpc('ops_record_outbox_dispatch_run', {
      p_trigger_source: triggerSource,
      p_cafe_id: result.cafeId,
      p_claimed_count: result.claimed,
      p_published_count: result.published,
      p_failed_count: result.failed,
      p_dead_lettered_count: result.deadLettered,
      p_duration_ms: durationMs,
      p_notes: {
        database_key: result.databaseKey,
        cafe_id: result.cafeId,
      },
      p_run_started_at: startedAt.toISOString(),
      p_run_finished_at: finishedAt.toISOString(),
    });

    if (error) {
      throw error;
    }
  } catch (error) {
    logServerObservation(
      beginServerObservation('ops.outbox.dispatch.telemetry', { databaseKey: result.databaseKey }),
      'error',
      { message: error instanceof Error ? error.message : 'OUTBOX_DISPATCH_TELEMETRY_FAILED' },
    );
  }
}

export async function dispatchOpsOutboxBatch(input: DispatchOpsOutboxBatchInput): Promise<DispatchOpsOutboxBatchResult> {
  const observation = beginServerObservation('ops.outbox.dispatch.batch', {
    databaseKey: String(input.databaseKey ?? '').trim() || 'unknown',
    cafeId: input.cafeId ? String(input.cafeId).trim() : null,
    limit: resolveLimit(input.limit),
  });
  const startedAt = new Date();
  const databaseKey = String(input.databaseKey ?? '').trim();
  if (!databaseKey) {
    throw new Error('databaseKey is required');
  }

  const cafeId = input.cafeId ? String(input.cafeId).trim() : null;
  const limit = resolveLimit(input.limit);
  const claimToken = crypto.randomUUID();

  try {
    const claimedRows = await claimOpsOutboxRows(databaseKey, cafeId, limit, claimToken);

    if (!claimedRows.length) {
      const emptyResult = { databaseKey, cafeId, claimed: 0, published: 0, failed: 0, deadLettered: 0 } satisfies DispatchOpsOutboxBatchResult;
      await recordOpsOutboxDispatchRun(emptyResult, startedAt, input.triggerSource ?? 'inline-dispatch');
      logServerObservation(observation, 'ok', emptyResult);
      return emptyResult;
    }

    const publishedIds: string[] = [];
    const failures = new Map<string, string[]>();

    for (const row of claimedRows) {
      const rowId = String(row.id ?? '').trim();
      if (!rowId) {
        continue;
      }

      try {
        await publishOpsEvent(buildEvent(row));
        publishedIds.push(rowId);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'OUTBOX_PUBLISH_FAILED';
        const bucket = failures.get(message) ?? [];
        bucket.push(rowId);
        failures.set(message, bucket);
      }
    }

    let deadLettered = 0;
    await markOpsOutboxRowsPublished(databaseKey, claimToken, publishedIds);

    for (const [message, ids] of failures.entries()) {
      const failureResult = await markOpsOutboxRowsFailed(databaseKey, claimToken, ids, message);
      deadLettered += failureResult.deadLettered;
    }

    const result = {
      databaseKey,
      cafeId,
      claimed: claimedRows.length,
      published: publishedIds.length,
      failed: Array.from(failures.values()).reduce((total, ids) => total + ids.length, 0),
      deadLettered,
    } satisfies DispatchOpsOutboxBatchResult;

    await recordOpsOutboxDispatchRun(result, startedAt, input.triggerSource ?? 'inline-dispatch');
    logServerObservation(observation, 'ok', result);
    return result;
  } catch (error) {
    logServerObservation(observation, 'error', {
      message: error instanceof Error ? error.message : 'OUTBOX_DISPATCH_FAILED',
    });
    throw error;
  }
}

export async function dispatchOpsOutboxAcrossConfiguredDatabases(limit?: number) {
  const configured = listConfiguredOperationalDatabasesFromEnv();
  const results: DispatchOpsOutboxBatchResult[] = [];
  for (const option of configured) {
    results.push(await dispatchOpsOutboxBatch({ databaseKey: option.databaseKey, limit, triggerSource: 'configured-sweep' }));
  }
  return results;
}

export function scheduleOpsOutboxDispatch(input: DispatchOpsOutboxBatchInput) {
  const policy = getOutboxDispatchPolicy();
  if (policy === 'background') {
    return;
  }

  const key = `${input.databaseKey.trim()}:${input.cafeId ? String(input.cafeId).trim() : '*'}`;
  const kicks = getKickMap();
  if (kicks.has(key)) {
    return;
  }

  const task = Promise.resolve()
    .then(() => dispatchOpsOutboxBatch(input))
    .catch(() => undefined)
    .finally(() => {
      kicks.delete(key);
    });

  kicks.set(key, task.then(() => undefined));
}
