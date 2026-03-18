begin;

update ops.owner_users
set phone = btrim(phone)
where phone is distinct from btrim(phone);

do $$
begin
  if exists (
    select 1
    from ops.owner_users ou
    where ou.is_active = true
    group by ou.cafe_id, btrim(ou.phone)
    having count(*) > 1
  ) then
    raise exception 'owner_phone_normalization_conflict';
  end if;
end;
$$;

create unique index if not exists uq_owner_users_cafe_phone_trimmed_active
  on ops.owner_users (cafe_id, btrim(phone))
  where is_active = true;

create or replace function public.platform_validate_owner_password_setup(
  p_slug text,
  p_phone text,
  p_setup_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_owner ops.owner_users%rowtype;
  v_cafe ops.cafes%rowtype;
begin
  if nullif(btrim(p_slug), '') is null then
    raise exception 'p_slug is required';
  end if;

  if nullif(btrim(p_phone), '') is null then
    raise exception 'p_phone is required';
  end if;

  if nullif(btrim(p_setup_code), '') is null then
    raise exception 'p_setup_code is required';
  end if;

  select c.*
  into v_cafe
  from ops.cafes c
  where lower(btrim(c.slug)) = lower(btrim(p_slug))
    and c.is_active = true;

  if not found then
    raise exception 'cafe_not_found';
  end if;

  select *
  into v_owner
  from ops.owner_users ou
  where ou.cafe_id = v_cafe.id
    and ou.is_active = true
    and btrim(ou.phone) = btrim(p_phone);

  if not found then
    raise exception 'owner_user_not_found';
  end if;

  if v_owner.password_state not in ('setup_pending', 'reset_pending') then
    raise exception 'owner_password_setup_not_pending';
  end if;

  if v_owner.password_setup_code_hash is null then
    raise exception 'owner_password_setup_not_pending';
  end if;

  if v_owner.password_setup_consumed_at is not null or v_owner.password_setup_revoked_at is not null then
    raise exception 'owner_password_setup_not_pending';
  end if;

  if v_owner.password_setup_expires_at is null or v_owner.password_setup_expires_at <= now() then
    raise exception 'owner_password_setup_expired';
  end if;

  if extensions.crypt(btrim(p_setup_code), v_owner.password_setup_code_hash) <> v_owner.password_setup_code_hash then
    raise exception 'invalid_owner_password_setup_code';
  end if;

  return jsonb_build_object(
    'ok', true,
    'cafe_id', v_cafe.id,
    'cafe_slug', v_cafe.slug,
    'owner_user_id', v_owner.id,
    'full_name', v_owner.full_name,
    'owner_label', v_owner.owner_label,
    'password_state', v_owner.password_state
  );
end;
$$;

create or replace function public.platform_complete_owner_password_setup(
  p_slug text,
  p_phone text,
  p_setup_code text,
  p_new_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_owner ops.owner_users%rowtype;
  v_cafe ops.cafes%rowtype;
  v_next_hash text;
  v_state text;
begin
  if nullif(btrim(p_slug), '') is null then
    raise exception 'p_slug is required';
  end if;

  if nullif(btrim(p_phone), '') is null then
    raise exception 'p_phone is required';
  end if;

  if nullif(btrim(p_setup_code), '') is null then
    raise exception 'p_setup_code is required';
  end if;

  if nullif(p_new_password, '') is null then
    raise exception 'p_new_password is required';
  end if;

  if char_length(p_new_password) < 8 then
    raise exception 'owner_password_too_short';
  end if;

  select c.*
  into v_cafe
  from ops.cafes c
  where lower(btrim(c.slug)) = lower(btrim(p_slug))
    and c.is_active = true;

  if not found then
    raise exception 'cafe_not_found';
  end if;

  select *
  into v_owner
  from ops.owner_users ou
  where ou.cafe_id = v_cafe.id
    and ou.is_active = true
    and btrim(ou.phone) = btrim(p_phone)
  for update;

  if not found then
    raise exception 'owner_user_not_found';
  end if;

  if v_owner.password_state not in ('setup_pending', 'reset_pending') then
    raise exception 'owner_password_setup_not_pending';
  end if;

  if v_owner.password_setup_code_hash is null then
    raise exception 'owner_password_setup_not_pending';
  end if;

  if v_owner.password_setup_consumed_at is not null or v_owner.password_setup_revoked_at is not null then
    raise exception 'owner_password_setup_not_pending';
  end if;

  if v_owner.password_setup_expires_at is null or v_owner.password_setup_expires_at <= now() then
    raise exception 'owner_password_setup_expired';
  end if;

  if extensions.crypt(btrim(p_setup_code), v_owner.password_setup_code_hash) <> v_owner.password_setup_code_hash then
    raise exception 'invalid_owner_password_setup_code';
  end if;

  v_state := v_owner.password_state;
  v_next_hash := extensions.crypt(p_new_password, extensions.gen_salt('bf'));

  update ops.owner_users
  set password_hash = v_next_hash,
      password_state = 'ready',
      password_setup_code_hash = null,
      password_setup_consumed_at = now(),
      password_setup_revoked_at = null
  where cafe_id = v_cafe.id
    and id = v_owner.id;

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
    v_cafe.id,
    'owner',
    v_owner.phone,
    'owner_password_setup_completed',
    'owner_user',
    v_owner.id,
    jsonb_build_object(
      'previous_password_state', v_state,
      'completed_at', now()
    )
  );

  return jsonb_build_object(
    'ok', true,
    'cafe_id', v_cafe.id,
    'cafe_slug', v_cafe.slug,
    'owner_user_id', v_owner.id,
    'full_name', v_owner.full_name,
    'owner_label', v_owner.owner_label,
    'password_state', 'ready'
  );
end;
$$;

commit;
