begin;

create extension if not exists pgcrypto;

alter table ops.staff_members
  add column if not exists employee_code text;

alter table ops.staff_members
  drop constraint if exists ck_staff_members_employee_code_nonempty;

alter table ops.staff_members
  add constraint ck_staff_members_employee_code_nonempty
  check (employee_code is null or nullif(btrim(employee_code), '') is not null);

create unique index if not exists uq_ops_staff_members_employee_code
  on ops.staff_members(cafe_id, lower(btrim(employee_code)))
  where employee_code is not null;

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
    crypt(p_pin, gen_salt('bf')),
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
  set pin_hash = crypt(p_pin, gen_salt('bf'))
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

create or replace function public.ops_set_staff_member_active(
  p_cafe_id uuid,
  p_staff_member_id uuid,
  p_is_active boolean
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

  update ops.staff_members
  set is_active = coalesce(p_is_active, false)
  where cafe_id = p_cafe_id
    and id = p_staff_member_id;

  if not found then
    raise exception 'staff_member_not_found';
  end if;

  return jsonb_build_object(
    'staff_member_id', p_staff_member_id,
    'is_active', coalesce(p_is_active, false)
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
    and crypt(p_password, o.password_hash) = o.password_hash
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
    and crypt(p_pin, sm.pin_hash) = sm.pin_hash
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
