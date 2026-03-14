# Phase 4 - auth & device gate

## Scope completed

This phase moved the first real runtime business logic from the legacy web app into `apps/api`.

Implemented backend responsibilities:

- cafe gate resolution by slug
- one-time device activation by pairing code
- active device lookup by device token
- owner / partner login
- employee PIN login inside the active device gate
- runtime session lookup
- logout for runtime sessions

## Route summary

### Device gate
- `POST /device-gate/resolve`
- `POST /device-gate/activate`
- `GET /device-gate/current`

### Auth
- `POST /auth/owner/login`
- `POST /auth/employee/pin-login`
- `POST /auth/logout`
- `GET /runtime/me`

## Current note

Platform admin authentication later moved to the canonical web path under `apps/web/src/app/api/platform/*`, so `apps/api` no longer owns a platform login route.
