# V8 deploy note

Removed the per-minute Vercel cron for `/api/internal/qstash/ops/outbox-dispatch` because Hobby plans reject schedules that run more than once per day.

Impact:
- Vercel deployments can proceed on Hobby.
- Auto-deploy on push can resume once this version is deployed from Git.
- Background outbox dispatch is no longer driven by Vercel cron in this repo. If `AHWA_OPS_OUTBOX_INLINE_DISPATCH_ENABLED=false`, dispatch now depends on other triggers already present in your runtime or on upgrading the Vercel plan / external scheduler.
