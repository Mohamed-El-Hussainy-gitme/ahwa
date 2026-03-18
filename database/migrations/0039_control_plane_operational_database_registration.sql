begin;

create or replace function public.control_register_operational_database(
  p_super_admin_user_id uuid,
  p_database_key text,
  p_display_name text default null,
  p_description text default null,
  p_is_active boolean default true,
  p_is_accepting_new_cafes boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, control, platform
as $$
declare
  v_admin platform.super_admin_users%rowtype;
  v_database control.operational_databases%rowtype;
  v_database_key text := lower(nullif(btrim(p_database_key), ''));
  v_display_name text;
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
begin
  select *
  into v_admin
  from platform.super_admin_users
  where id = p_super_admin_user_id
    and is_active = true;

  if not found then
    raise exception 'active super admin not found';
  end if;

  if v_database_key is null then
    raise exception 'p_database_key is required';
  end if;

  v_display_name := coalesce(nullif(btrim(p_display_name), ''), v_database_key);

  insert into control.operational_databases (
    database_key,
    display_name,
    description,
    is_active,
    is_accepting_new_cafes,
    created_at,
    updated_at
  )
  values (
    v_database_key,
    v_display_name,
    v_description,
    coalesce(p_is_active, true),
    coalesce(p_is_accepting_new_cafes, true),
    now(),
    now()
  )
  on conflict (database_key)
  do update set display_name = excluded.display_name,
                description = excluded.description,
                is_active = excluded.is_active,
                is_accepting_new_cafes = excluded.is_accepting_new_cafes,
                updated_at = now()
  returning * into v_database;

  return jsonb_build_object(
    'ok', true,
    'database_key', v_database.database_key,
    'display_name', coalesce(nullif(btrim(v_database.display_name), ''), v_database.database_key),
    'description', v_database.description,
    'is_active', v_database.is_active,
    'is_accepting_new_cafes', v_database.is_accepting_new_cafes,
    'created_at', v_database.created_at,
    'updated_at', v_database.updated_at
  );
end;
$$;

commit;
