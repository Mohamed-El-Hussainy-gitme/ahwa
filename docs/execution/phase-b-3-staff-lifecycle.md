# Phase B.3 — Staff lifecycle

## Implemented
- Added canonical staff lifecycle states:
  - active
  - inactive
  - left
- Added a reconciliation migration (`0024_*`) to backfill existing staff and keep `is_active` aligned.
- Added owner API support for direct lifecycle changes.
- Updated staff management UI with lifecycle filters and actions.
- Updated shift assignment filtering so only active staff appear for assignment.
- Hardened staff login and shift assignment at the database function level.

## Compatibility
- `ops_set_staff_member_active(...)` remains available as a wrapper for compatibility.
- Historical staff data remains intact.
