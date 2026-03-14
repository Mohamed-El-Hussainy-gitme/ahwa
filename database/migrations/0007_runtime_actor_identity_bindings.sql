alter table ops.owner_users
  add column if not exists legacy_app_user_id uuid;

create unique index if not exists uq_ops_owner_users_legacy_app_user_id
  on ops.owner_users(legacy_app_user_id)
  where legacy_app_user_id is not null;

alter table ops.staff_members
  add column if not exists legacy_app_user_id uuid;

create unique index if not exists uq_ops_staff_members_legacy_app_user_id
  on ops.staff_members(legacy_app_user_id)
  where legacy_app_user_id is not null;
