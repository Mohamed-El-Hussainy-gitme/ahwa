import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import Redis from 'ioredis';

function env(name, fallback = '') {
  const value = process.env[name];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function listOperationalDatabases() {
  const prefix = 'AHWA_OPERATIONAL_DATABASE__';
  const grouped = new Map();
  for (const [name, rawValue] of Object.entries(process.env)) {
    if (!name.startsWith(prefix)) continue;
    const value = typeof rawValue === 'string' ? rawValue.trim() : '';
    if (!value) continue;
    const rest = name.slice(prefix.length);
    const sep = rest.indexOf('__');
    if (sep <= 0) continue;
    const token = rest.slice(0, sep).trim();
    const field = rest.slice(sep + 2).trim();
    if (!token || !field) continue;
    const current = grouped.get(token) ?? { databaseKey: token.toLowerCase().replace(/_+/g, '-'), token };
    if (field === 'URL') current.url = value;
    if (field === 'SECRET_KEY' || field === 'SERVICE_ROLE_KEY') current.key = current.key || value;
    grouped.set(token, current);
  }
  return Array.from(grouped.values()).filter((item) => item.databaseKey && item.url && item.key);
}

function buildClient(option) {
  return createClient(option.url, option.key, { auth: { persistSession: false, autoRefreshToken: false } }).schema('ops');
}

function buildEvent(row) {
  return {
    id: String(row.id ?? ''),
    type: String(row.event_type ?? ''),
    cafeId: String(row.cafe_id ?? ''),
    shiftId: row.shift_id ? String(row.shift_id) : null,
    entityId: row.entity_id ? String(row.entity_id) : null,
    at: row.occurred_at ? new Date(row.occurred_at).toISOString() : new Date().toISOString(),
    data: row.payload && typeof row.payload === 'object' ? row.payload : {},
    version: 1,
    stream: String(row.stream_name ?? 'ops'),
    cursor: String(row.id ?? ''),
    scopes: Array.isArray(row.scope_codes) ? row.scope_codes.map((value) => String(value ?? '').trim()).filter(Boolean) : [],
  };
}

function streamKey(prefix, cafeId) {
  return `${prefix}:ops:cafe:${cafeId}`;
}

async function publish(redis, prefix, maxLen, row) {
  const event = buildEvent(row);
  const key = streamKey(prefix, event.cafeId);
  const cursor = await redis.xadd(key, 'MAXLEN', '~', String(maxLen), '*', 'payload', JSON.stringify(event));
  return { ...event, cursor };
}

async function dispatchDatabase(option, redis, { limit, retryAfterSeconds, maxAttempts, cafeId = null }) {
  const admin = buildClient(option);
  const startedAt = new Date();
  const claimToken = crypto.randomUUID();
  const { data: claimed, error: claimError } = await admin.rpc('ops_claim_outbox_events', {
    p_limit: limit,
    p_claim_token: claimToken,
    p_cafe_id: cafeId,
  });
  if (claimError) throw claimError;
  const rows = Array.isArray(claimed) ? claimed : [];
  if (!rows.length) {
    const result = { databaseKey: option.databaseKey, claimed: 0, published: 0, failed: 0, deadLettered: 0 };
    await admin.rpc('ops_record_outbox_dispatch_run', {
      p_trigger_source: 'cli-dispatch',
      p_cafe_id: cafeId,
      p_claimed_count: 0,
      p_published_count: 0,
      p_failed_count: 0,
      p_dead_lettered_count: 0,
      p_duration_ms: Math.max(Date.now() - startedAt.getTime(), 0),
      p_notes: { database_key: option.databaseKey, cafe_id: cafeId },
      p_run_started_at: startedAt.toISOString(),
      p_run_finished_at: new Date().toISOString(),
    });
    return result;
  }

  const publishedIds = [];
  const failedGroups = new Map();
  for (const row of rows) {
    try {
      await publish(redis, env('AHWA_OPS_EVENT_BUS_REDIS_PREFIX', 'ahwa'), Number(env('AHWA_OPS_EVENT_BUS_REDIS_MAXLEN', '20000')), row);
      publishedIds.push(String(row.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'OUTBOX_PUBLISH_FAILED';
      const bucket = failedGroups.get(message) ?? [];
      bucket.push(String(row.id));
      failedGroups.set(message, bucket);
    }
  }

  if (publishedIds.length) {
    const { error } = await admin.rpc('ops_mark_outbox_events_published', { p_ids: publishedIds, p_claim_token: claimToken });
    if (error) throw error;
  }

  let deadLettered = 0;
  for (const [message, ids] of failedGroups.entries()) {
    const { data, error } = await admin.rpc('ops_mark_outbox_events_failed', {
      p_ids: ids,
      p_claim_token: claimToken,
      p_error: message,
      p_retry_after_seconds: retryAfterSeconds,
      p_max_attempts: maxAttempts,
    });
    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    deadLettered += rows.reduce((total, row) => total + (row.dead_lettered ? 1 : 0), 0);
  }

  const result = {
    databaseKey: option.databaseKey,
    claimed: rows.length,
    published: publishedIds.length,
    failed: Array.from(failedGroups.values()).reduce((total, ids) => total + ids.length, 0),
    deadLettered,
  };

  await admin.rpc('ops_record_outbox_dispatch_run', {
    p_trigger_source: 'cli-dispatch',
    p_cafe_id: cafeId,
    p_claimed_count: result.claimed,
    p_published_count: result.published,
    p_failed_count: result.failed,
    p_dead_lettered_count: result.deadLettered,
    p_duration_ms: Math.max(Date.now() - startedAt.getTime(), 0),
    p_notes: { database_key: option.databaseKey, cafe_id: cafeId },
    p_run_started_at: startedAt.toISOString(),
    p_run_finished_at: new Date().toISOString(),
  });

  return result;
}

async function main() {
  const redisUrl = env('AHWA_OPS_EVENT_BUS_REDIS_URL');
  if (!redisUrl) {
    throw new Error('AHWA_OPS_EVENT_BUS_REDIS_URL is required');
  }

  const selectedDatabaseKey = env('AHWA_OPS_OUTBOX_DATABASE_KEY');
  const cafeId = env('AHWA_OPS_OUTBOX_CAFE_ID') || null;
  const limit = Number(env('AHWA_OPS_OUTBOX_DISPATCH_BATCH_LIMIT', '100'));
  const retryAfterSeconds = Number(env('AHWA_OPS_OUTBOX_RETRY_AFTER_SECONDS', '15'));
  const maxAttempts = Number(env('AHWA_OPS_OUTBOX_MAX_ATTEMPTS', '20'));

  const configured = listOperationalDatabases().filter((item) => !selectedDatabaseKey || item.databaseKey === selectedDatabaseKey);
  if (!configured.length) {
    throw new Error('No operational databases are configured for outbox dispatch');
  }

  const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 3 });
  await redis.connect();

  try {
    const results = [];
    for (const option of configured) {
      results.push(await dispatchDatabase(option, redis, { limit, retryAfterSeconds, maxAttempts, cafeId }));
    }
    process.stdout.write(JSON.stringify({ ok: true, results }, null, 2) + '\n');
  } finally {
    await redis.quit().catch(() => redis.disconnect());
  }
}

main().catch((error) => {
  process.stderr.write((error instanceof Error ? error.stack || error.message : String(error)) + '\n');
  process.exitCode = 1;
});
