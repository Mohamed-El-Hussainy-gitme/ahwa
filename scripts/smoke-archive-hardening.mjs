import assert from 'node:assert/strict';

const BASE_URL = process.env.AHWA_REPORTING_MAINTENANCE_BASE_URL?.replace(/\/$/, '');
const CRON_SECRET = process.env.AHWA_REPORTING_MAINTENANCE_CRON_SECRET || process.env.CRON_SECRET;
const CAFE_ID = process.env.AHWA_REPORTING_MAINTENANCE_CAFE_ID || '';
const GRACE_DAYS = process.env.AHWA_REPORTING_MAINTENANCE_GRACE_DAYS || '14';
const WINDOW_DAYS = process.env.AHWA_REPORTING_MAINTENANCE_WINDOW_DAYS || '35';

function buildUrl() {
  assert.ok(BASE_URL, 'AHWA_REPORTING_MAINTENANCE_BASE_URL is required');
  const url = new URL('/api/internal/maintenance/reporting', BASE_URL);
  url.searchParams.set('action', 'archive-plan');
  url.searchParams.set('windowDays', WINDOW_DAYS);
  url.searchParams.set('graceDays', GRACE_DAYS);
  if (CAFE_ID) url.searchParams.set('cafeId', CAFE_ID);
  return url;
}

async function main() {
  assert.ok(CRON_SECRET, 'AHWA_REPORTING_MAINTENANCE_CRON_SECRET or CRON_SECRET is required');
  const response = await fetch(buildUrl(), {
    method: 'GET',
    headers: {
      authorization: `Bearer ${CRON_SECRET}`,
      accept: 'application/json',
    },
  });

  const payload = await response.json();
  if (!response.ok || payload.ok !== true) {
    throw new Error(`archive-plan failed: ${JSON.stringify(payload)}`);
  }

  assert.equal(payload.action, 'archive-plan', 'action must be archive-plan');
  assert.ok(Array.isArray(payload.results), 'results must be an array');

  for (const result of payload.results) {
    assert.equal(typeof result.cafeId, 'string', 'cafeId must be string');
    assert.equal(typeof result.ok, 'boolean', 'ok must be boolean');
    if (!result.ok) {
      throw new Error(`archive-plan failed for cafe ${result.cafeId}: ${result.error ?? 'UNKNOWN_ERROR'}`);
    }
    assert.ok(result.result && typeof result.result === 'object', `archive-plan result missing for cafe ${result.cafeId}`);
    if (result.result.approval_required === true) {
      assert.equal(typeof result.result.approval_id, 'string', 'approval_id must be returned when approval is required');
    }
  }

  console.log(JSON.stringify({
    ok: true,
    action: payload.action,
    cafeCount: payload.cafeCount,
    results: payload.results.map((entry) => ({
      cafeId: entry.cafeId,
      approvalId: entry.result?.approval_id ?? null,
      approvalRequired: entry.result?.approval_required ?? null,
      shiftCount: entry.result?.plan?.shift_count ?? null,
      archiveBeforeDate: entry.result?.archive_before_date ?? null,
    })),
  }, null, 2));
}

main().catch((error) => {
  console.error(`smoke-archive-hardening: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
