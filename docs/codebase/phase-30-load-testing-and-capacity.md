# Phase 30 — Load testing, soak testing, failure labs, and capacity reports

This phase adds a repeatable proof layer on top of phases 1-4 without changing the runtime business logic.

## What was added

### Provisioning
- `scripts/load/provision-ops-fixtures.mjs`
  - creates test cafes per tier (`small`, `medium`, `heavy`, `enterprise`)
  - opens shifts
  - provisions waiter / barista / shisha staff
  - creates one barista product and one shisha product per cafe
  - saves a fixture bundle to JSON for later reuse

### Load harness
- `scripts/load/load-core.mjs`
- `scripts/load/run-ops-load.mjs`
- `scripts/load/profiles/default-ops-mix.json`

The harness runs realistic hot-path cycles against the live APIs:
1. open or resume session
2. create order
3. station ready
4. delivery
5. billing settle
6. session close

The default profile models a non-uniform mix instead of pretending all cafes are identical.

### Soak tests
- `scripts/load/run-ops-soak.mjs`

The soak runner executes the same hot-path cycles while polling platform observability snapshots on an interval and writing them to a separate file.

### Failure labs
- `scripts/load/run-ops-failure-lab.mjs`

The failure lab currently validates three resilience behaviors:
- duplicate ready deduplication through idempotency keys
- SSE reconnect continuity through `Last-Event-ID`
- outbox backlog and drain recovery (when inline dispatch is disabled in the target environment)

### Capacity reports
- `scripts/load/build-capacity-report.mjs`

This script converts a real load run into a human-readable capacity envelope:
- action p95 / p99
- per-tier cycles-per-minute-per-cafe
- per-shard observed action rates
- remaining load units from the control-plane policy
- placement recommendation per shard

## Runtime discipline

This phase does **not** push history back into hot runtime tables.
- the runtime remains archive-first
- load outputs are written to JSON files outside the runtime
- failure labs consume the existing outbox / observability layers rather than storing heavy traces in production tables

## Expected workflow

1. provision fixtures
2. run the main load profile
3. run the soak profile
4. run the failure lab
5. build a capacity report from the load result

Example commands:

```bash
npm run load:ops:provision
npm run load:ops
npm run soak:ops
npm run failure:ops
npm run report:capacity
```

## Important note

This phase gives you the **tooling and reporting layer** to obtain real capacity numbers.
It does **not** invent fake capacity numbers inside the repository.
You still need to run the harness against your actual deployed environment and shards to produce the numbers you will trust for sales and operations.
