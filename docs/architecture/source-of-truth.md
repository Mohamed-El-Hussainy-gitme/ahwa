# Source of truth

## Canonical order

When there is any conflict, read the project in this order:

1. `database/migrations/`
2. `apps/web/src/`
3. `docs/domain/canonical-runtime-reference.md`
4. `docs/domain/glossary.md`
5. `docs/domain/invariants.md`
6. `docs/domain/state-machines.md`
7. `database/README.md`

Anything under `docs/codebase/` or older execution notes is historical implementation context only.

## Canonical stack

- PostgreSQL / Supabase database is the source of truth
- `ops.*` holds daily runtime truth
- `platform.*` holds platform admin truth
- `apps/web` owns the active server routes for:
  - platform admin
  - runtime login and device activation
  - owner shift and staff management
  - ops commands and workspaces
  - realtime SSE fan-out
- `packages/shared` keeps only the shared contracts and validation still relevant to the active tree

## Canonical runtime model

The canonical runtime is:

`shift -> service_session -> order -> order_item -> fulfillment -> payment / deferred_ledger -> shift_snapshot`

The repository no longer treats the following as canonical runtime entities:

- tables
- table sessions
- bill accounts
- deferred accounts as a separate runtime container

## Canonical complaint model

The canonical issue model is now split into two tracks:

- `ops.complaints`: general complaints that are not the action record for a specific item
- `ops.order_item_issues`: item-linked notes and action reasons such as remake, waive, cancel, and item-specific quality notes

This split is part of the canonical runtime and must be reflected in any new work.

## Canonical report model

- Open shift reporting is live
- Closed shift reporting is snapshot-based from `ops.shift_snapshots`
- Day/week/month/year reporting is built from closed snapshots, with the current open shift merged in only when needed for live views

## Canonical platform model

The super admin surface is administrative only. It should expose:

- activation status
- owners / partners
- subscription status and countdown
- last activity
- database usage and high-level health indicators

It should not expose per-cafe operational sales intelligence or detailed runtime internals unless a future policy explicitly redefines that boundary.
