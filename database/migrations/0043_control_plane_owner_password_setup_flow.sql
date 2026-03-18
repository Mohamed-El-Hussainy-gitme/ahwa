begin;

alter table ops.owner_users
  add column if not exists password_setup_code_hash text,
  add column if not exists password_setup_requested_at timestamptz,
  add column if not exists password_setup_expires_at timestamptz,
  add column if not exists password_setup_consumed_at timestamptz,
  add column if not exists password_setup_revoked_at timestamptz,
  add column if not exists password_setup_issued_by_super_admin_user_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fk_owner_users_password_setup_issued_by_admin'
  ) then
    alter table ops.owner_users
      add constraint fk_owner_users_password_setup_issued_by_admin
      foreign key (password_setup_issued_by_super_admin_user_id)
      references platform.super_admin_users(id)
      on delete set null;
  end if;
end;
$$;

create or replace function public.platform_issue_owner_password_setup(
  p_super_admin_user_id uuid,
  p_cafe_id uuid,
  p_owner_user_id uuid,
  p_reason text default 'admin_reset'
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, platform
as $$
declare
  v_admin platform.super_admin_users%rowtype;
  v_owner ops.owner_users%rowtype;
  v_reason text;
  v_state text;
  v_code text;
  v_expires_at timestamptz;
  v_event_code text;
begin
  select *
  into v_admin
  from platform.super_admin_users
  where id = p_super_admin_user_id
    and is_active = true;

  if not found then
    raise exception 'active super admin not found';
  end if;

  select *
  into v_owner
  from ops.owner_users
  where cafe_id = p_cafe_id
    and id = p_owner_user_id;

  if not found then
    raise exception 'owner user not found';
  end if;

  if v_owner.is_active is distinct from true then
    raise exception 'owner user not active';
  end if;

  v_reason := lower(coalesce(nullif(btrim(p_reason), ''), 'admin_reset'));
  if v_reason not in ('initial_setup', 'admin_reset') then
    raise exception 'invalid owner password setup reason';
  end if;

  v_state := case when v_reason = 'initial_setup' then 'setup_pending' else 'reset_pending' end;
  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  v_expires_at := now() + interval '24 hours';
  v_event_code := case when v_reason = 'initial_setup' then 'platform_issue_owner_password_setup' else 'platform_issue_owner_password_reset' end;

  update ops.owner_users
  set password_hash = null,
      password_state = v_state,
      password_setup_code_hash = extensions.crypt(v_code, extensions.gen_salt('bf')),
      password_setup_requested_at = now(),
      password_setup_expires_at = v_expires_at,
      password_setup_consumed_at = null,
      password_setup_revoked_at = null,
      password_setup_issued_by_super_admin_user_id = v_admin.id
  where cafe_id = p_cafe_id
    and id = p_owner_user_id;

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
    v_event_code,
    'owner_user',
    p_owner_user_id,
    jsonb_build_object(
      'phone', v_owner.phone,
      'password_state', v_state,
      'password_setup_expires_at', v_expires_at,
      'reason', v_reason
    )
  );

  return jsonb_build_object(
    'ok', true,
    'cafe_id', p_cafe_id,
    'owner_user_id', p_owner_user_id,
    'password_state', v_state,
    'password_setup_code', v_code,
    'password_setup_expires_at', v_expires_at
  );
end;
$$;

create or replace function public.platform_create_owner_user(
  p_super_admin_user_id uuid,
  p_cafe_id uuid,
  p_full_name text,
  p_phone text,
  p_password text,
  p_owner_label text default 'partner'
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, platform
as $$
declare
  v_admin platform.super_admin_users%rowtype;
  v_cafe ops.cafes%rowtype;
  v_owner_id uuid;
  v_owner_label text;
  v_setup jsonb;
begin
  select *
  into v_admin
  from platform.super_admin_users
  where id = p_super_admin_user_id
    and is_active = true;

  if not found then
    raise exception 'active super admin not found';
  end if;

  select *
  into v_cafe
  from ops.cafes
  where id = p_cafe_id;

  if not found then
    raise exception 'cafe not found';
  end if;

  if nullif(btrim(p_full_name), '') is null then
    raise exception 'p_full_name is required';
  end if;

  if nullif(btrim(p_phone), '') is null then
    raise exception 'p_phone is required';
  end if;

  v_owner_label := lower(coalesce(nullif(btrim(p_owner_label), ''), 'partner'));

  if v_owner_label not in ('owner', 'partner') then
    raise exception 'invalid owner label';
  end if;

  insert into ops.owner_users (
    cafe_id,
    full_name,
    phone,
    password_hash,
    password_state,
    owner_label,
    is_active
  )
  values (
    p_cafe_id,
    btrim(p_full_name),
    btrim(p_phone),
    null,
    'setup_pending',
    v_owner_label,
    true
  )
  returning id into v_owner_id;

  v_setup := public.platform_issue_owner_password_setup(
    p_super_admin_user_id,
    p_cafe_id,
    v_owner_id,
    'initial_setup'
  );

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
    'platform_create_owner_user',
    'owner_user',
    v_owner_id,
    jsonb_build_object(
      'phone', btrim(p_phone),
      'owner_label', v_owner_label,
      'password_state', 'setup_pending'
    )
  );

  return jsonb_build_object(
    'ok', true,
    'owner_user_id', v_owner_id,
    'owner_label', v_owner_label,
    'password_state', coalesce(v_setup ->> 'password_state', 'setup_pending'),
    'password_setup_code', v_setup ->> 'password_setup_code',
    'password_setup_expires_at', v_setup ->> 'password_setup_expires_at'
  );
end;
$$;

create or replace function public.platform_create_cafe_with_owner(
  p_super_admin_user_id uuid,
  p_cafe_slug text,
  p_cafe_display_name text,
  p_owner_full_name text,
  p_owner_phone text,
  p_owner_password text,
  p_subscription_starts_at timestamptz default null,
  p_subscription_ends_at timestamptz default null,
  p_subscription_grace_days integer default 0,
  p_subscription_status text default 'trial',
  p_subscription_amount_paid numeric default 0,
  p_subscription_is_complimentary boolean default false,
  p_subscription_notes text default null,
  p_database_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, control, ops, platform
as $$
declare
  v_admin platform.super_admin_users%rowtype;
  v_cafe_id uuid;
  v_owner_id uuid;
  v_slug text;
  v_subscription_id uuid;
  v_subscription_status text;
  v_should_create_subscription boolean := p_subscription_starts_at is not null or p_subscription_ends_at is not null;
  v_database_key text := lower(nullif(btrim(p_database_key), ''));
  v_setup jsonb;
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

  if v_database_key is null then
    raise exception 'p_database_key is required';
  end if;

  if not exists (
    select 1
    from control.operational_databases od
    where od.database_key = v_database_key
      and od.is_active = true
  ) then
    raise exception 'operational_database_not_found';
  end if;

  if v_should_create_subscription then
    if p_subscription_starts_at is null or p_subscription_ends_at is null then
      raise exception 'subscription dates are required';
    end if;

    if p_subscription_ends_at <= p_subscription_starts_at then
      raise exception 'subscription end must be after start';
    end if;

    if coalesce(p_subscription_grace_days, 0) < 0 then
      raise exception 'subscription grace_days must be >= 0';
    end if;

    if coalesce(p_subscription_amount_paid, 0) < 0 then
      raise exception 'subscription amount_paid must be >= 0';
    end if;

    v_subscription_status := lower(coalesce(nullif(btrim(p_subscription_status), ''), 'trial'));
    if v_subscription_status not in ('trial', 'active', 'expired', 'suspended') then
      raise exception 'invalid subscription status';
    end if;
  end if;

  insert into ops.cafes (
    slug,
    display_name,
    is_active
  )
  values (
    v_slug,
    btrim(p_cafe_display_name),
    true
  )
  returning id into v_cafe_id;

  perform public.control_assign_cafe_database(
    p_super_admin_user_id,
    v_cafe_id,
    v_database_key,
    'manual'
  );

  insert into ops.owner_users (
    cafe_id,
    full_name,
    phone,
    password_hash,
    password_state,
    owner_label,
    is_active
  )
  values (
    v_cafe_id,
    btrim(p_owner_full_name),
    btrim(p_owner_phone),
    null,
    'setup_pending',
    'owner',
    true
  )
  returning id into v_owner_id;

  v_setup := public.platform_issue_owner_password_setup(
    p_super_admin_user_id,
    v_cafe_id,
    v_owner_id,
    'initial_setup'
  );

  if v_should_create_subscription then
    insert into platform.cafe_subscriptions (
      cafe_id,
      starts_at,
      ends_at,
      grace_days,
      status,
      amount_paid,
      is_complimentary,
      notes,
      created_by_super_admin_user_id,
      created_at,
      updated_at
    )
    values (
      v_cafe_id,
      p_subscription_starts_at,
      p_subscription_ends_at,
      coalesce(p_subscription_grace_days, 0),
      v_subscription_status,
      coalesce(p_subscription_amount_paid, 0),
      coalesce(p_subscription_is_complimentary, false),
      nullif(btrim(coalesce(p_subscription_notes, '')), ''),
      p_super_admin_user_id,
      now(),
      now()
    )
    returning id into v_subscription_id;
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
    v_cafe_id,
    'super_admin',
    v_admin.email,
    'platform_create_cafe_with_owner',
    'cafe',
    v_cafe_id,
    jsonb_build_object(
      'owner_user_id', v_owner_id,
      'owner_phone', btrim(p_owner_phone),
      'owner_label', 'owner',
      'database_key', v_database_key,
      'password_state', 'setup_pending',
      'password_setup_expires_at', v_setup ->> 'password_setup_expires_at',
      'subscription', case
        when v_subscription_id is null then null
        else jsonb_build_object(
          'subscription_id', v_subscription_id,
          'starts_at', p_subscription_starts_at,
          'ends_at', p_subscription_ends_at,
          'grace_days', coalesce(p_subscription_grace_days, 0),
          'status', v_subscription_status,
          'amount_paid', coalesce(p_subscription_amount_paid, 0),
          'is_complimentary', coalesce(p_subscription_is_complimentary, false),
          'notes', nullif(btrim(coalesce(p_subscription_notes, '')), '')
        )
      end
    )
  );

  return jsonb_build_object(
    'ok', true,
    'cafe_id', v_cafe_id,
    'owner_user_id', v_owner_id,
    'subscription_id', v_subscription_id,
    'slug', v_slug,
    'database_key', v_database_key,
    'password_state', coalesce(v_setup ->> 'password_state', 'setup_pending'),
    'password_setup_code', v_setup ->> 'password_setup_code',
    'password_setup_expires_at', v_setup ->> 'password_setup_expires_at'
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
begin
  return public.platform_issue_owner_password_setup(
    p_super_admin_user_id,
    p_cafe_id,
    p_owner_user_id,
    'admin_reset'
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
    and c.is_active = true
  limit 1;

  if not found then
    raise exception 'cafe_not_found';
  end if;

  select *
  into v_owner
  from ops.owner_users ou
  where ou.cafe_id = v_cafe.id
    and ou.is_active = true
    and btrim(ou.phone) = btrim(p_phone)
  limit 1;

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
    'owner_auth',
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
