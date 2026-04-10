-- Control-plane-only migration.
-- Update platform owner management functions to accept branch_manager.

DO $$
BEGIN
  IF to_regnamespace('platform') IS NULL THEN
    RAISE EXCEPTION 'CONTROL_PLANE_ONLY_MIGRATION: schema "platform" does not exist in this database';
  END IF;
END
$$;

create or replace function public.platform_create_owner_user(
  p_super_admin_user_id uuid,
  p_cafe_id uuid,
  p_full_name text,
  p_phone text,
  p_password text,
  p_owner_label text default 'partner'
) returns jsonb
language plpgsql
security definer
set search_path = public, ops, platform
as $$
declare
  v_admin platform.super_admin_users%rowtype;
  v_cafe ops.cafes%rowtype;
  v_owner_id uuid;
  v_owner_label text;
begin
  select * into v_admin from platform.super_admin_users where id = p_super_admin_user_id and is_active = true;
  if not found then raise exception 'active super admin not found'; end if;
  select * into v_cafe from ops.cafes where id = p_cafe_id;
  if not found then raise exception 'cafe not found'; end if;
  if nullif(btrim(p_full_name), '') is null then raise exception 'p_full_name is required'; end if;
  if nullif(btrim(p_phone), '') is null then raise exception 'p_phone is required'; end if;
  v_owner_label := lower(coalesce(nullif(btrim(p_owner_label), ''), 'partner'));
  if v_owner_label not in ('owner', 'partner', 'branch_manager') then raise exception 'invalid owner label'; end if;
  insert into ops.owner_users (cafe_id, full_name, phone, password_hash, owner_label, is_active)
  values (p_cafe_id, btrim(p_full_name), btrim(p_phone), case when nullif(p_password, '') is null then null else extensions.crypt(p_password, extensions.gen_salt('bf')) end, v_owner_label, true)
  returning id into v_owner_id;
  insert into ops.audit_events (cafe_id, actor_type, actor_label, event_code, entity_type, entity_id, payload)
  values (p_cafe_id, 'super_admin', v_admin.email, 'platform_create_owner_user', 'owner_user', v_owner_id, jsonb_build_object('phone', btrim(p_phone), 'owner_label', v_owner_label));
  return jsonb_build_object('ok', true, 'owner_user_id', v_owner_id, 'owner_label', v_owner_label);
end;
$$;

create or replace function public.platform_update_owner_user(
  p_super_admin_user_id uuid,
  p_cafe_id uuid,
  p_owner_user_id uuid,
  p_full_name text default null,
  p_phone text default null,
  p_owner_label text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, ops, platform
as $$
declare
  v_admin platform.super_admin_users%rowtype;
  v_owner ops.owner_users%rowtype;
  v_next_full_name text;
  v_next_phone text;
  v_next_owner_label text;
begin
  select * into v_admin from platform.super_admin_users where id = p_super_admin_user_id and is_active = true;
  if not found then raise exception 'active super admin not found'; end if;
  select * into v_owner from ops.owner_users where cafe_id = p_cafe_id and id = p_owner_user_id;
  if not found then raise exception 'owner user not found'; end if;
  v_next_full_name := coalesce(nullif(btrim(p_full_name), ''), v_owner.full_name);
  v_next_phone := coalesce(nullif(btrim(p_phone), ''), v_owner.phone);
  v_next_owner_label := lower(coalesce(nullif(btrim(p_owner_label), ''), v_owner.owner_label));
  if v_next_owner_label not in ('owner', 'partner', 'branch_manager') then raise exception 'invalid owner label'; end if;
  update ops.owner_users set full_name = v_next_full_name, phone = v_next_phone, owner_label = v_next_owner_label where cafe_id = p_cafe_id and id = p_owner_user_id;
  insert into ops.audit_events (cafe_id, actor_type, actor_label, event_code, entity_type, entity_id, payload)
  values (p_cafe_id, 'super_admin', v_admin.email, 'platform_update_owner_user', 'owner_user', p_owner_user_id, jsonb_build_object('full_name', v_next_full_name, 'phone', v_next_phone, 'owner_label', v_next_owner_label));
  return jsonb_build_object('ok', true, 'owner_user_id', p_owner_user_id, 'owner_label', v_next_owner_label);
end;
$$;
