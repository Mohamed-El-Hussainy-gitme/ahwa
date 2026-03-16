import assert from 'node:assert/strict';

const MODE = process.argv[2] || 'plan';
const BASE_URL = process.env.AHWA_REPORTING_MAINTENANCE_BASE_URL?.replace(/\/$/, '');
const CRON_SECRET = process.env.AHWA_REPORTING_MAINTENANCE_CRON_SECRET || process.env.CRON_SECRET;
const APPROVAL_SECRET = process.env.AHWA_REPORTING_ARCHIVE_APPROVAL_SECRET || process.env.ARCHIVE_APPROVAL_SECRET;
const CAFE_ID = process.env.AHWA_REPORTING_MAINTENANCE_CAFE_ID || '';
const GRACE_DAYS = process.env.AHWA_REPORTING_MAINTENANCE_GRACE_DAYS || '14';
const WINDOW_DAYS = process.env.AHWA_REPORTING_MAINTENANCE_WINDOW_DAYS || '35';
const APPROVAL_ID = process.env.AHWA_REPORTING_ARCHIVE_APPROVAL_ID || '';
const APPROVED_BY = process.env.AHWA_REPORTING_ARCHIVE_APPROVED_BY || 'manual';
const NOTES = process.env.AHWA_REPORTING_ARCHIVE_NOTES || '';

function buildPlanUrl() {
  assert.ok(BASE_URL, 'AHWA_REPORTING_MAINTENANCE_BASE_URL is required');
  const url = new URL('/api/internal/maintenance/reporting', BASE_URL);
  url.searchParams.set('action', 'archive-plan');
  url.searchParams.set('windowDays', WINDOW_DAYS);
  url.searchParams.set('graceDays', GRACE_DAYS);
  if (CAFE_ID) url.searchParams.set('cafeId', CAFE_ID);
  return url;
}

async function plan() {
  assert.ok(CRON_SECRET, 'AHWA_REPORTING_MAINTENANCE_CRON_SECRET or CRON_SECRET is required');
  const response = await fetch(buildPlanUrl(), {
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

  console.log(JSON.stringify({
    ok: true,
    action: payload.action,
    results: payload.results.map((entry) => ({
      cafeId: entry.cafeId,
      ok: entry.ok,
      approvalId: entry.result?.approval_id ?? null,
      approvalRequired: entry.result?.approval_required ?? null,
      archiveBeforeDate: entry.result?.archive_before_date ?? null,
      shiftCount: entry.result?.plan?.shift_count ?? null,
      dryRunArchived: entry.result?.plan?.archived ?? null,
    })),
  }, null, 2));
}

async function execute() {
  assert.ok(BASE_URL, 'AHWA_REPORTING_MAINTENANCE_BASE_URL is required');
  assert.ok(CRON_SECRET, 'AHWA_REPORTING_MAINTENANCE_CRON_SECRET or CRON_SECRET is required');
  assert.ok(APPROVAL_SECRET, 'AHWA_REPORTING_ARCHIVE_APPROVAL_SECRET or ARCHIVE_APPROVAL_SECRET is required');
  assert.ok(APPROVAL_ID, 'AHWA_REPORTING_ARCHIVE_APPROVAL_ID is required');

  const url = new URL('/api/internal/maintenance/reporting', BASE_URL);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${CRON_SECRET}`,
      'x-archive-approval-secret': APPROVAL_SECRET,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      action: 'archive-execute',
      approvalId: APPROVAL_ID,
      approvedBy: APPROVED_BY,
      notes: NOTES,
    }),
  });

  const payload = await response.json();
  if (!response.ok || payload.ok !== true) {
    throw new Error(`archive-execute failed: ${JSON.stringify(payload)}`);
  }

  console.log(JSON.stringify(payload, null, 2));
}

if (MODE === 'plan') {
  plan().catch((error) => {
    console.error(`manage-reporting-archive-approval(plan): ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
} else if (MODE === 'execute') {
  execute().catch((error) => {
    console.error(`manage-reporting-archive-approval(execute): ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
} else {
  console.error('manage-reporting-archive-approval: mode must be plan or execute');
  process.exit(1);
}
