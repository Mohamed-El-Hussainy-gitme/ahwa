# Reporting maintenance smoke runbook

This runbook is the operational check before a real archive execution is approved.

## Required environment

Export the following values in the shell that will run the smoke script:

```bash
export AHWA_REPORTING_MAINTENANCE_BASE_URL="https://<deployment-host>"
export AHWA_REPORTING_MAINTENANCE_CRON_SECRET="<same CRON_SECRET configured in deployment>"
export AHWA_REPORTING_MAINTENANCE_CAFE_ID="<optional-single-cafe-id>"
export AHWA_REPORTING_MAINTENANCE_WINDOW_DAYS="35"
export AHWA_REPORTING_MAINTENANCE_GRACE_DAYS="14"
```

## Smoke command

```bash
npm run smoke:reporting-maintenance
```

The script will call the internal maintenance route three times in this order:

1. `action=backfill`
2. `action=reconcile`
3. `action=archive-plan`

## Pass criteria

- Backfill returns `ok: true`
- Reconcile returns `ok: true`
- Reconcile shows no unexpected execution failure for any cafe
- Archive plan returns `ok: true`
- Archive plan returns `approval_id` when eligible shifts exist
- Archive plan never deletes runtime data

## Real archive execution

The smoke script does **not** run destructive archive execution.
That step stays manual and must happen only after the generated approval is reviewed.

Use the dedicated runbook for the real execution step:
- `docs/execution/archive-approval-runbook.md`

## Release gate

Static gate:

```bash
npm run verify:reporting-maintenance
```

This gate checks that migrations, route wiring, cron wiring, docs, and smoke artifacts still exist before merge.
