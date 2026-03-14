# Phase 15 — Deduplication and source-of-truth cleanup

## What changed

- Removed duplicate legacy Next.js app files from the repository root.
- Archived the old root-level web prototype into `legacy/root-web-v1-reference/`.
- Promoted `apps/web` as the only canonical web source tree.
- Kept `database/migrations` as the canonical schema source and `database/sql-editor` as execution copies.
- Removed checked-in runtime env files and now keep only app-scoped `.env.example` templates in the repo.
- Added Vercel project configuration for both `apps/web` and `apps/api`.
- Added a Vercel function entrypoint for `apps/api`.

## Canonical structure after cleanup

- `apps/web`
- `apps/api`
- `packages/shared`
- `database`
- `docs`
- `legacy`

## Remaining work

Some `apps/web` runtime screens still import `memoryRepos`. These screens remain functional as legacy UI but are not yet the final canonical runtime workflow implementation. The canonical backend workflow remains in `apps/api`.
