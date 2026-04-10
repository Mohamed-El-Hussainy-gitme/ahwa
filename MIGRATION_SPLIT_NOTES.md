# Migration split notes

This package fixes the old mixed migration that failed on operational-only databases.

## What changed

- `0057_branch_manager_and_american_waiter.sql` is now a no-op placeholder.
- `0061_operational_branch_manager_owner_label.sql` contains the operational-only owner label change.
- `0062_control_plane_branch_manager_owner_functions.sql` contains the control-plane-only platform function changes.

## Apply order

### Operational databases (db01 / db02 / db03)
- Apply `0060_owner_management_and_shift_role_expansion.sql`
- Apply `0061_operational_branch_manager_owner_label.sql` only if the branch manager owner label is not already present

### Control-plane database only
- Apply `0062_control_plane_branch_manager_owner_functions.sql`

## Important

Do not run `0062_control_plane_branch_manager_owner_functions.sql` on an operational-only database.
