begin;

create or replace function public.platform_verify_super_admin_login(
  p_email text,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, platform
as $$
declare
  v_user platform.super_admin_users%rowtype;
  v_email text;
begin
  v_email := lower(nullif(btrim(p_email), ''));

  if v_email is null then
    raise exception 'p_email is required';
  end if;

  if nullif(p_password, '') is null then
    raise exception 'p_password is required';
  end if;

  select *
  into v_user
  from platform.super_admin_users
  where email = v_email
    and is_active = true;

  if not found then
    raise exception 'BAD_CREDENTIALS';
  end if;

  if v_user.password_hash <> crypt(p_password, v_user.password_hash) then
    raise exception 'BAD_CREDENTIALS';
  end if;

  return jsonb_build_object(
    'ok', true,
    'super_admin_user_id', v_user.id,
    'email', v_user.email,
    'display_name', v_user.display_name
  );
end;
$$;

create or replace function public.platform_get_super_admin(
  p_super_admin_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, platform
as $$
declare
  v_user platform.super_admin_users%rowtype;
begin
  select *
  into v_user
  from platform.super_admin_users
  where id = p_super_admin_user_id
    and is_active = true;

  if not found then
    raise exception 'SUPER_ADMIN_NOT_FOUND';
  end if;

  return jsonb_build_object(
    'ok', true,
    'super_admin_user_id', v_user.id,
    'email', v_user.email,
    'display_name', v_user.display_name,
    'is_active', v_user.is_active,
    'created_at', v_user.created_at
  );
end;
$$;

create or replace function public.platform_list_owner_users(
  p_super_admin_user_id uuid,
  p_cafe_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, platform
as $$
declare
  v_admin platform.super_admin_users%rowtype;
begin
  select *
  into v_admin
  from platform.super_admin_users
  where id = p_super_admin_user_id
    and is_active = true;

  if not found then
    raise exception 'active super admin not found';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'owner_user_id', ou.id,
        'cafe_id', ou.cafe_id,
        'full_name', ou.full_name,
        'phone', ou.phone,
        'is_active', ou.is_active,
        'created_at', ou.created_at
      )
      order by ou.created_at desc
    )
    from ops.owner_users ou
    where ou.cafe_id = p_cafe_id
  ), '[]'::jsonb);
end;
$$;

commit;
