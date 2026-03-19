# Phase 29 — Operational observability and shard monitoring

This phase adds live observability on top of phases 1-3 without turning the runtime into a historical sink.

## What was added

- `ops.outbox_dispatch_runs` for short-lived outbox dispatch telemetry.
- `public.ops_record_outbox_dispatch_run(...)` to persist each dispatcher batch outcome.
- `public.ops_reap_outbox_dispatch_runs(...)` to keep the table short-lived.
- `public.ops_get_observability_snapshot()` to read a shard-level snapshot covering:
  - open shifts / active cafes / open sessions
  - waiting / ready / billable quantities
  - deferred balance pressure
  - outbox pending / inflight / retrying / dead-letter counts
  - dispatcher last-hour throughput and failures
- Platform observability API:
  - `/api/platform/observability/overview`
- Platform UI page:
  - `/platform/observability`

## Runtime discipline

The runtime stays light:

- hot operational tables remain the source of truth
- outbox telemetry is short-lived and reaped separately
- no historical archive is pushed back into hot runtime tables

## Baseline separation

`build-db-baselines.mjs` now generates two bundles:

- `database/baselines/operational/0001_fresh_operational_baseline.sql`
- `database/baselines/control-plane/0001_fresh_control_plane_baseline.sql`

Use the operational bundle for newly provisioned runtime shards.
Use the control-plane bundle only for the single control-plane database.
