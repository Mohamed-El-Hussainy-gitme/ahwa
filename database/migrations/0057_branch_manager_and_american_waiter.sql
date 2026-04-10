-- Deprecated mixed migration kept as a no-op for compatibility.
--
-- This file previously mixed operational schema changes with control-plane
-- platform function changes. That caused failures on operational-only
-- databases that do not contain the `platform` schema.
--
-- Replacement migrations:
--   0061_operational_branch_manager_owner_label.sql
--   0062_control_plane_branch_manager_owner_functions.sql
--
-- Apply 0061 on operational databases.
-- Apply 0062 on the control-plane database only.

begin;
commit;
