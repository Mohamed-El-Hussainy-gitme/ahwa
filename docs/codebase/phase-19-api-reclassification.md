# Phase 19 - apps/api reclassification

## Goal

Reduce `apps/api` to the runtime backend slice that is still live after the ops migration.

## Kept

- device gate
- identity
- shift management
- staff management

## Removed

- platform-super-admin
- menu
- session-management
- ordering
- fulfillment
- billing
- deferred-ledger
- reporting
- audit
- platform auth helper

## Outcome

`apps/api` is no longer a mixed legacy backend. It now holds only the authenticated runtime paths that are still consumed by the web shell.
