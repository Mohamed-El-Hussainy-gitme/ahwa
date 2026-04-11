#!/usr/bin/env node
const baseUrl = String(process.env.SMOKE_BASE_URL ?? '').trim().replace(/\/$/, '');
const cronSecret = String(process.env.CRON_SECRET ?? '').trim();

if (!baseUrl) {
  console.error('smoke-ops-health: SMOKE_BASE_URL is required');
  process.exit(1);
}

if (!cronSecret) {
  console.error('smoke-ops-health: CRON_SECRET is required');
  process.exit(1);
}

const response = await fetch(`${baseUrl}/api/internal/health/ops`, {
  headers: {
    authorization: `Bearer ${cronSecret}`,
    'x-request-id': `smoke-ops-health-${Date.now()}`,
  },
});

const payload = await response.json().catch(() => null);

if (!response.ok || !payload?.ok) {
  console.error(`smoke-ops-health: failed with status ${response.status}`);
  console.error(JSON.stringify(payload ?? { ok: false }, null, 2));
  process.exit(1);
}

console.log('smoke-ops-health: ok');
