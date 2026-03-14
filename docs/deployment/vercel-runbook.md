# Vercel runbook

## Active project

Only `apps/web` remains as a deployable application package.

### Root directory

Set Root Directory to `apps/web`.

### Required environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `AHWA_SESSION_SECRET`
- `AHWA_INSTALL_TOKEN` (recommended)
- `AHWA_DEVICE_PAIRING_CODE` (optional, falls back to `AHWA_INSTALL_TOKEN`)

## Notes

- There is no separate `apps/api` deployment anymore.
- Runtime auth, device activation, platform admin routes, and ops commands all run through the active web app server routes.

## Legacy fallback names

The app still accepts legacy Supabase env names during migration:

- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
