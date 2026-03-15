begin;

set local search_path = public, ops;

alter table ops.staff_members
  add column if not exists employment_status text;

update ops.staff_members
set employment_status = case when is_active then 'active' else 'inactive' end
where employment_status is null
   or btrim(employment_status) = '';

alter table ops.staff_members
  drop constraint if exists ck_staff_members_employment_status;

alter table ops.staff_members
  add constraint ck_staff_members_employment_status
  check (employment_status in ('active', 'inactive', 'left'));

alter table ops.staff_members
  alter column employment_status set default 'active';

alter table ops.staff_members
  alter column employment_status set not null;

update ops.staff_members
set is_active = (employment_status = 'active')
where is_active is distinct from (employment_status = 'active');

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

  insert into ops.staff_members (
    cafe_id,
    full_name,
    pin_hash,
    employee_code,
    is_active,
    employment_status
  )
  values (
    p_cafe_id,
    trim(p_full_name),
    extensions.crypt(p_pin, extensions.gen_salt('bf')),
    v_employee_code,
    true,
    'active'
  )
  returning id into v_staff_id;

  return jsonb_build_object(
    'staff_member_id', v_staff_id,
    'employee_code', v_employee_code,
    'employment_status', 'active'
  );
end;
$$;

create or replace function public.ops_set_staff_member_status(
  p_cafe_id uuid,
  p_staff_member_id uuid,
  p_employment_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_normalized_status text;
  v_is_active boolean;
begin
  if p_cafe_id is null then
    raise exception 'cafe_id_required';
  end if;

  if p_staff_member_id is null then
    raise exception 'staff_member_id_required';
  end if;

  v_normalized_status := lower(btrim(coalesce(p_employment_status, '')));
  if v_normalized_status not in ('active', 'inactive', 'left') then
    raise exception 'invalid_employment_status';
  end if;

  v_is_active := v_normalized_status = 'active';

  update ops.staff_members
  set employment_status = v_normalized_status,
      is_active = v_is_active
  where cafe_id = p_cafe_id
    and id = p_staff_member_id;

  if not found then
    raise exception 'staff_member_not_found';
  end if;

  return jsonb_build_object(
    'staff_member_id', p_staff_member_id,
    'employment_status', v_normalized_status,
    'is_active', v_is_active
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
  return public.ops_set_staff_member_status(
    p_cafe_id,
    p_staff_member_id,
    case when coalesce(p_is_active, false) then 'active' else 'inactive' end
  );
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
    and sm.employment_status = 'active'
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

create or replace function public.ops_assign_shift_role(
  p_cafe_id uuid,
  p_shift_id uuid,
  p_role_code text,
  p_staff_member_id uuid default null,
  p_owner_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_assignment_id uuid;
  v_existing_id uuid;
  v_staff_is_active boolean;
begin
  if p_cafe_id is null then
    raise exception 'cafe_id_required';
  end if;

  if p_shift_id is null then
    raise exception 'shift_id_required';
  end if;

  if p_role_code not in ('supervisor', 'waiter', 'barista', 'shisha') then
    raise exception 'invalid_role_code';
  end if;

  if (p_staff_member_id is null and p_owner_user_id is null)
     or (p_staff_member_id is not null and p_owner_user_id is not null) then
    raise exception 'exactly_one_actor_required';
  end if;

  if p_staff_member_id is not null then
    select exists (
      select 1
      from ops.staff_members sm
      where sm.cafe_id = p_cafe_id
        and sm.id = p_staff_member_id
        and sm.is_active = true
        and sm.employment_status = 'active'
    ) into v_staff_is_active;

    if not coalesce(v_staff_is_active, false) then
      raise exception 'staff_member_not_active';
    end if;
  end if;

  select sra.id
  into v_existing_id
  from ops.shift_role_assignments sra
  where sra.cafe_id = p_cafe_id
    and sra.shift_id = p_shift_id
    and sra.role_code = p_role_code
    and sra.is_active = true
    and sra.staff_member_id is not distinct from p_staff_member_id
    and sra.owner_user_id is not distinct from p_owner_user_id
  limit 1;

  if v_existing_id is not null then
    return jsonb_build_object(
      'assignment_id', v_existing_id,
      'role_code', p_role_code,
      'reused', true
    );
  end if;

  if p_role_code in ('supervisor', 'barista') then
    update ops.shift_role_assignments
    set is_active = false
    where cafe_id = p_cafe_id
      and shift_id = p_shift_id
      and role_code = p_role_code
      and is_active = true;
  end if;

  insert into ops.shift_role_assignments (
    cafe_id,
    shift_id,
    role_code,
    staff_member_id,
    owner_user_id,
    is_active
  )
  values (
    p_cafe_id,
    p_shift_id,
    p_role_code,
    p_staff_member_id,
    p_owner_user_id,
    true
  )
  returning id into v_assignment_id;

  return jsonb_build_object(
    'assignment_id', v_assignment_id,
    'role_code', p_role_code,
    'reused', false
  );
end;
$$;

commit;
