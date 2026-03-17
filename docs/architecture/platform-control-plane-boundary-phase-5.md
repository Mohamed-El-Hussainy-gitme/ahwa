# Platform Control Plane Boundary — Phase 5

Phase 5 hardens the boundary between **cafe operational traffic** and **platform control-plane traffic**.

## Canonical split

- Cafe runtime flows use operational database routing.
- Platform admin flows use the control-plane admin client.
- Platform APIs must not depend on the operational admin client implementation.

## What changed

- `apps/web/src/lib/control-plane/admin.ts` defines the control-plane admin client.
- Platform API routes and control-plane resolvers now call `controlPlaneAdmin()` instead of the generic default Supabase admin helper.
- Separate control-plane env mapping is supported through:
  - `CONTROL_PLANE_SUPABASE_URL`
  - `CONTROL_PLANE_SUPABASE_PUBLISHABLE_KEY`
  - `CONTROL_PLANE_SUPABASE_SECRET_KEY` / `CONTROL_PLANE_SUPABASE_SERVICE_ROLE_KEY`

## Why this matters

This keeps platform-wide reads and writes centralized even before the system begins serving cafes from multiple operational databases.
