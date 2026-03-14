# Build stabilization phase

## Goal

Make the workspace runnable from the root with:

- `npm run build`
- `npm run dev`

## What was stabilized

### Root workspace scripts

The root workspace provides:

- `build`
- `dev`
- `typecheck`

### API bootstrap

`apps/api/src/main.ts` boots directly from `createApp()`.
The remaining live API slice is now limited to runtime auth, device gate, shifts, and staff management.

### Web TypeScript stabilization

`apps/web` resolves `@/*` from the app root and runs with app-scoped env files.

## Current note

Older references to `canonical-runtime` from early stabilization work are no longer part of the active tree after phase 20 cleanup.
