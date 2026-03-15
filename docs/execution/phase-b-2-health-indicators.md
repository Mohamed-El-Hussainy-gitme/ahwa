# Phase B.2 — Health indicators inside the cafe

## Implemented
- Added a compact operational health panel on the cafe dashboard.
- Added the same panel on the owner page for quick review.
- Reused existing realtime state and nav summary data instead of creating a new domain model.
- Health visibility now highlights:
  - sync state
  - delivery backlog
  - stalled sessions
  - billing/deferred pressure

## Scope
- No schema change.
- No migration required.
- No runtime workflow change.
