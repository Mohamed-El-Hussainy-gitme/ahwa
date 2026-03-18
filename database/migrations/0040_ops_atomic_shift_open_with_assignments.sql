begin;

create or replace function public.ops_open_shift_with_assignments(
  p_cafe_id uuid,
  p_shift_kind text,
  p_business_date date,
  p_opened_by_owner_id uuid,
  p_notes text default null,
  p_assignments jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_shift_payload jsonb;
  v_shift_id uuid;
  v_mode text;
  v_assignments jsonb := coalesce(p_assignments, '[]'::jsonb);
  v_item jsonb;
  v_role text;
  v_actor_type text;
  v_staff_member_id uuid;
  v_owner_user_id uuid;
  v_existing_assignment_id uuid;
  v_supervisor_count integer := 0;
  v_barista_count integer := 0;
  v_assignment_keys text[] := array[]::text[];
  v_assignment_key text;
begin
  if p_cafe_id is null then
    raise exception 'cafe_id_required';
  end if;

  if p_shift_kind not in ('morning', 'evening') then
    raise exception 'invalid_shift_kind';
  end if;

  if p_business_date is null then
    raise exception 'business_date_required';
  end if;

  if p_opened_by_owner_id is null then
    raise exception 'opened_by_owner_id_required';
  end if;

  if jsonb_typeof(v_assignments) <> 'array' then
    raise exception 'assignments_must_be_array';
  end if;

  if not exists (
    select 1
    from ops.owner_users ou
    where ou.cafe_id = p_cafe_id
      and ou.id = p_opened_by_owner_id
      and ou.is_active = true
  ) then
    raise exception 'opened_by_owner_not_active';
  end if;

  for v_item in select value from jsonb_array_elements(v_assignments)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'invalid_assignment_payload';
    end if;

    v_role := lower(nullif(btrim(v_item->>'role'), ''));
    v_actor_type := lower(coalesce(nullif(btrim(v_item->>'actorType'), ''), 'staff'));

    if v_role not in ('supervisor', 'waiter', 'barista', 'shisha') then
      raise exception 'invalid_role_code';
    end if;

    v_staff_member_id := nullif(
      btrim(
        coalesce(
          v_item->>'staff_member_id',
          case when v_actor_type = 'staff' then v_item->>'userId' else null end,
          ''
        )
      ),
      ''
    )::uuid;
    v_owner_user_id := nullif(
      btrim(
        coalesce(
          v_item->>'owner_user_id',
          case when v_actor_type = 'owner' then v_item->>'userId' else null end,
          ''
        )
      ),
      ''
    )::uuid;

    if (v_staff_member_id is null and v_owner_user_id is null)
      or (v_staff_member_id is not null and v_owner_user_id is not null) then
      raise exception 'exactly_one_actor_required';
    end if;

    if v_staff_member_id is not null then
      if not exists (
        select 1
        from ops.staff_members sm
        where sm.cafe_id = p_cafe_id
          and sm.id = v_staff_member_id
          and sm.is_active = true
          and sm.employment_status = 'active'
      ) then
        raise exception 'staff_member_not_active';
      end if;
    end if;

    if v_owner_user_id is not null then
      if not exists (
        select 1
        from ops.owner_users ou
        where ou.cafe_id = p_cafe_id
          and ou.id = v_owner_user_id
          and ou.is_active = true
      ) then
        raise exception 'owner_user_not_active';
      end if;
    end if;

    if v_role = 'supervisor' then
      v_supervisor_count := v_supervisor_count + 1;
    elsif v_role = 'barista' then
      v_barista_count := v_barista_count + 1;
    end if;

    v_assignment_key := v_role || ':' || coalesce(v_staff_member_id::text, 'owner:' || v_owner_user_id::text);
    if v_assignment_key = any(v_assignment_keys) then
      raise exception 'duplicate_shift_assignment';
    end if;
    v_assignment_keys := array_append(v_assignment_keys, v_assignment_key);
  end loop;

  if v_supervisor_count <> 1 then
    raise exception 'supervisor_required';
  end if;

  if v_barista_count > 1 then
    raise exception 'multiple_baristas_not_allowed';
  end if;

  v_shift_payload := public.ops_open_shift(
    p_cafe_id,
    p_shift_kind,
    p_business_date,
    p_opened_by_owner_id,
    p_notes
  );

  v_shift_id := nullif(v_shift_payload->>'shift_id', '')::uuid;
  v_mode := coalesce(nullif(v_shift_payload->>'mode', ''), 'created');

  if v_shift_id is null then
    raise exception 'shift_open_failed';
  end if;

  update ops.shift_role_assignments
  set is_active = false
  where cafe_id = p_cafe_id
    and shift_id = v_shift_id
    and is_active = true;

  for v_item in select value from jsonb_array_elements(v_assignments)
  loop
    v_role := lower(nullif(btrim(v_item->>'role'), ''));
    v_actor_type := lower(coalesce(nullif(btrim(v_item->>'actorType'), ''), 'staff'));

    v_staff_member_id := nullif(
      btrim(
        coalesce(
          v_item->>'staff_member_id',
          case when v_actor_type = 'staff' then v_item->>'userId' else null end,
          ''
        )
      ),
      ''
    )::uuid;
    v_owner_user_id := nullif(
      btrim(
        coalesce(
          v_item->>'owner_user_id',
          case when v_actor_type = 'owner' then v_item->>'userId' else null end,
          ''
        )
      ),
      ''
    )::uuid;

    select sra.id
    into v_existing_assignment_id
    from ops.shift_role_assignments sra
    where sra.cafe_id = p_cafe_id
      and sra.shift_id = v_shift_id
      and sra.role_code = v_role
      and sra.staff_member_id is not distinct from v_staff_member_id
      and sra.owner_user_id is not distinct from v_owner_user_id
    order by sra.assigned_at desc, sra.id desc
    limit 1;

    if v_existing_assignment_id is not null then
      update ops.shift_role_assignments
      set is_active = true,
          assigned_at = now()
      where id = v_existing_assignment_id;
    else
      insert into ops.shift_role_assignments (
        cafe_id,
        shift_id,
        role_code,
        staff_member_id,
        owner_user_id,
        is_active,
        assigned_at
      )
      values (
        p_cafe_id,
        v_shift_id,
        v_role,
        v_staff_member_id,
        v_owner_user_id,
        true,
        now()
      );
    end if;
  end loop;

  return jsonb_build_object(
    'shift_id', v_shift_id,
    'mode', v_mode,
    'assignment_count', jsonb_array_length(v_assignments)
  );
end;
$$;

commit;
