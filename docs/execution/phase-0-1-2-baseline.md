# Phase 0 / 1 / 2 baseline

## Canonical baseline frozen for execution

The current execution baseline is frozen on these sources only:

- `database/migrations`
- `apps/web/src`

Everything else is informational until the docs canon phase is finished.

## Server-side authorization baseline

Sensitive operations are now guarded on the server before any privileged mutation or workspace read.

### Owner only

- owner shift open / close
- staff create / activate / pin reset
- menu workspace
- menu section create / update / delete / toggle / reorder
- menu product create / update / delete / toggle / reorder

### Owner or supervisor

- dashboard workspace
- reports workspace
- shift state / history / snapshot preview
- billing workspace and settlement / defer flow
- deferred ledger read / balance / repayment / manual debt entry

### Orders and delivery

- waiter workspace / ready list / open session / create order:
  - owner
  - supervisor
  - waiter
  - shisha
- delivery:
  - owner
  - supervisor
  - waiter
  - shisha

### Station access

- barista station workspace / ready actions:
  - owner
  - supervisor
  - barista
- shisha station workspace / ready actions:
  - owner
  - supervisor
  - shisha

### Complaints flow (current baseline before redesign)

- complaints workspace / create / resolve:
  - owner
  - supervisor
  - waiter
  - shisha

## Shift-role baseline

Shift role assignments are now canonical with this rule:

- `supervisor`: singleton per shift
- `barista`: singleton per shift
- `waiter`: multi-assignment per shift
- `shisha`: multi-assignment per shift

The database reconciliation for this baseline is implemented in:

- `database/migrations/0018_reconcile_multi_shisha_shift_roles.sql`
