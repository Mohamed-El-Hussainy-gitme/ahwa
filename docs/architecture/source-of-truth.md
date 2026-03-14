# Source of truth

## Canonical stack

- PostgreSQL / Supabase database is the source of truth
- `ops.*` holds daily runtime truth
- `platform.*` holds platform admin truth
- `apps/web` now owns the active server routes for:
  - platform admin
  - runtime login/device activation
  - owner shift/staff management
  - ops commands and workspaces
  - realtime SSE fan-out
- `packages/shared` keeps only the shared contracts and validation still relevant to the active tree

## Runtime model

The canonical runtime is now:

`shift -> service_session -> order -> order_item -> fulfillment -> payment / deferred_ledger -> shift_snapshot`

The repository no longer treats the following as canonical runtime entities:

- tables
- table sessions
- bill accounts
- deferred accounts as a separate runtime container

## Query/command split

- Commands mutate `ops` state through explicit actions
- Workspaces read lightweight snapshots from `ops`
- UI must not reconstruct daily truth from multiple legacy endpoints
- Runtime auth/session resolution now stays inside the active web server routes rather than a separate legacy API package
