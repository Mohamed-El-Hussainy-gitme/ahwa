begin;

alter table ops.owner_users
  alter column password_hash drop not null;

alter table ops.owner_users
  add column if not exists password_state text;

update ops.owner_users
set password_state = case
  when password_hash is null then 'setup_pending'
  else 'ready'
end
where password_state is null;

alter table ops.owner_users
  alter column password_state set default 'ready';

alter table ops.owner_users
  alter column password_state set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chk_ops_owner_users_password_state'
  ) then
    alter table ops.owner_users
      add constraint chk_ops_owner_users_password_state
      check (password_state in ('ready', 'setup_pending', 'reset_pending'));
  end if;
end;
$$;

create index if not exists idx_owner_users_cafe_password_state
  on ops.owner_users(cafe_id, password_state);

create or replace function public.ops_verify_owner_login(
  p_slug text,
  p_phone text,
  p_password text
)
returns table (
  cafe_id uuid,
  cafe_slug text,
  owner_user_id uuid,
  full_name text,
  owner_label text
)
language plpgsql
security definer
set search_path = public, ops
as $$
begin
  return query
  select
    c.id,
    c.slug,
    o.id,
    o.full_name,
    o.owner_label
  from ops.cafes c
  join ops.owner_users o
    on o.cafe_id = c.id
  where lower(btrim(c.slug)) = lower(btrim(p_slug))
    and c.is_active = true
    and o.is_active = true
    and o.password_state = 'ready'
    and o.password_hash is not null
    and btrim(o.phone) = btrim(p_phone)
    and extensions.crypt(p_password, o.password_hash) = o.password_hash
  limit 1;
end;
$$;

commit;
