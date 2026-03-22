begin;

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
  p_database_key text default null,
  p_cafe_load_tier text default 'small'
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
  v_cafe_load_tier text := lower(coalesce(nullif(btrim(p_cafe_load_tier), ''), 'small'));
  v_database_key text;
  v_binding_source text;
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

  -- Kept for RPC signature compatibility with older callers.
  -- The owner password must be created by the owner through the one-time setup code flow.
  perform nullif(p_owner_password, '');

  if v_cafe_load_tier not in ('small', 'medium', 'heavy', 'enterprise') then
    raise exception 'invalid cafe load tier';
  end if;

  v_database_key := lower(
    coalesce(
      nullif(btrim(p_database_key), ''),
      public.control_select_operational_database_key(v_cafe_load_tier),
      public.control_get_default_operational_database_key()
    )
  );
  v_binding_source := case
    when p_database_key is null or nullif(btrim(p_database_key), '') is null then 'recommended'
    else 'manual'
  end;

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
    v_binding_source,
    v_cafe_load_tier
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
      'cafe_load_tier', v_cafe_load_tier,
      'load_units', public.control_load_units_for_tier(v_cafe_load_tier),
      'binding_source', v_binding_source,
      'password_state', coalesce(v_setup ->> 'password_state', 'setup_pending'),
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
    'cafe_load_tier', v_cafe_load_tier,
    'load_units', public.control_load_units_for_tier(v_cafe_load_tier),
    'password_state', coalesce(v_setup ->> 'password_state', 'setup_pending'),
    'password_setup_code', v_setup ->> 'password_setup_code',
    'password_setup_expires_at', v_setup ->> 'password_setup_expires_at'
  );
end;
$$;

commit;
