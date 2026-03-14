# Phase 7 - docs canon

## Goal

Freeze the documentation reference on the modern runtime and stop legacy runtime vocabulary from being treated as current truth.

## What was updated

- `README.md`
- `docs/architecture/source-of-truth.md`
- `docs/domain/glossary.md`
- `docs/domain/invariants.md`
- `docs/domain/state-machines.md`
- `docs/domain/canonical-runtime-reference.md`
- `database/README.md`
- `docs/execution/project-status-1-to-1.md`

## Canonical documentation rule

When docs conflict with code, use this order:

1. `database/migrations/`
2. `apps/web/src/`
3. `docs/domain/canonical-runtime-reference.md`
4. the rest of the updated domain/database docs

Historical phase notes remain archival and should not be used as the main runtime reference.
