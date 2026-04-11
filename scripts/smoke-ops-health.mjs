#!/usr/bin/env node
const baseUrl = String(process.env.AHWA_SMOKE_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? '').trim().replace(/\/$/, '');
const secret = String(process.env.CRON_SECRET ?? '').trim();

if (!baseUrl) {
  console.error('smoke-ops-health: AHWA_SMOKE_BASE_URL or NEXT_PUBLIC_APP_URL is required');
  process.exit(1);
}

if (!secret) {
  console.error('smoke-ops-health: CRON_SECRET is required');
  process.exit(1);
}

const response = await fetch(`${baseUrl}/api/internal/health/ops`, {
  headers: {
    authorization: `Bearer ${secret}`,
    'x-request-id': `smoke-ops-health-${Date.now().toString(36)}`,
  },
  cache: 'no-store',
});

const payload = await response.json().catch(() => ({}));
if (!response.ok || !payload?.ok) {
  console.error('smoke-ops-health: unexpected response', { status: response.status, payload });
  process.exit(1);
}
if (!payload?.checks?.env?.ok) {
  console.error('smoke-ops-health: env validation is not ok', payload);
  process.exit(1);
}
if (!response.headers.get('x-request-id')) {
  console.error('smoke-ops-health: x-request-id response header is missing');
  process.exit(1);
}
console.log('smoke-ops-health: ok');
