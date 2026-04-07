# GitHub + Vercel release checklist

## Before pushing to GitHub

1. Keep runtime secrets out of git:
   - never commit `apps/web/.env.local`
   - store real values only in your local machine or Vercel project settings
2. Use the explicit multi-DB Supabase contract:
   - `CONTROL_PLANE_SUPABASE_URL`
   - `CONTROL_PLANE_SUPABASE_PUBLISHABLE_KEY`
   - `CONTROL_PLANE_SUPABASE_SECRET_KEY`
   - `AHWA_OPERATIONAL_DATABASE__OPS_MAIN__URL`
   - `AHWA_OPERATIONAL_DATABASE__OPS_MAIN__PUBLISHABLE_KEY`
   - `AHWA_OPERATIONAL_DATABASE__OPS_MAIN__SECRET_KEY`
3. Keep these app secrets unique per environment:
   - `AHWA_SESSION_SECRET`
   - `AHWA_INSTALL_TOKEN`
   - `AHWA_DEVICE_PAIRING_CODE`
4. Run local verification:

```bash
npm ci
npm run build:shared
npm run typecheck:web
npm run lint:web
npm run build:web
```

## Vercel project settings

- Framework: Next.js
- Root Directory: `apps/web`
- Install Command: `npm ci`
- Build Command: `npm run build:web`

## Required Vercel environment variables

- `CONTROL_PLANE_SUPABASE_URL`
- `CONTROL_PLANE_SUPABASE_PUBLISHABLE_KEY`
- `CONTROL_PLANE_SUPABASE_SECRET_KEY`
- `AHWA_OPERATIONAL_DATABASE__OPS_MAIN__URL`
- `AHWA_OPERATIONAL_DATABASE__OPS_MAIN__PUBLISHABLE_KEY`
- `AHWA_OPERATIONAL_DATABASE__OPS_MAIN__SECRET_KEY`
- `AHWA_SESSION_SECRET`
- `AHWA_INSTALL_TOKEN`
- `AHWA_DEVICE_PAIRING_CODE` (optional but recommended)

## Rotation plan

1. Create or rotate the control-plane publishable/secret keys and the per-database operational publishable/secret keys in Supabase.
2. Update local `.env.local` and Vercel project settings with the new values.
3. Redeploy Vercel.
4. Verify login, runtime ops, platform admin, and deferred billing flows.
5. Remove any old legacy global keys after validation.

## Git commands

```bash
git status
git checkout -b release/first-production
npm ci
npm run verify:release
npm run build
```

Then push a release branch and open a pull request after CI passes.

## Migration order

1. Apply Supabase migrations first.
2. Verify the latest shift and snapshot functions exist.
3. Deploy Vercel preview.
4. Smoke-test preview.
5. Promote to production.

See also: `docs/deployment/first-production-release-runbook.md`.
