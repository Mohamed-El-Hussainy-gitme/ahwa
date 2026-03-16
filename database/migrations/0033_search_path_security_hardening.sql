begin;

create or replace function app.current_cafe_id()
returns uuid
language sql
stable
set search_path = pg_catalog
as $$
  select nullif(
    coalesce(
      pg_catalog.current_setting('app.current_cafe_id', true),
      pg_catalog.current_setting('app.current_tenant_id', true)
    ),
    ''
  )::uuid
$$;

create or replace function app.current_super_admin_user_id()
returns uuid
language sql
stable
set search_path = pg_catalog
as $$
  select nullif(pg_catalog.current_setting('platform.current_super_admin_user_id', true), '')::uuid
$$;

create or replace function ops.generate_session_label()
returns text
language sql
set search_path = pg_catalog
as $$
  select 'S-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(public.gen_random_uuid()::text, '-', ''), 1, 6));
$$;

create or replace function public.platform_touch_support_message()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := pg_catalog.now();
  if new.status = 'closed' and old.status is distinct from 'closed' then
    new.closed_at := pg_catalog.now();
  elsif new.status <> 'closed' then
    new.closed_at := null;
  end if;
  return new;
end;
$$;

commit;
