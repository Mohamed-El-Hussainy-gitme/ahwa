# Runtime Operational Route Migration — Phase 4

Phase 4 completes the **server-side migration of cafe operational routes** so core runtime reads and mutations no longer assume one shared operational admin client.

## What changed

- `requireOpsActorContext()` now verifies the active runtime route and attaches `databaseKey` to the actor context.
- Core operational server builders now select the admin ops client through `adminOpsForCafeId(cafeId)`.
- Menu, deferred, billing, reports, workstation, and queue reads now route through the cafe binding instead of a global `supabaseAdmin().schema('ops')` assumption.

## Current contract

- Cafe runtime requests must always resolve to one `database_key`.
- A runtime session with a route mismatch is rejected as `INVALID_OPERATIONAL_ROUTE`.
- The active reference still falls back to the single default operational database until additional operational DB env mappings are configured.
