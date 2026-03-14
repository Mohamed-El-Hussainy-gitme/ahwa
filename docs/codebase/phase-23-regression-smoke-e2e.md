# Phase 23 — regression, smoke, and end-to-end validation

## Goal
Lock the post-phase-9 architecture behind one repeatable validation flow that exercises only the current runtime path:

- browser/client -> `apps/web` route handlers -> `ops.*` / `platform.*`
- no legacy API bridge
- no `apps/api`
- no table/bill-account runtime model

## Deliverables
- `scripts/verify-phase10-regression.mjs`
- `scripts/smoke-phase10-runtime-e2e.mjs`
- `docs/execution/runtime-e2e-smoke-runbook.md`
- `package.json` scripts:
  - `verify:phase10`
  - `smoke:phase10`

## Regression scope
`verify:phase10` checks the codebase shape expected after phases 5-9:
- `apps/api` remains removed
- old step-4 smoke script is gone
- phase-10 docs and smoke script exist
- package scripts expose the new validation entrypoints
- critical runtime routes still exist

## Smoke scope
`smoke:phase10` drives a real browser-like workflow using HTTP + cookies:
1. bootstrap or reuse a super admin
2. platform login
3. create cafe and owner
4. owner login
5. create staff
6. open shift with assignments
7. create menu section + product
8. activate device gate for waiter + barista
9. staff logins
10. open session
11. create order
12. partial ready
13. deliver + settle
14. ready remaining qty
15. deliver + defer
16. repay deferred balance
17. close session
18. build reports
19. build close snapshot
20. close shift

## Realtime coverage
The smoke script also opens `/api/ops/events` and waits for runtime events such as:
- `session.opened`
- `order.submitted`
- `station.partial_ready`
- `station.ready`
- `delivery.delivered`
- `billing.settled`
- `billing.deferred`
- `deferred.repaid`
- `session.closed`
- `shift.closed`

This is the first project-level test that validates command flow and realtime propagation together.

## Notes
- The smoke flow intentionally creates a unique cafe slug every run so it does not collide with previous runs.
- The script assumes migrations through `0008` are already applied.
- The script should be run only against a local or disposable environment because it creates persistent records.
