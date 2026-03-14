# Phase 2 database rebuild

The database rebuild established the `ops` schema as the operational source of truth.

## Canonical entities

- cafes
- owner_users
- staff_members
- menu_sections
- menu_products
- shifts
- shift_role_assignments
- service_sessions
- orders
- order_items
- fulfillment_events
- payments
- payment_allocations
- deferred_ledger_entries
- shift_snapshots
- audit_events

## Canonical runtime chain

`shift -> service_session -> order -> order_item -> fulfillment -> payment/deferred_ledger -> shift_snapshot`

## Non-canonical legacy concepts

The rebuild explicitly retired these as daily runtime primitives:

- tables
- table sessions
- bill accounts
