# Platform operations runbook

This runbook covers the live operational platform after deployment.

## Daily checks

1. Open `/api/internal/health/ops` using `CRON_SECRET` and confirm:
   - env validation is green
   - Redis is configured correctly
   - outbox policy is the intended one for production
2. Review Vercel function health for:
   - `/api/ops/events`
   - `/api/internal/ops/outbox/dispatch`
   - `/api/platform/observability/overview`
3. Confirm there is no repeating Redis `EINVAL` or `Unhandled error event` spam.

## Event backbone checks

### `/api/ops/events`
- Expect normal SSE traffic with stable reconnect behavior.
- Investigate immediately if logs show:
  - `connect EINVAL`
  - reconnect storms
  - continuous `Unhandled error event`

### outbox
- Confirm outbox dispatch cron is running.
- Investigate if claimed/published counts stall or if failures climb without recovery.
- A growing backlog means background convergence is broken even if the UI still appears fast.

## Weekly checks

1. Run the operational verification set:
   - `npm run verify:release`
   - `npm run verify:operations`
   - `npm run verify:phase30`
2. Review platform observability overview and shard health.
3. Confirm release documentation and env matrix still match the live platform.

## Incident handling

### Redis / realtime degraded
- Check `AHWA_OPS_EVENT_BUS_REDIS_URL`
- Confirm `/api/internal/health/ops`
- Check `/api/ops/events` logs
- Validate Upstash connectivity before changing app code

### Outbox backlog growing
- Confirm cron is still calling `/api/internal/ops/outbox/dispatch`
- Review dispatch logs and retry counts
- If needed, run `npm run dispatch:ops-outbox` from a trusted environment for controlled recovery

### Build or release failure
- Run the production release gate locally
- Do not bypass `verify:release` or `verify:operations`
- Roll back first if the live deployment is already unhealthy
