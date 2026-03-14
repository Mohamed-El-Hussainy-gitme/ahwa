begin;

create extension if not exists pgcrypto;

create or replace function public.ops_bootstrap_cafe_owner(
  p_slug text,
  p_display_name text,
  p_owner_name text,
  p_owner_phone text,
  p_owner_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_cafe_id uuid;
  v_owner_id uuid;
begin
  if coalesce(trim(p_slug), '') = '' then
    raise exception 'slug_required';
  end if;
  if coalesce(trim(p_display_name), '') = '' then
    raise exception 'display_name_required';
  end if;
  if coalesce(trim(p_owner_name), '') = '' then
    raise exception 'owner_name_required';
  end if;
  if coalesce(trim(p_owner_phone), '') = '' then
    raise exception 'owner_phone_required';
  end if;
  if coalesce(trim(p_owner_password), '') = '' then
    raise exception 'owner_password_required';
  end if;

  insert into ops.cafes (slug, display_name)
  values (trim(lower(p_slug)), trim(p_display_name))
  returning id into v_cafe_id;

  insert into ops.owner_users (cafe_id, full_name, phone, password_hash)
  values (
    v_cafe_id,
    trim(p_owner_name),
    trim(p_owner_phone),
    extensions.crypt(p_owner_password, extensions.gen_salt('bf'))
  )
  returning id into v_owner_id;

  return jsonb_build_object(
    'cafe_id', v_cafe_id,
    'owner_user_id', v_owner_id,
    'slug', trim(lower(p_slug))
  );
end;
$$;

create or replace function public.ops_create_staff_member(
  p_cafe_id uuid,
  p_full_name text,
  p_pin text
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_staff_id uuid;
begin
  if p_cafe_id is null then
    raise exception 'cafe_id_required';
  end if;
  if coalesce(trim(p_full_name), '') = '' then
    raise exception 'full_name_required';
  end if;
  if coalesce(trim(p_pin), '') = '' then
    raise exception 'pin_required';
  end if;

  insert into ops.staff_members (cafe_id, full_name, pin_hash)
  values (
    p_cafe_id,
    trim(p_full_name),
    extensions.crypt(p_pin, extensions.gen_salt('bf'))
  )
  returning id into v_staff_id;

  return jsonb_build_object('staff_member_id', v_staff_id);
end;
$$;

create or replace function public.platform_create_super_admin_user(
  p_email text,
  p_display_name text,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, platform
as $$
declare
  v_email text;
  v_id uuid;
begin
  v_email := lower(nullif(btrim(p_email), ''));

  if v_email is null then
    raise exception 'p_email is required';
  end if;

  if nullif(btrim(p_display_name), '') is null then
    raise exception 'p_display_name is required';
  end if;

  if nullif(p_password, '') is null then
    raise exception 'p_password is required';
  end if;

  insert into platform.super_admin_users (
    email,
    display_name,
    password_hash
  )
  values (
    v_email,
    p_display_name,
    extensions.crypt(p_password, extensions.gen_salt('bf'))
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'super_admin_user_id', v_id,
    'email', v_email
  );
end;
$$;

create or replace function public.platform_create_cafe_with_owner(
  p_super_admin_user_id uuid,
  p_cafe_slug text,
  p_cafe_display_name text,
  p_owner_full_name text,
  p_owner_phone text,
  p_owner_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, platform
as $$
declare
  v_admin platform.super_admin_users%rowtype;
  v_cafe_id uuid;
  v_owner_id uuid;
  v_slug text;
begin
  select *
  into v_admin
  from platform.super_admin_users
  where id = p_super_admin_user_id
    and is_active = true;

  if not found then
    raise exception 'active super admin not found';
  end if;

  v_slug := lower(nullif(btrim(p_cafe_slug), ''));

  if v_slug is null then
    raise exception 'p_cafe_slug is required';
  end if;

  if nullif(btrim(p_cafe_display_name), '') is null then
    raise exception 'p_cafe_display_name is required';
  end if;

  if nullif(btrim(p_owner_full_name), '') is null then
    raise exception 'p_owner_full_name is required';
  end if;

  if nullif(btrim(p_owner_phone), '') is null then
    raise exception 'p_owner_phone is required';
  end if;

  if nullif(p_owner_password, '') is null then
    raise exception 'p_owner_password is required';
  end if;

  insert into ops.cafes (
    slug,
    display_name,
    is_active
  )
  values (
    v_slug,
    p_cafe_display_name,
    true
  )
  returning id into v_cafe_id;

  insert into ops.owner_users (
    cafe_id,
    full_name,
    phone,
    password_hash,
    is_active
  )
  values (
    v_cafe_id,
    p_owner_full_name,
    p_owner_phone,
    extensions.crypt(p_owner_password, extensions.gen_salt('bf')),
    true
  )
  returning id into v_owner_id;

  insert into ops.audit_events (
    cafe_id,
    actor_type,
    actor_label,
    event_code,
    entity_type,
    entity_id,
    payload
  )
  values (
    v_cafe_id,
    'super_admin',
    v_admin.email,
    'platform_create_cafe_with_owner',
    'cafe',
    v_cafe_id,
    jsonb_build_object(
      'owner_user_id', v_owner_id,
      'owner_phone', p_owner_phone
    )
  );

  return jsonb_build_object(
    'ok', true,
    'cafe_id', v_cafe_id,
    'owner_user_id', v_owner_id,
    'slug', v_slug
  );
end;
$$;

create or replace function public.platform_reset_owner_password(
  p_super_admin_user_id uuid,
  p_cafe_id uuid,
  p_owner_user_id uuid,
  p_new_password text
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

  if nullif(p_new_password, '') is null then
    raise exception 'p_new_password is required';
  end if;

  update ops.owner_users
  set password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf'))
  where cafe_id = p_cafe_id
    and id = p_owner_user_id;

  if not found then
    raise exception 'owner user not found';
  end if;

  insert into ops.audit_events (
    cafe_id,
    actor_type,
    actor_label,
    event_code,
    entity_type,
    entity_id,
    payload
  )
  values (
    p_cafe_id,
    'super_admin',
    v_admin.email,
    'platform_reset_owner_password',
    'owner_user',
    p_owner_user_id,
    jsonb_build_object('reset', true)
  );

  return jsonb_build_object(
    'ok', true,
    'owner_user_id', p_owner_user_id
  );
end;
$$;

drop function if exists public.platform_verify_super_admin_login(text, text);

create function public.platform_verify_super_admin_login(
  p_email text,
  p_password text
)
returns table (
  super_admin_user_id uuid,
  email text,
  display_name text
)
language sql
security definer
set search_path = public, platform, pg_catalog
as $$
  select
    u.id as super_admin_user_id,
    u.email,
    u.display_name
  from platform.super_admin_users u
  where lower(u.email) = lower(trim(p_email))
    and u.is_active = true
    and u.password_hash is not null
    and u.password_hash = extensions.crypt(p_password, u.password_hash)
  limit 1
$$;

create or replace function public.ops_create_staff_member_v2(
  p_cafe_id uuid,
  p_full_name text,
  p_pin text,
  p_employee_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_staff_id uuid;
  v_employee_code text;
begin
  if p_cafe_id is null then
    raise exception 'cafe_id_required';
  end if;

  if coalesce(trim(p_full_name), '') = '' then
    raise exception 'full_name_required';
  end if;

  if coalesce(trim(p_pin), '') = '' then
    raise exception 'pin_required';
  end if;

  v_employee_code := nullif(lower(btrim(p_employee_code)), '');

  insert into ops.staff_members (cafe_id, full_name, pin_hash, employee_code)
  values (
    p_cafe_id,
    trim(p_full_name),
    extensions.crypt(p_pin, extensions.gen_salt('bf')),
    v_employee_code
  )
  returning id into v_staff_id;

  return jsonb_build_object(
    'staff_member_id', v_staff_id,
    'employee_code', v_employee_code
  );
end;
$$;

create or replace function public.ops_set_staff_member_pin(
  p_cafe_id uuid,
  p_staff_member_id uuid,
  p_pin text
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
begin
  if p_cafe_id is null then
    raise exception 'cafe_id_required';
  end if;

  if p_staff_member_id is null then
    raise exception 'staff_member_id_required';
  end if;

  if coalesce(trim(p_pin), '') = '' then
    raise exception 'pin_required';
  end if;

  update ops.staff_members
  set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf'))
  where cafe_id = p_cafe_id
    and id = p_staff_member_id;

  if not found then
    raise exception 'staff_member_not_found';
  end if;

  return jsonb_build_object(
    'staff_member_id', p_staff_member_id,
    'ok', true
  );
end;
$$;

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
    'owner'::text
  from ops.cafes c
  join ops.owner_users o
    on o.cafe_id = c.id
  where lower(btrim(c.slug)) = lower(btrim(p_slug))
    and c.is_active = true
    and o.is_active = true
    and btrim(o.phone) = btrim(p_phone)
    and extensions.crypt(p_password, o.password_hash) = o.password_hash
  limit 1;
end;
$$;

create or replace function public.ops_verify_staff_pin_login(
  p_slug text,
  p_identifier text,
  p_pin text
)
returns table (
  cafe_id uuid,
  cafe_slug text,
  staff_member_id uuid,
  full_name text,
  employee_code text,
  shift_id uuid,
  shift_role text,
  login_state text
)
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_cafe_id uuid;
  v_cafe_slug text;
  v_staff ops.staff_members%rowtype;
  v_shift_id uuid;
  v_shift_role text;
begin
  select c.id, c.slug
  into v_cafe_id, v_cafe_slug
  from ops.cafes c
  where lower(btrim(c.slug)) = lower(btrim(p_slug))
    and c.is_active = true
  limit 1;

  if v_cafe_id is null then
    return;
  end if;

  select sm.*
  into v_staff
  from ops.staff_members sm
  where sm.cafe_id = v_cafe_id
    and sm.is_active = true
    and (
      lower(btrim(sm.full_name)) = lower(btrim(p_identifier))
      or lower(btrim(coalesce(sm.employee_code, ''))) = lower(btrim(p_identifier))
    )
    and extensions.crypt(p_pin, sm.pin_hash) = sm.pin_hash
  limit 1;

  if v_staff.id is null then
    return;
  end if;

  select s.id
  into v_shift_id
  from ops.shifts s
  where s.cafe_id = v_cafe_id
    and s.status = 'open'
  order by s.opened_at desc
  limit 1;

  if v_shift_id is null then
    return query
    select v_cafe_id, v_cafe_slug, v_staff.id, v_staff.full_name, v_staff.employee_code, null::uuid, null::text, 'no_shift'::text;
    return;
  end if;

  select sra.role_code
  into v_shift_role
  from ops.shift_role_assignments sra
  where sra.cafe_id = v_cafe_id
    and sra.shift_id = v_shift_id
    and sra.staff_member_id = v_staff.id
    and sra.is_active = true
  order by sra.assigned_at desc
  limit 1;

  if v_shift_role is null then
    return query
    select v_cafe_id, v_cafe_slug, v_staff.id, v_staff.full_name, v_staff.employee_code, v_shift_id, null::text, 'not_assigned'::text;
    return;
  end if;

  return query
  select v_cafe_id, v_cafe_slug, v_staff.id, v_staff.full_name, v_staff.employee_code, v_shift_id, v_shift_role, 'ok'::text;
end;
$$;

commit;
