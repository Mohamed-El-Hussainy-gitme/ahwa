# Environment matrix

This file is the canonical environment classification for platform operations.

## Required in production

- `CONTROL_PLANE_SUPABASE_URL`
- `CONTROL_PLANE_SUPABASE_PUBLISHABLE_KEY`
- `CONTROL_PLANE_SUPABASE_SECRET_KEY`
- `AHWA_OPERATIONAL_DATABASE__<TOKEN>__URL`
- `AHWA_OPERATIONAL_DATABASE__<TOKEN>__PUBLISHABLE_KEY`
- `AHWA_OPERATIONAL_DATABASE__<TOKEN>__SECRET_KEY`
- `AHWA_SESSION_SECRET`
- `AHWA_INSTALL_TOKEN`
- `AHWA_DEVICE_PAIRING_CODE`
- `CRON_SECRET`
- `ARCHIVE_APPROVAL_SECRET`
- `AHWA_OPS_EVENT_BUS_DRIVER`
- `AHWA_OPS_EVENT_BUS_REDIS_URL` when Redis or auto+Redis is used
- `AHWA_OPS_OUTBOX_DISPATCH_POLICY`
- `AHWA_OPS_OUTBOX_DISPATCH_BATCH_LIMIT`
- `AHWA_OPS_OUTBOX_RETRY_AFTER_SECONDS`
- `AHWA_OPS_OUTBOX_MAX_ATTEMPTS`
- `NEXT_PUBLIC_APP_URL`

## Optional / future

These are not required for the current runtime contract and must not be assumed live until code paths are added:

- `QSTASH_TOKEN`
- `QSTASH_CURRENT_SIGNING_KEY`
- `QSTASH_NEXT_SIGNING_KEY`

## Load / soak / failure lab only

These are valid for operational testing and capacity work, not for day-to-day runtime execution:

- `AHWA_LOAD_BASE_URL`
- `AHWA_LOAD_PROFILE_PATH`
- `AHWA_LOAD_FIXTURE_PATH`
- `AHWA_LOAD_OUTPUT_PATH`
- `AHWA_SOAK_SNAPSHOT_OUTPUT_PATH`
- `AHWA_FAILURE_OUTPUT_PATH`
- `AHWA_CAPACITY_OUTPUT_PATH`
- `AHWA_CAPACITY_HEADROOM_FACTOR`
- `AHWA_LOAD_SLUG_PREFIX`
- `AHWA_LOAD_CAFE_PREFIX`
- `AHWA_LOAD_OWNER_PREFIX`

## Observability tuning

- `AHWA_SERVER_OBSERVABILITY_ENABLED`
- `AHWA_SERVER_OBSERVABILITY_MODE`
- `AHWA_SERVER_OBSERVABILITY_SLOW_MS`

Use `standard` mode in production unless active troubleshooting requires `verbose`.

## QStash
- `QSTASH_TOKEN`: required to enqueue background jobs through QStash.
- `QSTASH_CURRENT_SIGNING_KEY` / `QSTASH_NEXT_SIGNING_KEY`: optional for future receiver verification; not required for the current internal forwarder pattern.
