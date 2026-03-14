# Phase 3 — Monorepo and Codebase Restructure

This phase turns the original single Next.js application into a monorepo-oriented
workspace so the project can evolve into a backend-driven SaaS system.

## What changed

- The former web application now lives under `apps/web`.
- A new backend scaffold now exists under `apps/api`.
- Shared contracts and validation utilities now live under `packages/shared`.
- `database/`, `docs/`, and `legacy/` stay at the workspace root.

## Why this restructure matters

The old layout mixed UI, runtime business logic, direct persistence access,
and legacy memory repositories inside one app. That structure is not suitable for
shift/session/account centric runtime logic.

The new structure gives us clear boundaries:

- `apps/web`: UI, presentation, Next.js routing, temporary legacy screens.
- `apps/api`: future source of truth for runtime business logic.
- `packages/shared`: cross-package contracts and validation helpers.
- `database`: migration and seed source of truth.

## Important note

Legacy runtime code still exists inside `apps/web/src` for now. This is deliberate.
It allows later phases to migrate behavior incrementally without breaking the current
reference implementation.

## Next migration targets after this phase

1. Move auth and device-gate behavior into `apps/api`.
2. Move shift/session/account workflows into `apps/api`.
3. Convert `apps/web` to consume HTTP contracts instead of local memory repos.
4. Remove legacy `invoice`-centric flows from the web package.
