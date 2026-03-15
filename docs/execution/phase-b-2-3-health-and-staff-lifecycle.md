# Phase B — Health indicators + staff lifecycle

## Implemented
- Added an operational health panel inside the cafe surfaces using existing realtime + nav summary data.
- Added compact health visibility for sync state, delivery backlog, stalled sessions, and billing/deferred pressure.
- Added `employment_status` to staff members with canonical values: `active`, `inactive`, `left`.
- Added a new owner route to change staff lifecycle status.
- Kept `ops_set_staff_member_active(...)` as a compatibility wrapper while making lifecycle the source of truth.
- Hardened staff login and shift assignment so only `active` staff can log in or be assigned.

## Notes
- No schema change was needed for health indicators.
- Staff lifecycle was introduced via a new reconciliation migration only (`0024_*`).
