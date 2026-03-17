# First production release runbook

## 1) Prepare the database

Apply the latest migrations to the control plane and every operational database.

## 2) Verify the operational RPC surface

```sql
select proname
from pg_proc
where pronamespace = 'ops'::regnamespace
and proname in (
  'ops_open_shift',
  'ops_assign_shift_role',
  'ops_reopen_shift',
  'ops_close_shift',
  'ops_build_shift_snapshot'
)
order by proname;
```

## 3) Rotate secrets before first public deploy

Create fresh values for:

- `CONTROL_PLANE_SUPABASE_PUBLISHABLE_KEY`
- `CONTROL_PLANE_SUPABASE_SECRET_KEY`
- `AHWA_OPERATIONAL_DATABASE__OPS_MAIN__PUBLISHABLE_KEY`
- `AHWA_OPERATIONAL_DATABASE__OPS_MAIN__SECRET_KEY`
- `AHWA_SESSION_SECRET`
- `AHWA_INSTALL_TOKEN`
- `AHWA_DEVICE_PAIRING_CODE`

Do not reuse local development secrets in production.

## 4) Configure Vercel

Project settings:

- Framework Preset: `Next.js`
- Root Directory: `apps/web`
- Install Command: `npm ci`
- Build Command: `npm run build:web`
- Output Directory: leave default

Environment variables to add in Vercel:

- `CONTROL_PLANE_SUPABASE_URL`
- `CONTROL_PLANE_SUPABASE_PUBLISHABLE_KEY`
- `CONTROL_PLANE_SUPABASE_SECRET_KEY`
- `AHWA_OPERATIONAL_DATABASE__OPS_MAIN__URL`
- `AHWA_OPERATIONAL_DATABASE__OPS_MAIN__PUBLISHABLE_KEY`
- `AHWA_OPERATIONAL_DATABASE__OPS_MAIN__SECRET_KEY`
- `AHWA_SESSION_SECRET`
- `AHWA_INSTALL_TOKEN`
- `AHWA_DEVICE_PAIRING_CODE`

If you prefer the CLI:

```bash
vercel link
vercel env add CONTROL_PLANE_SUPABASE_URL
vercel env add CONTROL_PLANE_SUPABASE_PUBLISHABLE_KEY
vercel env add CONTROL_PLANE_SUPABASE_SECRET_KEY
vercel env add AHWA_OPERATIONAL_DATABASE__OPS_MAIN__URL
vercel env add AHWA_OPERATIONAL_DATABASE__OPS_MAIN__PUBLISHABLE_KEY
vercel env add AHWA_OPERATIONAL_DATABASE__OPS_MAIN__SECRET_KEY
vercel env add AHWA_SESSION_SECRET
vercel env add AHWA_INSTALL_TOKEN
vercel env add AHWA_DEVICE_PAIRING_CODE
```

## 5) Push to GitHub

```bash
git add .
git commit -m "chore: prepare first production release"
git push -u origin release/first-production
```

Open a pull request to `main` only after CI passes.

## 6) Deploy preview first

Use preview deployment before production promotion.

Smoke checklist after preview is live:

- login works for owners and staff on more than one operational database
- platform cafes list shows correct binding status for bound and unbound cafes
- shift open / close / snapshot flows succeed
- reporting maintenance routes succeed with `CRON_SECRET`
