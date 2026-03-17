# Platform response hardening

This patch hardens the platform control-plane read path after the strict multi-db cutover.

## Goals

- Keep the cafes register visible even when optional aggregates such as `owners` come back as `null`.
- Normalize platform payloads before rendering so one malformed row cannot blank the entire screen.
- Preserve underlying PostgREST messages/details in platform API errors instead of collapsing them to `REQUEST_FAILED`.

## Scope

- `apps/web/src/lib/platform-data.ts` provides tolerant normalizers for cafe list rows and operational database options.
- `apps/web/src/app/api/platform/cafes/list/route.ts` now emits normalized cafe rows with stable array fields.
- `apps/web/src/app/platform/cafes/PlatformCafesPageClient.tsx` and `apps/web/src/app/platform/PlatformDashboardClient.tsx` consume normalized rows instead of all-or-nothing shape guards.
- `database/migrations/0036_platform_response_hardening.sql` makes `platform_list_cafes()` return `owners = []` instead of `null`.

## Operational note

Apply migration `0036_platform_response_hardening.sql` before relying on the platform cafes register in production. The app-side normalizers protect rendering immediately, while the migration removes the shape drift at the database source.
