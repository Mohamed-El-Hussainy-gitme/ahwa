# Production release gate

Every production deployment must pass the same gate before Vercel is allowed to become the source of truth.

## Required checks

Run these commands in order:

1. `npm ci`
2. `npm run verify:release`
3. `npm run verify:operations`
4. `npm run verify:phase30`
5. `npm run typecheck`
6. `npm run build`

## Mandatory runtime smoke

After a successful build, verify the active deployment with these flows:

- Public QR opens without forcing worker login.
- Orders workspace can create a session and submit an order.
- Station workspace receives the order.
- Ready / waiter delivery path converges.
- Billing reflects delivered items.
- `/api/internal/health/ops` returns `ok: true` with the production secrets and env contract.
- `/api/ops/events` does not produce reconnect storms or Redis `EINVAL` errors.
- PWA install/open path still works for the operational surfaces.

## Rollback rule

Do not keep a deployment live if any of the following occurs after release:

- `ops/events` health fails
- outbox backlog grows without converging
- public QR regresses to authenticated routes
- Vercel build succeeds but runtime health is red

Rollback to the previous stable deployment first, then debug on staging.

- If QStash is enabled, confirm `QSTASH_TOKEN` and `NEXT_PUBLIC_APP_URL` are configured and queueing succeeds for background jobs.
