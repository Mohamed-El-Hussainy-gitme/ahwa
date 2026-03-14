# First production release runbook

## 1) Clean local branch

```bash
git status
git checkout -b release/first-production
npm ci
npm run verify:release
npm run build:shared
npm run typecheck:web
npm run lint:web
npm run build:web
```

## 2) Prepare Supabase first

Apply all migrations in `database/migrations/` to the target production project before Vercel deploy.

Recommended order:

1. link the production Supabase project
2. push all pending migrations
3. verify key functions exist:
   - `ops_open_shift`
   - `ops_reopen_shift`
   - `ops_close_shift`
   - `ops_build_shift_snapshot`
4. verify the latest constraints exist on `ops.shifts`

If you use the Supabase CLI, the flow is:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Then verify quickly in SQL:

```sql
select proname
from pg_proc
where proname in (
  'ops_open_shift',
  'ops_reopen_shift',
  'ops_close_shift',
  'ops_build_shift_snapshot'
)
order by proname;
```

## 3) Rotate secrets before first public deploy

Create fresh values for:

- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
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

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `AHWA_SESSION_SECRET`
- `AHWA_INSTALL_TOKEN`
- `AHWA_DEVICE_PAIRING_CODE`

If you prefer the CLI:

```bash
vercel link
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
vercel env add SUPABASE_SECRET_KEY
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

1. platform admin login
2. owner login
3. staff login
4. open shift
5. open session
6. create order
7. ready -> deliver
8. settle cash
9. create deferred debt and repay
10. close shift and inspect snapshot

## 7) Promote to production

After preview validation and migration confirmation:

```bash
git checkout main
git pull --ff-only
git merge --ff-only release/first-production
git push origin main
```

Then trigger or approve the Vercel production deployment.

## 8) Post-deploy checks

In production, re-test:

- `/platform/login`
- `/owner/login`
- `/staff/login`
- `/shift`
- `/reports`
- `/complaints`
- `/customers`

Also verify:

- no duplicate shift opens for the same business date
- reopen shift works on the same row
- shift snapshot includes complaints
- menu page works end to end

## 9) Rollback rule

If production deploy is healthy but migrations are wrong, fix forward in SQL.
If application deploy is wrong but database is correct, rollback the Vercel deployment to the last healthy build.
Never restore an older app build that assumes older database invariants without checking the migrations first.
