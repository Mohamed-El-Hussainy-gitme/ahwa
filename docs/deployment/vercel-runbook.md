# Vercel runbook

## Active project

Only `apps/web` remains as a deployable application package.

### Root directory

Set Root Directory to `apps/web`.

### Required environment variables

- `CONTROL_PLANE_SUPABASE_URL`
- `CONTROL_PLANE_SUPABASE_PUBLISHABLE_KEY`
- `CONTROL_PLANE_SUPABASE_SECRET_KEY`
- `AHWA_OPERATIONAL_DATABASE__OPS_MAIN__URL`
- `AHWA_OPERATIONAL_DATABASE__OPS_MAIN__PUBLISHABLE_KEY`
- `AHWA_OPERATIONAL_DATABASE__OPS_MAIN__SECRET_KEY`
- `AHWA_SESSION_SECRET`
- `AHWA_INSTALL_TOKEN` (recommended)
- `AHWA_DEVICE_PAIRING_CODE` (optional, falls back to `AHWA_INSTALL_TOKEN`)

## Notes

- There is no separate `apps/api` deployment anymore.
- Runtime auth, device activation, platform admin routes, and ops commands all run through the active web app server routes.

## Multi-database note

Add one `AHWA_OPERATIONAL_DATABASE__<TOKEN>__*` set per operational database. The web app no longer reads legacy global Supabase keys.
