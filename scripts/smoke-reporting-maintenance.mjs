import assert from 'node:assert/strict';

const BASE_URL = process.env.AHWA_REPORTING_MAINTENANCE_BASE_URL?.replace(/\/$/, '');
const CRON_SECRET = process.env.AHWA_REPORTING_MAINTENANCE_CRON_SECRET || process.env.CRON_SECRET;
const CAFE_ID = process.env.AHWA_REPORTING_MAINTENANCE_CAFE_ID || '';
const WINDOW_DAYS = process.env.AHWA_REPORTING_MAINTENANCE_WINDOW_DAYS || '35';
const GRACE_DAYS = process.env.AHWA_REPORTING_MAINTENANCE_GRACE_DAYS || '14';
const INCLUDE_INACTIVE = process.env.AHWA_REPORTING_MAINTENANCE_INCLUDE_INACTIVE === 'true';

function buildUrl(action, extra = {}) {
  assert.ok(BASE_URL, 'AHWA_REPORTING_MAINTENANCE_BASE_URL is required');
  const url = new URL('/api/internal/maintenance/reporting', BASE_URL);
  url.searchParams.set('action', action);
  url.searchParams.set('windowDays', WINDOW_DAYS);
  url.searchParams.set('graceDays', GRACE_DAYS);
  if (INCLUDE_INACTIVE) url.searchParams.set('includeInactive', 'true');
  if (CAFE_ID) url.searchParams.set('cafeId', CAFE_ID);
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  return url;
}

async function callAction(action, extra = {}) {
  assert.ok(CRON_SECRET, 'AHWA_REPORTING_MAINTENANCE_CRON_SECRET or CRON_SECRET is required');
  const url = buildUrl(action, extra);
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${CRON_SECRET}`,
      accept: 'application/json',
    },
  });

  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`${action} returned non-JSON payload: ${text.slice(0, 300)}`);
  }

  if (!response.ok) {
    throw new Error(`${action} failed with HTTP ${response.status}: ${JSON.stringify(payload)}`);
  }

  assert.equal(payload.ok, true, `${action} payload.ok must be true`);
  assert.equal(payload.action, action, `${action} payload.action mismatch`);
  assert.ok(Array.isArray(payload.results), `${action} results must be an array`);

  for (const result of payload.results) {
    assert.equal(typeof result.cafeId, 'string', `${action} cafeId must be a string`);
    assert.equal(typeof result.ok, 'boolean', `${action} result.ok must be boolean`);
    if (!result.ok) {
      throw new Error(`${action} failed for cafe ${result.cafeId}: ${result.error ?? 'UNKNOWN_ERROR'}`);
    }
    assert.ok(result.result && typeof result.result === 'object', `${action} result payload missing for cafe ${result.cafeId}`);
  }

  return payload;
}

function summarize(payload) {
  return {
    action: payload.action,
    cafeCount: payload.cafeCount,
    dryRun: payload.dryRun,
    startDate: payload.startDate,
    endDate: payload.endDate,
    graceDays: payload.graceDays,
    results: payload.results.map((entry) => ({
      cafeId: entry.cafeId,
      ok: entry.ok,
      approvalId: entry.result?.approval_id ?? null,
      approvalRequired: entry.result?.approval_required ?? null,
      dailyMismatchCount: entry.result?.daily_mismatch_count ?? null,
    })),
  };
}

async function main() {
  const backfill = await callAction('backfill');
  const reconcile = await callAction('reconcile');
  const archive = await callAction('archive-plan');

  console.log(JSON.stringify({
    ok: true,
    backfill: summarize(backfill),
    reconcile: summarize(reconcile),
    archivePlan: summarize(archive),
  }, null, 2));
}

main().catch((error) => {
  console.error(`smoke-reporting-maintenance: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
