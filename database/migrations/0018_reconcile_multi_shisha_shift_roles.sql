begin;

set local search_path = public, ops;

-- =========================================================
-- 0018_reconcile_multi_shisha_shift_roles.sql
--
-- الهدف:
-- 1) إزالة فرض singleton عن دور الشيشة داخل نفس الوردية
-- 2) الإبقاء على singleton فقط للمشرف والباريستا
-- 3) إعادة تعريف public.ops_assign_shift_role بشكل canonical
--    حتى لا يعطل أي شيشة مان سابق عند تعيين شيشة مان جديد
-- =========================================================

-- ---------------------------------------------------------
-- 1) إزالة القيد القديم المتعارض ثم إعادة إنشائه بالحالة النهائية
-- ---------------------------------------------------------
drop index if exists ops.uq_shift_role_active_singleton;

create unique index if not exists uq_shift_role_active_singleton
  on ops.shift_role_assignments(cafe_id, shift_id, role_code)
  where is_active = true
    and role_code in ('supervisor', 'barista');

-- ---------------------------------------------------------
-- 2) إعادة تعريف تعيين الأدوار بحيث لا يبطل الشيشة الموجودين
-- ---------------------------------------------------------
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
