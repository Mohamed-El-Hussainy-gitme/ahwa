begin;

alter table ops.owner_users
  add column if not exists owner_label text;

update ops.owner_users
set owner_label = 'owner'
where owner_label is null;

alter table ops.owner_users
  alter column owner_label set default 'owner';

alter table ops.owner_users
  alter column owner_label set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chk_ops_owner_users_owner_label'
  ) then
    alter table ops.owner_users
      add constraint chk_ops_owner_users_owner_label
      check (owner_label in ('owner', 'partner'));
  end if;
end;
$$;

create index if not exists idx_owner_users_cafe_owner_label
  on ops.owner_users(cafe_id, owner_label);

create table if not exists platform.cafe_subscriptions (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  grace_days integer not null default 0 check (grace_days >= 0),
  status text not null check (status in ('trial', 'active', 'expired', 'suspended')),
  notes text,
  created_by_super_admin_user_id uuid not null references platform.super_admin_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_platform_cafe_subscriptions_cafe_created
  on platform.cafe_subscriptions(cafe_id, created_at desc);

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
    btrim(p_cafe_display_name),
    true
  )
  returning id into v_cafe_id;

  insert into ops.owner_users (
    cafe_id,
    full_name,
    phone,
    password_hash,
    owner_label,
    is_active
  )
  values (
    v_cafe_id,
    btrim(p_owner_full_name),
    btrim(p_owner_phone),
    extensions.crypt(p_owner_password, extensions.gen_salt('bf')),
    'owner',
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
      'owner_phone', btrim(p_owner_phone),
      'owner_label', 'owner'
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

create or replace function public.platform_list_cafes()
returns jsonb
language sql
security definer
set search_path = public, ops, platform
as $$
  with latest_subscription as (
    select distinct on (s.cafe_id)
      s.cafe_id,
      s.id,
      s.starts_at,
      s.ends_at,
      s.grace_days,
      s.status,
      s.notes,
      s.created_at,
      s.updated_at,
      case
        when s.status = 'suspended' then 'suspended'
        when now() > s.ends_at + make_interval(days => s.grace_days) then 'expired'
        else s.status
      end as effective_status,
      greatest(0, floor(extract(epoch from (s.ends_at - now()))))::bigint as countdown_seconds
    from platform.cafe_subscriptions s
    order by s.cafe_id, s.created_at desc, s.id desc
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
  from (
    select
      c.id,
      c.slug,
      c.display_name,
      c.is_active,
      c.created_at,
      (
        select count(*)::integer
        from ops.owner_users ou
        where ou.cafe_id = c.id
      ) as owner_count,
      (
        select count(*)::integer
        from ops.owner_users ou
        where ou.cafe_id = c.id
          and ou.is_active = true
      ) as active_owner_count,
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', ou.id,
            'full_name', ou.full_name,
            'phone', ou.phone,
            'owner_label', ou.owner_label,
            'is_active', ou.is_active,
            'created_at', ou.created_at
          ) order by ou.created_at asc
        )
        from ops.owner_users ou
        where ou.cafe_id = c.id
      ) as owners,
      case
        when ls.cafe_id is null then null
        else jsonb_build_object(
          'id', ls.id,
          'starts_at', ls.starts_at,
          'ends_at', ls.ends_at,
          'grace_days', ls.grace_days,
          'status', ls.status,
          'effective_status', ls.effective_status,
          'notes', ls.notes,
          'created_at', ls.created_at,
          'updated_at', ls.updated_at,
          'countdown_seconds', ls.countdown_seconds
        )
      end as current_subscription
    from ops.cafes c
    left join latest_subscription ls
      on ls.cafe_id = c.id
  ) x;
$$;

create or replace function public.platform_list_owner_users(
  p_super_admin_user_id uuid,
  p_cafe_id uuid
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

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'owner_user_id', ou.id,
        'cafe_id', ou.cafe_id,
        'full_name', ou.full_name,
        'phone', ou.phone,
        'owner_label', ou.owner_label,
        'is_active', ou.is_active,
        'created_at', ou.created_at
      )
      order by ou.created_at desc
    )
    from ops.owner_users ou
    where ou.cafe_id = p_cafe_id
  ), '[]'::jsonb);
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

  if nullif(p_password, '') is null then
    raise exception 'p_password is required';
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
    owner_label,
    is_active
  )
  values (
    p_cafe_id,
    btrim(p_full_name),
    btrim(p_phone),
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    v_owner_label,
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
    p_cafe_id,
    'super_admin',
    v_admin.email,
    'platform_create_owner_user',
    'owner_user',
    v_owner_id,
    jsonb_build_object(
      'phone', btrim(p_phone),
      'owner_label', v_owner_label
    )
  );

  return jsonb_build_object(
    'ok', true,
    'owner_user_id', v_owner_id,
    'owner_label', v_owner_label
  );
end;
$$;

create or replace function public.platform_update_owner_user(
  p_super_admin_user_id uuid,
  p_cafe_id uuid,
  p_owner_user_id uuid,
  p_full_name text default null,
  p_phone text default null,
  p_owner_label text default null
)
returns jsonb
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

  v_next_full_name := coalesce(nullif(btrim(p_full_name), ''), v_owner.full_name);
  v_next_phone := coalesce(nullif(btrim(p_phone), ''), v_owner.phone);
  v_next_owner_label := lower(coalesce(nullif(btrim(p_owner_label), ''), v_owner.owner_label));

  if v_next_owner_label not in ('owner', 'partner') then
    raise exception 'invalid owner label';
  end if;

  update ops.owner_users
  set full_name = v_next_full_name,
      phone = v_next_phone,
      owner_label = v_next_owner_label
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
    'platform_update_owner_user',
    'owner_user',
    p_owner_user_id,
    jsonb_build_object(
      'full_name', v_next_full_name,
      'phone', v_next_phone,
      'owner_label', v_next_owner_label
    )
  );

  return jsonb_build_object(
    'ok', true,
    'owner_user_id', p_owner_user_id,
    'owner_label', v_next_owner_label
  );
end;
$$;

create or replace function public.platform_set_owner_user_active(
  p_super_admin_user_id uuid,
  p_cafe_id uuid,
  p_owner_user_id uuid,
  p_is_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, platform
as $$
declare
  v_admin platform.super_admin_users%rowtype;
  v_owner_label text;
begin
  select *
  into v_admin
  from platform.super_admin_users
  where id = p_super_admin_user_id
    and is_active = true;

  if not found then
    raise exception 'active super admin not found';
  end if;

  update ops.owner_users
  set is_active = coalesce(p_is_active, false)
  where cafe_id = p_cafe_id
    and id = p_owner_user_id
  returning owner_label into v_owner_label;

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
    'platform_set_owner_user_active',
    'owner_user',
    p_owner_user_id,
    jsonb_build_object(
      'is_active', coalesce(p_is_active, false),
      'owner_label', v_owner_label
    )
  );

  return jsonb_build_object(
    'ok', true,
    'owner_user_id', p_owner_user_id,
    'is_active', coalesce(p_is_active, false)
  );
end;
$$;

create or replace function public.platform_set_cafe_active(
  p_super_admin_user_id uuid,
  p_cafe_id uuid,
  p_is_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, platform
as $$
declare
  v_admin platform.super_admin_users%rowtype;
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

  update ops.cafes
  set is_active = coalesce(p_is_active, false)
  where id = p_cafe_id
  returning slug into v_slug;

  if not found then
    raise exception 'cafe not found';
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
    'platform_set_cafe_active',
    'cafe',
    p_cafe_id,
    jsonb_build_object(
      'slug', v_slug,
      'is_active', coalesce(p_is_active, false)
    )
  );

  return jsonb_build_object(
    'ok', true,
    'cafe_id', p_cafe_id,
    'is_active', coalesce(p_is_active, false)
  );
end;
$$;

create or replace function public.platform_record_cafe_subscription(
  p_super_admin_user_id uuid,
  p_cafe_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_grace_days integer default 0,
  p_status text default 'active',
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, platform
as $$
declare
  v_admin platform.super_admin_users%rowtype;
  v_subscription_id uuid;
  v_status text;
begin
  select *
  into v_admin
  from platform.super_admin_users
  where id = p_super_admin_user_id
    and is_active = true;

  if not found then
    raise exception 'active super admin not found';
  end if;

  perform 1
  from ops.cafes
  where id = p_cafe_id;

  if not found then
    raise exception 'cafe not found';
  end if;

  if p_starts_at is null or p_ends_at is null then
    raise exception 'subscription dates are required';
  end if;

  if p_ends_at <= p_starts_at then
    raise exception 'subscription end must be after start';
  end if;

  if coalesce(p_grace_days, 0) < 0 then
    raise exception 'grace_days must be >= 0';
  end if;

  v_status := lower(coalesce(nullif(btrim(p_status), ''), 'active'));

  if v_status not in ('trial', 'active', 'expired', 'suspended') then
    raise exception 'invalid subscription status';
  end if;

  insert into platform.cafe_subscriptions (
    cafe_id,
    starts_at,
    ends_at,
    grace_days,
    status,
    notes,
    created_by_super_admin_user_id,
    created_at,
    updated_at
  )
  values (
    p_cafe_id,
    p_starts_at,
    p_ends_at,
    coalesce(p_grace_days, 0),
    v_status,
    nullif(btrim(coalesce(p_notes, '')), ''),
    p_super_admin_user_id,
    now(),
    now()
  )
  returning id into v_subscription_id;

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
    'platform_record_cafe_subscription',
    'cafe_subscription',
    v_subscription_id,
    jsonb_build_object(
      'starts_at', p_starts_at,
      'ends_at', p_ends_at,
      'grace_days', coalesce(p_grace_days, 0),
      'status', v_status,
      'notes', nullif(btrim(coalesce(p_notes, '')), '')
    )
  );

  return jsonb_build_object(
    'ok', true,
    'subscription_id', v_subscription_id,
    'status', v_status
  );
end;
$$;

create or replace function public.platform_list_cafe_subscriptions(
  p_super_admin_user_id uuid,
  p_cafe_id uuid
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

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'cafe_id', s.cafe_id,
        'starts_at', s.starts_at,
        'ends_at', s.ends_at,
        'grace_days', s.grace_days,
        'status', s.status,
        'effective_status', case
          when s.status = 'suspended' then 'suspended'
          when now() > s.ends_at + make_interval(days => s.grace_days) then 'expired'
          else s.status
        end,
        'notes', s.notes,
        'created_at', s.created_at,
        'updated_at', s.updated_at,
        'countdown_seconds', greatest(0, floor(extract(epoch from (s.ends_at - now()))))::bigint
      )
      order by s.created_at desc, s.id desc
    )
    from platform.cafe_subscriptions s
    where s.cafe_id = p_cafe_id
  ), '[]'::jsonb);
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
    o.owner_label
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

commit;
