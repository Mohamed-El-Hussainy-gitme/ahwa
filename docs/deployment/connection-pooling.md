# Connection reuse and pooling

This app talks to Supabase through `@supabase/supabase-js` (HTTP/PostgREST), not through direct `pg` database sockets.

## What is implemented now

- Reuse a singleton server-side admin client in `apps/web/src/lib/supabase/admin.ts`
- Reuse a singleton browser client in `apps/web/src/lib/supabase/browser.ts`
- Keep HTTP keep-alive explicitly enabled in `apps/web/next.config.ts`

## Why this matters

With 100 cafes on one database, the hot path should avoid unnecessary client setup and repeated short-lived outbound HTTP handshakes.

## Important note

This is not a manual PostgreSQL pool. The actual database pooling is handled upstream by Supabase.

If the project later introduces direct PostgreSQL access (`pg`, Prisma, Drizzle, workers, or background jobs), route those connections through the provider's transaction/session pooler instead of opening raw database sockets from each runtime instance.
