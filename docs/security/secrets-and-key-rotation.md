# Secrets and key rotation

## What changed in this repository

- `apps/web/.env.local` is intentionally removed from the tracked project copy.
- The app now supports both:
  - modern Supabase keys (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`)
  - legacy fallback keys (`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`)
- CI is added under `.github/workflows/ci.yml`.

## What must still be done outside the repository

Supabase key rotation is not performed by editing `.env` files alone.
You must rotate or create the keys in the Supabase project itself, then place the new values into:

- local `apps/web/.env.local`
- Vercel project environment variables

## Minimum production secret set

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `AHWA_SESSION_SECRET`
- `AHWA_INSTALL_TOKEN`
- `AHWA_DEVICE_PAIRING_CODE`

## App secret generation

Generate unique values per environment for the Ahwa app secrets, for example with OpenSSL:

```bash
openssl rand -base64 48
```

Use different values for:
- local development
- preview
- production
