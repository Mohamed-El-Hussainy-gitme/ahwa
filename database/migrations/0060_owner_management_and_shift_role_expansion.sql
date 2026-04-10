begin;

alter table if exists ops.shift_role_assignments
  drop constraint if exists shift_role_assignments_role_code_check;

alter table if exists ops.shift_role_assignments
  add constraint shift_role_assignments_role_code_check
  check (role_code in ('supervisor', 'waiter', 'barista', 'shisha', 'american_waiter'));

create or replace function public.ops_create_management_account(
  p_cafe_id uuid,
  p_actor_owner_id uuid,
  p_full_name text,
  p_phone text,
  p_password text,
  p_owner_label text default 'branch_manager'
) returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_actor ops.owner_users%rowtype;
  v_owner_id uuid;
  v_owner_label text;
begin
  select * into v_actor
  from ops.owner_users
  where cafe_id = p_cafe_id
    and id = p_actor_owner_id
    and is_active = true;

  if not found then
    raise exception 'owner_actor_not_found';
  end if;

  if v_actor.owner_label = 'branch_manager' then
    raise exception 'branch_manager_cannot_manage_admin_accounts';
  end if;

  if nullif(btrim(p_full_name), '') is null then
    raise exception 'p_full_name is required';
  end if;
  if nullif(btrim(p_phone), '') is null then
    raise exception 'p_phone is required';
  end if;
  if nullif(p_password, '') is null then
    raise exception 'p_password is required';
  end if;

  v_owner_label := lower(coalesce(nullif(btrim(p_owner_label), ''), 'branch_manager'));
  if v_owner_label <> 'branch_manager' then
    raise exception 'invalid owner label';
  end if;

  insert into ops.owner_users (cafe_id, full_name, phone, password_hash, owner_label, is_active)
  values (
    p_cafe_id,
    btrim(p_full_name),
    btrim(p_phone),
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    v_owner_label,
    true
  )
  returning id into v_owner_id;

  insert into ops.audit_events (cafe_id, actor_type, actor_label, event_code, entity_type, entity_id, payload)
  values (
    p_cafe_id,
    'owner',
    coalesce(v_actor.full_name, v_actor.phone, p_actor_owner_id::text),
    'owner_create_management_account',
    'owner_user',
    v_owner_id,
    jsonb_build_object('phone', btrim(p_phone), 'owner_label', v_owner_label)
  );

  return jsonb_build_object('ok', true, 'owner_user_id', v_owner_id, 'owner_label', v_owner_label);
end;
$$;

commit;
