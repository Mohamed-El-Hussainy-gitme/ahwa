-- Operational-only migration.
-- Add branch_manager as a valid ops.owner_users label.

begin;

alter table if exists ops.owner_users
  drop constraint if exists chk_ops_owner_users_owner_label;

alter table if exists ops.owner_users
  add constraint chk_ops_owner_users_owner_label
  check (owner_label in ('owner', 'partner', 'branch_manager'));

create index if not exists idx_owner_users_cafe_owner_label
  on ops.owner_users(cafe_id, owner_label);

commit;
