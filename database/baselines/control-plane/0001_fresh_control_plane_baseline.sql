-- AUTO-GENERATED FILE. DO NOT EDIT DIRECTLY.
-- Regenerate with: npm run build:db-baselines

-- >>> 0034_control_plane_manual_database_selection.sql
begin;

create schema if not exists control;

create table if not exists control.operational_databases (
  database_key text primary key,
  display_name text,
  description text,
  is_active boolean not null default true,
  is_accepting_new_cafes boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_control_operational_databases_key_nonempty
    check (nullif(btrim(database_key), '') is not null)
);

create table if not exists control.cafe_database_bindings (
  cafe_id uuid primary key references ops.cafes(id) on delete cascade,
  database_key text,
  binding_source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists control.operational_databases
  add column if not exists display_name text,
  add column if not exists description text,
  add column if not exists is_active boolean not null default true,
  add column if not exists is_accepting_new_cafes boolean not null default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table if exists control.cafe_database_bindings
  add column if not exists database_key text,
  add column if not exists binding_source text not null default 'manual',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update control.operational_databases
set display_name = coalesce(nullif(btrim(display_name), ''), database_key),
    is_active = coalesce(is_active, true),
    is_accepting_new_cafes = coalesce(is_accepting_new_cafes, true),
    created_at = coalesce(created_at, now()),
    updated_at = coalesce(updated_at, now());

update control.cafe_database_bindings
set binding_source = coalesce(nullif(btrim(binding_source), ''), 'manual'),
    created_at = coalesce(created_at, now()),
    updated_at = coalesce(updated_at, now());

insert into control.operational_databases (
  database_key,
  display_name,
  description,
  is_active,
  is_accepting_new_cafes,
  created_at,
  updated_at
)
values (
  'ops-db-01',
  'قاعدة التشغيل 01',
  'القاعدة التشغيلية الافتراضية الحالية',
  true,
  true,
  now(),
  now()
)
on conflict (database_key)
do update set display_name = excluded.display_name,
              description = excluded.description,
              is_active = excluded.is_active,
              is_accepting_new_cafes = excluded.is_accepting_new_cafes,
              updated_at = now();

alter table control.cafe_database_bindings
  drop constraint if exists cafe_database_bindings_database_key_fkey;

alter table control.cafe_database_bindings
  alter column database_key set not null;

alter table control.cafe_database_bindings
  add constraint cafe_database_bindings_database_key_fkey
  foreign key (database_key)
  references control.operational_databases(database_key)
  on delete restrict;

create index if not exists idx_control_operational_databases_accepting
  on control.operational_databases(is_active, is_accepting_new_cafes, created_at desc);

create index if not exists idx_control_cafe_database_bindings_key_created
  on control.cafe_database_bindings(database_key, created_at desc);

insert into control.cafe_database_bindings (
  cafe_id,
  database_key,
  binding_source,
  created_at,
  updated_at
)
select
  c.id,
  'ops-db-01',
  'backfill',
  now(),
  now()
from ops.cafes c
where not exists (
  select 1
  from control.cafe_database_bindings b
  where b.cafe_id = c.id
);

create or replace function public.control_get_default_operational_database_key()
returns text
language sql
security definer
set search_path = public, control
as $$
  select coalesce(
    (
      select od.database_key
      from control.operational_databases od
      where od.is_active = true
        and od.is_accepting_new_cafes = true
      order by od.created_at asc, od.database_key asc
      limit 1
    ),
    'ops-db-01'
  );
$$;

create or replace function public.control_list_operational_databases()
returns jsonb
language sql
security definer
set search_path = public, control
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'database_key', od.database_key,
        'display_name', coalesce(nullif(btrim(od.display_name), ''), od.database_key),
        'description', od.description,
        'is_active', od.is_active,
        'is_accepting_new_cafes', od.is_accepting_new_cafes,
        'cafe_count', coalesce(cafe_counts.cafe_count, 0),
        'created_at', od.created_at,
        'updated_at', od.updated_at
      )
      order by od.created_at asc, od.database_key asc
    ),
    '[]'::jsonb
  )
  from control.operational_databases od
  left join (
    select b.database_key, count(*)::bigint as cafe_count
    from control.cafe_database_bindings b
    group by b.database_key
  ) cafe_counts
    on cafe_counts.database_key = od.database_key;
$$;

create or replace function public.control_assign_cafe_database(
  p_super_admin_user_id uuid,
  p_cafe_id uuid,
  p_database_key text,
  p_binding_source text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path = public, control, platform, ops
as $$
declare
  v_admin platform.super_admin_users%rowtype;
  v_database_key text := lower(nullif(btrim(p_database_key), ''));
  v_binding_source text := lower(coalesce(nullif(btrim(p_binding_source), ''), 'manual'));
begin
  select *
  into v_admin
  from platform.super_admin_users
  where id = p_super_admin_user_id
    and is_active = true;

  if not found then
    raise exception 'active super admin not found';
  end if;

  if v_database_key is null then
    raise exception 'p_database_key is required';
  end if;

  if not exists (
    select 1
    from ops.cafes c
    where c.id = p_cafe_id
  ) then
    raise exception 'cafe_not_found';
  end if;

  if v_binding_source not in ('manual', 'default', 'backfill', 'migration') then
    raise exception 'invalid binding source';
  end if;

  if not exists (
    select 1
    from control.operational_databases od
    where od.database_key = v_database_key
      and od.is_active = true
  ) then
    raise exception 'operational_database_not_found';
  end if;

  insert into control.cafe_database_bindings (
    cafe_id,
    database_key,
    binding_source,
    created_at,
    updated_at
  ) values (
    p_cafe_id,
    v_database_key,
    v_binding_source,
    now(),
    now()
  )
  on conflict (cafe_id)
  do update set database_key = excluded.database_key,
                binding_source = excluded.binding_source,
                updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'cafe_id', p_cafe_id,
    'database_key', v_database_key,
    'binding_source', v_binding_source
  );
end;
$$;

create or replace function public.control_get_cafe_database_binding(
  p_cafe_id uuid
)
returns jsonb
language sql
security definer
set search_path = public, control
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'cafe_id', b.cafe_id,
        'database_key', b.database_key,
        'binding_source', b.binding_source,
        'created_at', b.created_at,
        'updated_at', b.updated_at
      )
      from control.cafe_database_bindings b
      where b.cafe_id = p_cafe_id
    ),
    jsonb_build_object(
      'cafe_id', p_cafe_id,
      'database_key', public.control_get_default_operational_database_key(),
      'binding_source', 'default',
      'created_at', null,
      'updated_at', null
    )
  );
$$;

drop function if exists public.platform_create_cafe_with_owner(
  uuid,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  integer,
  text,
  numeric,
  boolean,
  text
);

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
  v_database_key text := lower(coalesce(nullif(btrim(p_database_key), ''), public.control_get_default_operational_database_key()));
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

  insert into control.cafe_database_bindings (
    cafe_id,
    database_key,
    binding_source,
    created_at,
    updated_at
  ) values (
    v_cafe_id,
    v_database_key,
    case when p_database_key is null or nullif(btrim(p_database_key), '') is null then 'default' else 'manual' end,
    now(),
    now()
  );

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
    'database_key', v_database_key
  );
end;
$$;

commit;
-- <<< 0034_control_plane_manual_database_selection.sql

-- >>> 0035_phase8_strict_control_plane_bindings.sql
begin;

-- Remove legacy implicit bindings created by the default/backfill rollout.
delete from control.cafe_database_bindings
where binding_source in ('default', 'backfill');

-- Drop the legacy seeded operational database row when it is no longer referenced.
delete from control.operational_databases od
where od.database_key = 'ops-db-01'
  and coalesce(nullif(btrim(od.description), ''), '') = 'القاعدة التشغيلية الافتراضية الحالية'
  and not exists (
    select 1
    from control.cafe_database_bindings b
    where b.database_key = od.database_key
  );

create or replace function public.control_get_default_operational_database_key()
returns text
language sql
security definer
set search_path = public, control
as $$
  select od.database_key
  from control.operational_databases od
  where od.is_active = true
    and od.is_accepting_new_cafes = true
  order by od.created_at asc, od.database_key asc
  limit 1;
$$;

create or replace function public.control_assign_cafe_database(
  p_super_admin_user_id uuid,
  p_cafe_id uuid,
  p_database_key text,
  p_binding_source text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path = public, control, platform, ops
as $$
declare
  v_admin platform.super_admin_users%rowtype;
  v_database_key text := lower(nullif(btrim(p_database_key), ''));
  v_binding_source text := lower(coalesce(nullif(btrim(p_binding_source), ''), 'manual'));
begin
  select *
  into v_admin
  from platform.super_admin_users
  where id = p_super_admin_user_id
    and is_active = true;

  if not found then
    raise exception 'active super admin not found';
  end if;

  if v_database_key is null then
    raise exception 'p_database_key is required';
  end if;

  if not exists (
    select 1
    from ops.cafes c
    where c.id = p_cafe_id
  ) then
    raise exception 'cafe_not_found';
  end if;

  if v_binding_source not in ('manual', 'migration') then
    raise exception 'invalid binding source';
  end if;

  if not exists (
    select 1
    from control.operational_databases od
    where od.database_key = v_database_key
      and od.is_active = true
  ) then
    raise exception 'operational_database_not_found';
  end if;

  insert into control.cafe_database_bindings (
    cafe_id,
    database_key,
    binding_source,
    created_at,
    updated_at
  ) values (
    p_cafe_id,
    v_database_key,
    v_binding_source,
    now(),
    now()
  )
  on conflict (cafe_id)
  do update set database_key = excluded.database_key,
                binding_source = excluded.binding_source,
                updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'cafe_id', p_cafe_id,
    'database_key', v_database_key,
    'binding_source', v_binding_source
  );
end;
$$;

create or replace function public.control_get_cafe_database_binding(
  p_cafe_id uuid
)
returns jsonb
language sql
security definer
set search_path = public, control
as $$
  select (
    select jsonb_build_object(
      'cafe_id', b.cafe_id,
      'database_key', b.database_key,
      'binding_source', b.binding_source,
      'created_at', b.created_at,
      'updated_at', b.updated_at
    )
    from control.cafe_database_bindings b
    where b.cafe_id = p_cafe_id
    limit 1
  );
$$;

drop function if exists public.platform_create_cafe_with_owner(
  uuid,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  integer,
  text,
  numeric,
  boolean,
  text,
  text
);

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

  insert into control.cafe_database_bindings (
    cafe_id,
    database_key,
    binding_source,
    created_at,
    updated_at
  ) values (
    v_cafe_id,
    v_database_key,
    'manual',
    now(),
    now()
  );

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
    'database_key', v_database_key
  );
end;
$$;

commit;
-- <<< 0035_phase8_strict_control_plane_bindings.sql

-- >>> 0036_platform_response_hardening.sql
begin;

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
      s.amount_paid,
      s.is_complimentary,
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
  ),
  last_activity as (
    select
      activity.cafe_id,
      max(activity.activity_at) as last_activity_at
    from (
      select cafe_id, max(created_at) as activity_at from ops.audit_events group by cafe_id
      union all
      select cafe_id, max(opened_at) as activity_at from ops.shifts group by cafe_id
      union all
      select cafe_id, max(opened_at) as activity_at from ops.service_sessions group by cafe_id
      union all
      select cafe_id, max(created_at) as activity_at from ops.orders group by cafe_id
      union all
      select cafe_id, max(created_at) as activity_at from ops.payments group by cafe_id
      union all
      select cafe_id, max(created_at) as activity_at from ops.complaints group by cafe_id
      union all
      select cafe_id, max(created_at) as activity_at from ops.order_item_issues group by cafe_id
    ) activity
    group by activity.cafe_id
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by x.last_activity_at desc nulls last, x.created_at desc), '[]'::jsonb)
  from (
    select
      c.id,
      c.slug,
      c.display_name,
      c.is_active,
      c.created_at,
      la.last_activity_at,
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
      coalesce((
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
      ), '[]'::jsonb) as owners,
      case
        when ls.cafe_id is null then null
        else jsonb_build_object(
          'id', ls.id,
          'starts_at', ls.starts_at,
          'ends_at', ls.ends_at,
          'grace_days', ls.grace_days,
          'status', ls.status,
          'effective_status', ls.effective_status,
          'amount_paid', ls.amount_paid,
          'is_complimentary', ls.is_complimentary,
          'notes', ls.notes,
          'created_at', ls.created_at,
          'updated_at', ls.updated_at,
          'countdown_seconds', ls.countdown_seconds
        )
      end as current_subscription
    from ops.cafes c
    left join latest_subscription ls
      on ls.cafe_id = c.id
    left join last_activity la
      on la.cafe_id = c.id
  ) x;
$$;

commit;
-- <<< 0036_platform_response_hardening.sql

-- >>> 0037_control_plane_public_binding_readers.sql
begin;

create or replace function public.control_list_cafe_database_bindings()
returns jsonb
language sql
security definer
set search_path = public, control
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'cafe_id', b.cafe_id,
        'database_key', b.database_key,
        'binding_source', b.binding_source,
        'created_at', b.created_at,
        'updated_at', b.updated_at
      )
      order by b.created_at asc, b.cafe_id asc
    ),
    '[]'::jsonb
  )
  from control.cafe_database_bindings b;
$$;

comment on function public.control_list_cafe_database_bindings() is
  'PostgREST-safe public reader for control.cafe_database_bindings. Keeps control schema unexposed while allowing platform/admin and maintenance flows to read cafe database bindings through SECURITY DEFINER RPC.';

commit;
-- <<< 0037_control_plane_public_binding_readers.sql

-- >>> 0038_control_plane_create_flow_binding_upsert.sql
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
    'database_key', v_database_key
  );
end;
$$;

commit;
-- <<< 0038_control_plane_create_flow_binding_upsert.sql

-- >>> 0039_control_plane_operational_database_registration.sql
begin;

create or replace function public.control_register_operational_database(
  p_super_admin_user_id uuid,
  p_database_key text,
  p_display_name text default null,
  p_description text default null,
  p_is_active boolean default true,
  p_is_accepting_new_cafes boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, control, platform
as $$
declare
  v_admin platform.super_admin_users%rowtype;
  v_database control.operational_databases%rowtype;
  v_database_key text := lower(nullif(btrim(p_database_key), ''));
  v_display_name text;
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
begin
  select *
  into v_admin
  from platform.super_admin_users
  where id = p_super_admin_user_id
    and is_active = true;

  if not found then
    raise exception 'active super admin not found';
  end if;

  if v_database_key is null then
    raise exception 'p_database_key is required';
  end if;

  v_display_name := coalesce(nullif(btrim(p_display_name), ''), v_database_key);

  insert into control.operational_databases (
    database_key,
    display_name,
    description,
    is_active,
    is_accepting_new_cafes,
    created_at,
    updated_at
  )
  values (
    v_database_key,
    v_display_name,
    v_description,
    coalesce(p_is_active, true),
    coalesce(p_is_accepting_new_cafes, true),
    now(),
    now()
  )
  on conflict (database_key)
  do update set display_name = excluded.display_name,
                description = excluded.description,
                is_active = excluded.is_active,
                is_accepting_new_cafes = excluded.is_accepting_new_cafes,
                updated_at = now()
  returning * into v_database;

  return jsonb_build_object(
    'ok', true,
    'database_key', v_database.database_key,
    'display_name', coalesce(nullif(btrim(v_database.display_name), ''), v_database.database_key),
    'description', v_database.description,
    'is_active', v_database.is_active,
    'is_accepting_new_cafes', v_database.is_accepting_new_cafes,
    'created_at', v_database.created_at,
    'updated_at', v_database.updated_at
  );
end;
$$;

commit;
-- <<< 0039_control_plane_operational_database_registration.sql

-- >>> 0041_support_access_on_demand.sql
begin;

alter table platform.support_access_grants
  add column if not exists support_message_id uuid null references platform.support_messages(id) on delete set null;

alter table platform.support_messages
  add column if not exists support_access_requested boolean not null default false;

alter table platform.support_messages
  add column if not exists support_access_status text not null default 'not_requested';

alter table platform.support_messages
  add column if not exists support_access_requested_at timestamptz null;

alter table platform.support_messages
  add column if not exists support_access_granted_at timestamptz null;

alter table platform.support_messages
  add column if not exists support_access_expires_at timestamptz null;

alter table platform.support_messages
  add column if not exists support_access_revoked_at timestamptz null;

alter table platform.support_messages
  add column if not exists support_access_granted_by_super_admin_user_id uuid null references platform.super_admin_users(id) on delete set null;

alter table platform.support_messages
  add column if not exists support_access_note text null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chk_platform_support_messages_access_status'
      and conrelid = 'platform.support_messages'::regclass
  ) then
    alter table platform.support_messages
      add constraint chk_platform_support_messages_access_status
      check (
        support_access_status in ('not_requested', 'requested', 'granted', 'revoked', 'expired')
      );
  end if;
end;
$$;

create index if not exists idx_platform_support_access_grants_super_admin_cafe_active
  on platform.support_access_grants(super_admin_user_id, cafe_id, is_active, created_at desc);

create index if not exists idx_platform_support_access_grants_message_active
  on platform.support_access_grants(support_message_id, is_active, created_at desc)
  where support_message_id is not null;

create index if not exists idx_platform_support_messages_access_status_created_at
  on platform.support_messages(support_access_status, created_at desc);

update platform.support_messages
set support_access_status = case when support_access_requested then 'requested' else 'not_requested' end
where support_access_status is null
   or support_access_status = '';

create or replace function app.has_platform_support_access(
  p_cafe_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, ops, platform, app
as $$
  select exists (
    select 1
    from platform.support_access_grants g
    where g.super_admin_user_id = app.current_super_admin_user_id()
      and g.cafe_id = p_cafe_id
      and g.is_active = true
      and g.revoked_at is null
      and (g.expires_at is null or g.expires_at > now())
  )
$$;

create or replace function app.can_access_cafe(
  p_cafe_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, ops, platform, app
as $$
  select p_cafe_id is not null
    and (
      app.current_cafe_id() = p_cafe_id
      or app.has_platform_support_access(p_cafe_id)
    )
$$;

create or replace function public.platform_grant_support_access_from_message(
  p_super_admin_user_id uuid,
  p_support_message_id uuid,
  p_notes text default null,
  p_duration_hours integer default 4
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, platform, app
as $$
declare
  v_admin platform.super_admin_users%rowtype;
  v_message platform.support_messages%rowtype;
  v_now timestamptz := now();
  v_duration_hours integer;
  v_expires_at timestamptz;
  v_grant_id uuid;
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
  into v_message
  from platform.support_messages
  where id = p_support_message_id;

  if not found then
    raise exception 'support_message_not_found';
  end if;

  if v_message.cafe_id is null then
    raise exception 'support_message_requires_cafe';
  end if;

  if coalesce(v_message.support_access_requested, false) = false then
    raise exception 'support_access_not_requested';
  end if;

  v_duration_hours := coalesce(p_duration_hours, 4);
  if v_duration_hours < 1 or v_duration_hours > 72 then
    raise exception 'invalid_support_access_duration';
  end if;

  v_expires_at := v_now + make_interval(hours => v_duration_hours);

  update platform.support_access_grants
  set is_active = false,
      revoked_at = v_now
  where super_admin_user_id = p_super_admin_user_id
    and cafe_id = v_message.cafe_id
    and is_active = true
    and revoked_at is null;

  insert into platform.support_access_grants (
    super_admin_user_id,
    cafe_id,
    support_message_id,
    is_active,
    notes,
    expires_at,
    created_at
  )
  values (
    p_super_admin_user_id,
    v_message.cafe_id,
    v_message.id,
    true,
    nullif(btrim(p_notes), ''),
    v_expires_at,
    v_now
  )
  returning id into v_grant_id;

  update platform.support_messages
  set support_access_status = 'granted',
      support_access_requested = true,
      support_access_requested_at = coalesce(support_access_requested_at, v_now),
      support_access_granted_at = v_now,
      support_access_expires_at = v_expires_at,
      support_access_revoked_at = null,
      support_access_granted_by_super_admin_user_id = p_super_admin_user_id,
      support_access_note = nullif(btrim(p_notes), ''),
      status = case when status = 'new' then 'in_progress' else status end,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'support_access_grant_id', v_grant_id,
        'support_access_duration_hours', v_duration_hours
      )
  where id = v_message.id;

  return jsonb_build_object(
    'ok', true,
    'support_access_grant_id', v_grant_id,
    'cafe_id', v_message.cafe_id,
    'support_message_id', v_message.id,
    'expires_at', v_expires_at,
    'duration_hours', v_duration_hours
  );
end;
$$;

create or replace function public.platform_revoke_support_access_from_message(
  p_super_admin_user_id uuid,
  p_support_message_id uuid,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, platform, app
as $$
declare
  v_admin platform.super_admin_users%rowtype;
  v_message platform.support_messages%rowtype;
  v_now timestamptz := now();
  v_revoked_count integer := 0;
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
  into v_message
  from platform.support_messages
  where id = p_support_message_id;

  if not found then
    raise exception 'support_message_not_found';
  end if;

  if v_message.cafe_id is null then
    raise exception 'support_message_requires_cafe';
  end if;

  update platform.support_access_grants
  set is_active = false,
      revoked_at = v_now,
      notes = coalesce(nullif(btrim(p_notes), ''), notes)
  where super_admin_user_id = p_super_admin_user_id
    and cafe_id = v_message.cafe_id
    and is_active = true
    and revoked_at is null;

  get diagnostics v_revoked_count = row_count;

  update platform.support_messages
  set support_access_status = case
        when support_access_requested then 'revoked'
        else 'not_requested'
      end,
      support_access_revoked_at = v_now,
      support_access_expires_at = case
        when support_access_expires_at is not null and support_access_expires_at < v_now then support_access_expires_at
        else v_now
      end,
      support_access_note = coalesce(nullif(btrim(p_notes), ''), support_access_note),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'support_access_revoked_by', p_super_admin_user_id,
        'support_access_revoked_count', v_revoked_count
      )
  where id = v_message.id;

  return jsonb_build_object(
    'ok', true,
    'support_message_id', v_message.id,
    'cafe_id', v_message.cafe_id,
    'revoked_count', v_revoked_count
  );
end;
$$;

comment on function public.platform_grant_support_access_from_message(uuid, uuid, text, integer) is
  'Grant temporary audited support access only when a cafe-linked support message explicitly requested it.';

comment on function public.platform_revoke_support_access_from_message(uuid, uuid, text) is
  'Revoke previously granted support access for the cafe referenced by a support message.';

commit;
-- <<< 0041_support_access_on_demand.sql

-- >>> 0043_control_plane_owner_password_setup_flow.sql
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
-- <<< 0043_control_plane_owner_password_setup_flow.sql

-- >>> 0044_control_plane_owner_password_setup_preflight.sql
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
-- <<< 0044_control_plane_owner_password_setup_preflight.sql

-- >>> 0048_control_plane_scale_discipline.sql
begin;

alter table control.operational_databases
  add column if not exists max_load_units integer not null default 400,
  add column if not exists warning_load_percent numeric(5,2) not null default 75,
  add column if not exists critical_load_percent numeric(5,2) not null default 90,
  add column if not exists max_cafes integer,
  add column if not exists max_heavy_cafes integer,
  add column if not exists scale_notes text;

alter table control.cafe_database_bindings
  add column if not exists cafe_load_tier text not null default 'small',
  add column if not exists load_units integer not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_control_operational_databases_max_load_units_positive'
      and conrelid = 'control.operational_databases'::regclass
  ) then
    alter table control.operational_databases
      add constraint chk_control_operational_databases_max_load_units_positive
      check (max_load_units > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_control_operational_databases_warning_percent'
      and conrelid = 'control.operational_databases'::regclass
  ) then
    alter table control.operational_databases
      add constraint chk_control_operational_databases_warning_percent
      check (warning_load_percent > 0 and warning_load_percent < 100);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_control_operational_databases_critical_percent'
      and conrelid = 'control.operational_databases'::regclass
  ) then
    alter table control.operational_databases
      add constraint chk_control_operational_databases_critical_percent
      check (critical_load_percent > 0 and critical_load_percent <= 100 and critical_load_percent > warning_load_percent);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_control_operational_databases_max_cafes_positive'
      and conrelid = 'control.operational_databases'::regclass
  ) then
    alter table control.operational_databases
      add constraint chk_control_operational_databases_max_cafes_positive
      check (max_cafes is null or max_cafes > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_control_operational_databases_max_heavy_positive'
      and conrelid = 'control.operational_databases'::regclass
  ) then
    alter table control.operational_databases
      add constraint chk_control_operational_databases_max_heavy_positive
      check (max_heavy_cafes is null or max_heavy_cafes > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_control_cafe_database_bindings_load_tier'
      and conrelid = 'control.cafe_database_bindings'::regclass
  ) then
    alter table control.cafe_database_bindings
      add constraint chk_control_cafe_database_bindings_load_tier
      check (cafe_load_tier in ('small', 'medium', 'heavy', 'enterprise'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_control_cafe_database_bindings_load_units_positive'
      and conrelid = 'control.cafe_database_bindings'::regclass
  ) then
    alter table control.cafe_database_bindings
      add constraint chk_control_cafe_database_bindings_load_units_positive
      check (load_units > 0);
  end if;
end $$;

create or replace function public.control_load_units_for_tier(
  p_cafe_load_tier text
)
returns integer
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_tier text := lower(coalesce(nullif(btrim(p_cafe_load_tier), ''), 'small'));
begin
  if v_tier = 'medium' then
    return 3;
  elsif v_tier = 'heavy' then
    return 8;
  elsif v_tier = 'enterprise' then
    return 15;
  end if;

  return 1;
end;
$$;

update control.cafe_database_bindings
set cafe_load_tier = case
      when cafe_load_tier in ('small', 'medium', 'heavy', 'enterprise') then cafe_load_tier
      else 'small'
    end,
    load_units = public.control_load_units_for_tier(cafe_load_tier);

update control.operational_databases
set max_load_units = coalesce(max_load_units, 400),
    warning_load_percent = coalesce(warning_load_percent, 75),
    critical_load_percent = coalesce(critical_load_percent, 90);

create index if not exists idx_control_cafe_database_bindings_load_tier
  on control.cafe_database_bindings(database_key, cafe_load_tier, updated_at desc);

create or replace function public.control_list_operational_databases()
returns jsonb
language sql
security definer
set search_path = public, control
as $$
  with binding_stats as (
    select
      b.database_key,
      count(*)::bigint as cafe_count,
      sum(b.load_units)::bigint as total_load_units,
      count(*) filter (where b.cafe_load_tier = 'small')::bigint as small_cafe_count,
      count(*) filter (where b.cafe_load_tier = 'medium')::bigint as medium_cafe_count,
      count(*) filter (where b.cafe_load_tier = 'heavy')::bigint as heavy_cafe_count,
      count(*) filter (where b.cafe_load_tier = 'enterprise')::bigint as enterprise_cafe_count
    from control.cafe_database_bindings b
    group by b.database_key
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'database_key', od.database_key,
        'display_name', coalesce(nullif(btrim(od.display_name), ''), od.database_key),
        'description', od.description,
        'is_active', od.is_active,
        'is_accepting_new_cafes', od.is_accepting_new_cafes,
        'cafe_count', coalesce(stats.cafe_count, 0),
        'total_load_units', coalesce(stats.total_load_units, 0),
        'max_load_units', od.max_load_units,
        'warning_load_percent', od.warning_load_percent,
        'critical_load_percent', od.critical_load_percent,
        'load_percent', round((coalesce(stats.total_load_units, 0)::numeric * 100) / greatest(od.max_load_units, 1)::numeric, 2),
        'small_cafe_count', coalesce(stats.small_cafe_count, 0),
        'medium_cafe_count', coalesce(stats.medium_cafe_count, 0),
        'heavy_cafe_count', coalesce(stats.heavy_cafe_count, 0),
        'enterprise_cafe_count', coalesce(stats.enterprise_cafe_count, 0),
        'max_cafes', od.max_cafes,
        'max_heavy_cafes', od.max_heavy_cafes,
        'capacity_state', case
          when od.is_active is distinct from true then 'inactive'
          when od.is_accepting_new_cafes is distinct from true then 'draining'
          when od.max_cafes is not null and coalesce(stats.cafe_count, 0) >= od.max_cafes then 'full'
          when od.max_heavy_cafes is not null and coalesce(stats.heavy_cafe_count, 0) >= od.max_heavy_cafes then 'hot'
          when ((coalesce(stats.total_load_units, 0)::numeric * 100) / greatest(od.max_load_units, 1)::numeric) >= od.critical_load_percent then 'critical'
          when ((coalesce(stats.total_load_units, 0)::numeric * 100) / greatest(od.max_load_units, 1)::numeric) >= od.warning_load_percent then 'warning'
          else 'healthy'
        end,
        'scale_notes', od.scale_notes,
        'created_at', od.created_at,
        'updated_at', od.updated_at
      )
      order by
        case
          when od.is_active is distinct from true then 5
          when od.is_accepting_new_cafes is distinct from true then 4
          when od.max_cafes is not null and coalesce(stats.cafe_count, 0) >= od.max_cafes then 3
          when od.max_heavy_cafes is not null and coalesce(stats.heavy_cafe_count, 0) >= od.max_heavy_cafes then 2
          when ((coalesce(stats.total_load_units, 0)::numeric * 100) / greatest(od.max_load_units, 1)::numeric) >= od.critical_load_percent then 1
          else 0
        end asc,
        ((coalesce(stats.total_load_units, 0)::numeric * 100) / greatest(od.max_load_units, 1)::numeric) asc,
        od.created_at asc,
        od.database_key asc
    ),
    '[]'::jsonb
  )
  from control.operational_databases od
  left join binding_stats stats on stats.database_key = od.database_key;
$$;


create or replace function public.control_get_cafe_database_binding(
  p_cafe_id uuid
)
returns jsonb
language sql
security definer
set search_path = public, control
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'cafe_id', b.cafe_id,
        'database_key', b.database_key,
        'binding_source', b.binding_source,
        'cafe_load_tier', b.cafe_load_tier,
        'load_units', b.load_units,
        'created_at', b.created_at,
        'updated_at', b.updated_at
      )
      from control.cafe_database_bindings b
      where b.cafe_id = p_cafe_id
    ),
    jsonb_build_object(
      'cafe_id', p_cafe_id,
      'database_key', public.control_get_default_operational_database_key(),
      'binding_source', 'default',
      'cafe_load_tier', 'small',
      'load_units', public.control_load_units_for_tier('small'),
      'created_at', null,
      'updated_at', null
    )
  );
$$;

create or replace function public.control_list_cafe_database_bindings()
returns jsonb
language sql
security definer
set search_path = public, control
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'cafe_id', b.cafe_id,
        'database_key', b.database_key,
        'binding_source', b.binding_source,
        'cafe_load_tier', b.cafe_load_tier,
        'load_units', b.load_units,
        'created_at', b.created_at,
        'updated_at', b.updated_at
      )
      order by b.created_at asc, b.cafe_id asc
    ),
    '[]'::jsonb
  )
  from control.cafe_database_bindings b;
$$;

drop function if exists public.control_assign_cafe_database(uuid, uuid, text, text);

create or replace function public.control_assign_cafe_database(
  p_super_admin_user_id uuid,
  p_cafe_id uuid,
  p_database_key text,
  p_binding_source text default 'manual',
  p_cafe_load_tier text default 'small'
)
returns jsonb
language plpgsql
security definer
set search_path = public, control, platform, ops
as $$
declare
  v_admin platform.super_admin_users%rowtype;
  v_database_key text := lower(nullif(btrim(p_database_key), ''));
  v_binding_source text := lower(coalesce(nullif(btrim(p_binding_source), ''), 'manual'));
  v_cafe_load_tier text := lower(coalesce(nullif(btrim(p_cafe_load_tier), ''), 'small'));
  v_load_units integer;
begin
  select *
  into v_admin
  from platform.super_admin_users
  where id = p_super_admin_user_id
    and is_active = true;

  if not found then
    raise exception 'active super admin not found';
  end if;

  if v_database_key is null then
    raise exception 'p_database_key is required';
  end if;

  if not exists (
    select 1
    from ops.cafes c
    where c.id = p_cafe_id
  ) then
    raise exception 'cafe_not_found';
  end if;

  if v_binding_source not in ('manual', 'default', 'backfill', 'migration', 'recommended') then
    raise exception 'invalid binding source';
  end if;

  if v_cafe_load_tier not in ('small', 'medium', 'heavy', 'enterprise') then
    raise exception 'invalid cafe load tier';
  end if;

  if not exists (
    select 1
    from control.operational_databases od
    where od.database_key = v_database_key
      and od.is_active = true
  ) then
    raise exception 'operational_database_not_found';
  end if;

  v_load_units := public.control_load_units_for_tier(v_cafe_load_tier);

  insert into control.cafe_database_bindings (
    cafe_id,
    database_key,
    binding_source,
    cafe_load_tier,
    load_units,
    created_at,
    updated_at
  ) values (
    p_cafe_id,
    v_database_key,
    v_binding_source,
    v_cafe_load_tier,
    v_load_units,
    now(),
    now()
  )
  on conflict (cafe_id)
  do update set database_key = excluded.database_key,
                binding_source = excluded.binding_source,
                cafe_load_tier = excluded.cafe_load_tier,
                load_units = excluded.load_units,
                updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'cafe_id', p_cafe_id,
    'database_key', v_database_key,
    'binding_source', v_binding_source,
    'cafe_load_tier', v_cafe_load_tier,
    'load_units', v_load_units
  );
end;
$$;

create or replace function public.control_select_operational_database_key(
  p_cafe_load_tier text default 'small'
)
returns text
language sql
security definer
set search_path = public, control
as $$
  with requested as (
    select
      lower(coalesce(nullif(btrim(p_cafe_load_tier), ''), 'small')) as cafe_load_tier,
      public.control_load_units_for_tier(p_cafe_load_tier) as requested_load_units,
      case when lower(coalesce(nullif(btrim(p_cafe_load_tier), ''), 'small')) in ('heavy', 'enterprise') then 1 else 0 end as requested_heavy_slots
  ),
  binding_stats as (
    select
      b.database_key,
      count(*)::bigint as cafe_count,
      sum(b.load_units)::bigint as total_load_units,
      count(*) filter (where b.cafe_load_tier in ('heavy', 'enterprise'))::bigint as heavy_cafe_count
    from control.cafe_database_bindings b
    group by b.database_key
  ),
  ranked as (
    select
      od.database_key,
      coalesce(stats.cafe_count, 0) as cafe_count,
      coalesce(stats.total_load_units, 0) as total_load_units,
      coalesce(stats.heavy_cafe_count, 0) as heavy_cafe_count,
      round(((coalesce(stats.total_load_units, 0) + req.requested_load_units)::numeric * 100) / greatest(od.max_load_units, 1)::numeric, 2) as projected_load_percent,
      case
        when od.is_active is distinct from true then 5
        when od.is_accepting_new_cafes is distinct from true then 4
        when od.max_cafes is not null and coalesce(stats.cafe_count, 0) >= od.max_cafes then 3
        when od.max_heavy_cafes is not null and (coalesce(stats.heavy_cafe_count, 0) + req.requested_heavy_slots) > od.max_heavy_cafes then 2
        when (coalesce(stats.total_load_units, 0) + req.requested_load_units) > od.max_load_units then 1
        else 0
      end as penalty_rank,
      od.created_at
    from control.operational_databases od
    cross join requested req
    left join binding_stats stats on stats.database_key = od.database_key
    where od.is_active = true
  )
  select ranked.database_key
  from ranked
  where penalty_rank = 0
  order by projected_load_percent asc, cafe_count asc, heavy_cafe_count asc, created_at asc, database_key asc
  limit 1;
$$;

create or replace function public.control_recommend_operational_database(
  p_super_admin_user_id uuid,
  p_cafe_load_tier text default 'small'
)
returns jsonb
language plpgsql
security definer
set search_path = public, control, platform
as $$
declare
  v_admin platform.super_admin_users%rowtype;
  v_cafe_load_tier text := lower(coalesce(nullif(btrim(p_cafe_load_tier), ''), 'small'));
  v_database_key text;
  v_item jsonb;
begin
  select *
  into v_admin
  from platform.super_admin_users
  where id = p_super_admin_user_id
    and is_active = true;

  if not found then
    raise exception 'active super admin not found';
  end if;

  if v_cafe_load_tier not in ('small', 'medium', 'heavy', 'enterprise') then
    raise exception 'invalid cafe load tier';
  end if;

  v_database_key := public.control_select_operational_database_key(v_cafe_load_tier);

  if v_database_key is null then
    return jsonb_build_object(
      'ok', false,
      'cafe_load_tier', v_cafe_load_tier,
      'requested_load_units', public.control_load_units_for_tier(v_cafe_load_tier),
      'reason', 'NO_HEALTHY_DATABASE_AVAILABLE'
    );
  end if;

  select item
  into v_item
  from jsonb_array_elements(public.control_list_operational_databases()) as item
  where item ->> 'database_key' = v_database_key
  limit 1;

  return jsonb_build_object(
    'ok', true,
    'cafe_load_tier', v_cafe_load_tier,
    'requested_load_units', public.control_load_units_for_tier(v_cafe_load_tier),
    'database_key', v_database_key,
    'database', coalesce(v_item, '{}'::jsonb)
  );
end;
$$;

create or replace function public.control_set_operational_database_scale_policy(
  p_super_admin_user_id uuid,
  p_database_key text,
  p_max_load_units integer default null,
  p_warning_load_percent numeric default null,
  p_critical_load_percent numeric default null,
  p_max_cafes integer default null,
  p_max_heavy_cafes integer default null,
  p_is_accepting_new_cafes boolean default null,
  p_scale_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, control, platform
as $$
declare
  v_admin platform.super_admin_users%rowtype;
  v_database_key text := lower(nullif(btrim(p_database_key), ''));
  v_record control.operational_databases%rowtype;
begin
  select *
  into v_admin
  from platform.super_admin_users
  where id = p_super_admin_user_id
    and is_active = true;

  if not found then
    raise exception 'active super admin not found';
  end if;

  if v_database_key is null then
    raise exception 'p_database_key is required';
  end if;

  if p_max_load_units is not null and p_max_load_units <= 0 then
    raise exception 'p_max_load_units must be > 0';
  end if;

  if p_warning_load_percent is not null and (p_warning_load_percent <= 0 or p_warning_load_percent >= 100) then
    raise exception 'p_warning_load_percent must be between 0 and 100';
  end if;

  if p_critical_load_percent is not null and (p_critical_load_percent <= 0 or p_critical_load_percent > 100) then
    raise exception 'p_critical_load_percent must be between 0 and 100';
  end if;

  if p_warning_load_percent is not null and p_critical_load_percent is not null and p_critical_load_percent <= p_warning_load_percent then
    raise exception 'p_critical_load_percent must be greater than p_warning_load_percent';
  end if;

  if p_max_cafes is not null and p_max_cafes <= 0 then
    raise exception 'p_max_cafes must be > 0';
  end if;

  if p_max_heavy_cafes is not null and p_max_heavy_cafes <= 0 then
    raise exception 'p_max_heavy_cafes must be > 0';
  end if;

  update control.operational_databases od
  set max_load_units = coalesce(p_max_load_units, od.max_load_units),
      warning_load_percent = coalesce(p_warning_load_percent, od.warning_load_percent),
      critical_load_percent = coalesce(p_critical_load_percent, od.critical_load_percent),
      max_cafes = p_max_cafes,
      max_heavy_cafes = p_max_heavy_cafes,
      is_accepting_new_cafes = coalesce(p_is_accepting_new_cafes, od.is_accepting_new_cafes),
      scale_notes = case when p_scale_notes is null then od.scale_notes else nullif(btrim(p_scale_notes), '') end,
      updated_at = now()
  where od.database_key = v_database_key
  returning * into v_record;

  if not found then
    raise exception 'operational_database_not_found';
  end if;

  return jsonb_build_object(
    'ok', true,
    'database_key', v_record.database_key,
    'max_load_units', v_record.max_load_units,
    'warning_load_percent', v_record.warning_load_percent,
    'critical_load_percent', v_record.critical_load_percent,
    'max_cafes', v_record.max_cafes,
    'max_heavy_cafes', v_record.max_heavy_cafes,
    'is_accepting_new_cafes', v_record.is_accepting_new_cafes,
    'scale_notes', v_record.scale_notes,
    'updated_at', v_record.updated_at
  );
end;
$$;

create or replace function public.control_set_cafe_load_tier(
  p_super_admin_user_id uuid,
  p_cafe_id uuid,
  p_cafe_load_tier text
)
returns jsonb
language plpgsql
security definer
set search_path = public, control, platform
as $$
declare
  v_admin platform.super_admin_users%rowtype;
  v_cafe_load_tier text := lower(coalesce(nullif(btrim(p_cafe_load_tier), ''), 'small'));
  v_binding control.cafe_database_bindings%rowtype;
begin
  select *
  into v_admin
  from platform.super_admin_users
  where id = p_super_admin_user_id
    and is_active = true;

  if not found then
    raise exception 'active super admin not found';
  end if;

  if v_cafe_load_tier not in ('small', 'medium', 'heavy', 'enterprise') then
    raise exception 'invalid cafe load tier';
  end if;

  update control.cafe_database_bindings b
  set cafe_load_tier = v_cafe_load_tier,
      load_units = public.control_load_units_for_tier(v_cafe_load_tier),
      updated_at = now()
  where b.cafe_id = p_cafe_id
  returning * into v_binding;

  if not found then
    raise exception 'cafe_database_binding_not_found';
  end if;

  return jsonb_build_object(
    'ok', true,
    'cafe_id', v_binding.cafe_id,
    'database_key', v_binding.database_key,
    'cafe_load_tier', v_binding.cafe_load_tier,
    'load_units', v_binding.load_units,
    'updated_at', v_binding.updated_at
  );
end;
$$;

drop function if exists public.platform_create_cafe_with_owner(uuid, text, text, text, text, text, timestamptz, timestamptz, integer, text, numeric, boolean, text, text);

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

  if v_cafe_load_tier not in ('small', 'medium', 'heavy', 'enterprise') then
    raise exception 'invalid cafe load tier';
  end if;

  v_database_key := lower(coalesce(nullif(btrim(p_database_key), ''), public.control_select_operational_database_key(v_cafe_load_tier), public.control_get_default_operational_database_key()));
  v_binding_source := case when p_database_key is null or nullif(btrim(p_database_key), '') is null then 'recommended' else 'manual' end;

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

  insert into control.cafe_database_bindings (
    cafe_id,
    database_key,
    binding_source,
    cafe_load_tier,
    load_units,
    created_at,
    updated_at
  ) values (
    v_cafe_id,
    v_database_key,
    v_binding_source,
    v_cafe_load_tier,
    public.control_load_units_for_tier(v_cafe_load_tier),
    now(),
    now()
  );

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
    'load_units', public.control_load_units_for_tier(v_cafe_load_tier)
  );
end;
$$;

commit;
-- <<< 0048_control_plane_scale_discipline.sql

-- >>> 0050_restore_owner_activation_code_flow_after_scale_discipline.sql
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
-- <<< 0050_restore_owner_activation_code_flow_after_scale_discipline.sql

-- >>> 0056_control_plane_runtime_activity_read_model.sql
begin;

create table if not exists control.cafe_runtime_status_read_model (
  cafe_id uuid primary key references ops.cafes(id) on delete cascade,
  database_key text null references control.operational_databases(database_key) on delete set null,
  last_activity_at timestamptz null,
  usage_state text null check (usage_state is null or usage_state in ('active_now', 'active_today', 'active_recently', 'inactive', 'external_runtime')),
  has_open_shift boolean null,
  open_shift_id uuid null,
  open_shift_kind text null,
  open_shift_business_date date null,
  open_shift_opened_at timestamptz null,
  last_shift_closed_at timestamptz null,
  source_updated_at timestamptz null,
  source_kind text not null default 'manual_sync' check (source_kind in ('manual_sync', 'runtime_push', 'control_repair')),
  notes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_control_cafe_runtime_status_read_model_database_updated
  on control.cafe_runtime_status_read_model (database_key, updated_at desc);

create or replace function public.control_upsert_cafe_runtime_status_read_model(
  p_cafe_id uuid,
  p_database_key text default null,
  p_last_activity_at timestamptz default null,
  p_usage_state text default null,
  p_has_open_shift boolean default null,
  p_open_shift_id uuid default null,
  p_open_shift_kind text default null,
  p_open_shift_business_date date default null,
  p_open_shift_opened_at timestamptz default null,
  p_last_shift_closed_at timestamptz default null,
  p_source_updated_at timestamptz default null,
  p_source_kind text default 'runtime_push',
  p_notes jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, control, ops
as $$
declare
  v_database_key text := lower(nullif(btrim(p_database_key), ''));
  v_source_kind text := lower(coalesce(nullif(btrim(p_source_kind), ''), 'runtime_push'));
  v_row control.cafe_runtime_status_read_model%rowtype;
begin
  if p_cafe_id is null then
    raise exception 'p_cafe_id is required';
  end if;

  if not exists (select 1 from ops.cafes c where c.id = p_cafe_id) then
    raise exception 'cafe_not_found';
  end if;

  if v_database_key is not null and not exists (
    select 1
    from control.operational_databases od
    where od.database_key = v_database_key
  ) then
    raise exception 'operational_database_not_found';
  end if;

  if v_source_kind not in ('manual_sync', 'runtime_push', 'control_repair') then
    raise exception 'invalid_source_kind';
  end if;

  insert into control.cafe_runtime_status_read_model (
    cafe_id,
    database_key,
    last_activity_at,
    usage_state,
    has_open_shift,
    open_shift_id,
    open_shift_kind,
    open_shift_business_date,
    open_shift_opened_at,
    last_shift_closed_at,
    source_updated_at,
    source_kind,
    notes,
    created_at,
    updated_at
  ) values (
    p_cafe_id,
    v_database_key,
    p_last_activity_at,
    case
      when p_usage_state is null then null
      when lower(btrim(p_usage_state)) in ('active_now', 'active_today', 'active_recently', 'inactive', 'external_runtime') then lower(btrim(p_usage_state))
      else null
    end,
    p_has_open_shift,
    p_open_shift_id,
    nullif(btrim(p_open_shift_kind), ''),
    p_open_shift_business_date,
    p_open_shift_opened_at,
    p_last_shift_closed_at,
    p_source_updated_at,
    v_source_kind,
    coalesce(p_notes, '{}'::jsonb),
    now(),
    now()
  )
  on conflict (cafe_id) do update set
    database_key = excluded.database_key,
    last_activity_at = excluded.last_activity_at,
    usage_state = excluded.usage_state,
    has_open_shift = excluded.has_open_shift,
    open_shift_id = excluded.open_shift_id,
    open_shift_kind = excluded.open_shift_kind,
    open_shift_business_date = excluded.open_shift_business_date,
    open_shift_opened_at = excluded.open_shift_opened_at,
    last_shift_closed_at = excluded.last_shift_closed_at,
    source_updated_at = excluded.source_updated_at,
    source_kind = excluded.source_kind,
    notes = excluded.notes,
    updated_at = now()
  returning * into v_row;

  return jsonb_build_object(
    'cafe_id', v_row.cafe_id,
    'database_key', v_row.database_key,
    'last_activity_at', v_row.last_activity_at,
    'usage_state', v_row.usage_state,
    'has_open_shift', v_row.has_open_shift,
    'open_shift_id', v_row.open_shift_id,
    'open_shift_kind', v_row.open_shift_kind,
    'open_shift_business_date', v_row.open_shift_business_date,
    'open_shift_opened_at', v_row.open_shift_opened_at,
    'last_shift_closed_at', v_row.last_shift_closed_at,
    'source_updated_at', v_row.source_updated_at,
    'source_kind', v_row.source_kind,
    'notes', v_row.notes,
    'updated_at', v_row.updated_at
  );
end;
$$;

grant execute on function public.control_upsert_cafe_runtime_status_read_model(uuid, text, timestamptz, text, boolean, uuid, text, date, timestamptz, timestamptz, timestamptz, text, jsonb) to service_role;

create or replace function public.platform_list_cafes()
returns jsonb
language sql
security definer
set search_path = public, ops, platform, control
as $$
  with latest_subscription as (
    select distinct on (s.cafe_id)
      s.cafe_id,
      s.id,
      s.starts_at,
      s.ends_at,
      s.grace_days,
      s.status,
      s.amount_paid,
      s.is_complimentary,
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
  ), local_last_activity as (
    select
      activity.cafe_id,
      max(activity.activity_at) as last_activity_at
    from (
      select cafe_id, max(created_at) as activity_at from ops.audit_events group by cafe_id
      union all
      select cafe_id, max(opened_at) as activity_at from ops.shifts group by cafe_id
      union all
      select cafe_id, max(opened_at) as activity_at from ops.service_sessions group by cafe_id
      union all
      select cafe_id, max(created_at) as activity_at from ops.orders group by cafe_id
      union all
      select cafe_id, max(created_at) as activity_at from ops.payments group by cafe_id
      union all
      select cafe_id, max(created_at) as activity_at from ops.complaints group by cafe_id
      union all
      select cafe_id, max(created_at) as activity_at from ops.order_item_issues group by cafe_id
    ) activity
    group by activity.cafe_id
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by x.last_activity_at desc nulls last, x.created_at desc), '[]'::jsonb)
  from (
    select
      c.id,
      c.slug,
      c.display_name,
      c.is_active,
      c.created_at,
      coalesce(rm.last_activity_at, la.last_activity_at) as last_activity_at,
      coalesce(rm.usage_state, case
        when la.last_activity_at is not null and la.last_activity_at >= now() - interval '24 hours' then 'active_today'
        when la.last_activity_at is not null and la.last_activity_at >= now() - interval '7 days' then 'active_recently'
        else 'inactive'
      end) as usage_state,
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
      coalesce((
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
      ), '[]'::jsonb) as owners,
      case
        when ls.cafe_id is null then null
        else jsonb_build_object(
          'id', ls.id,
          'starts_at', ls.starts_at,
          'ends_at', ls.ends_at,
          'grace_days', ls.grace_days,
          'status', ls.status,
          'effective_status', ls.effective_status,
          'amount_paid', ls.amount_paid,
          'is_complimentary', ls.is_complimentary,
          'notes', ls.notes,
          'created_at', ls.created_at,
          'updated_at', ls.updated_at,
          'countdown_seconds', ls.countdown_seconds
        )
      end as current_subscription,
      jsonb_build_object(
        'database_key', b.database_key,
        'binding_source', b.binding_source,
        'binding_updated_at', b.updated_at,
        'runtime_status_available', rm.cafe_id is not null,
        'runtime_status_updated_at', rm.updated_at
      ) as database_binding
    from ops.cafes c
    left join latest_subscription ls on ls.cafe_id = c.id
    left join local_last_activity la on la.cafe_id = c.id
    left join control.cafe_database_bindings b on b.cafe_id = c.id
    left join control.cafe_runtime_status_read_model rm
      on rm.cafe_id = c.id
     and (rm.database_key is null or b.database_key is null or rm.database_key = b.database_key)
  ) x;
$$;

create or replace function public.platform_get_cafe_detail(
  p_super_admin_user_id uuid,
  p_cafe_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, platform, control
as $$
declare
  v_admin platform.super_admin_users%rowtype;
  v_cafe ops.cafes%rowtype;
  v_now timestamptz := now();
  v_result jsonb;
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
    raise exception 'cafe_not_found';
  end if;

  with binding_row as (
    select
      b.cafe_id,
      b.database_key,
      b.binding_source,
      b.created_at,
      b.updated_at
    from control.cafe_database_bindings b
    where b.cafe_id = p_cafe_id
    limit 1
  ), latest_subscription as (
    select distinct on (s.cafe_id)
      s.cafe_id,
      s.id,
      s.starts_at,
      s.ends_at,
      s.grace_days,
      s.status,
      s.amount_paid,
      s.is_complimentary,
      s.notes,
      s.created_at,
      s.updated_at,
      case
        when s.status = 'suspended' then 'suspended'
        when v_now > s.ends_at + make_interval(days => s.grace_days) then 'expired'
        else s.status
      end as effective_status,
      greatest(0, floor(extract(epoch from (s.ends_at - v_now))))::bigint as countdown_seconds
    from platform.cafe_subscriptions s
    where s.cafe_id = p_cafe_id
    order by s.cafe_id, s.created_at desc, s.id desc
  ), owner_rows as (
    select
      ou.id,
      ou.full_name,
      ou.phone,
      ou.owner_label,
      ou.is_active,
      ou.created_at
    from ops.owner_users ou
    where ou.cafe_id = p_cafe_id
    order by ou.created_at asc
  ), local_last_activity as (
    select max(activity_at) as last_activity_at
    from (
      select max(created_at) as activity_at from ops.audit_events where cafe_id = p_cafe_id
      union all
      select max(opened_at) as activity_at from ops.shifts where cafe_id = p_cafe_id
      union all
      select max(opened_at) as activity_at from ops.service_sessions where cafe_id = p_cafe_id
      union all
      select max(created_at) as activity_at from ops.orders where cafe_id = p_cafe_id
      union all
      select max(created_at) as activity_at from ops.payments where cafe_id = p_cafe_id
      union all
      select max(created_at) as activity_at from ops.complaints where cafe_id = p_cafe_id
      union all
      select max(created_at) as activity_at from ops.order_item_issues where cafe_id = p_cafe_id
    ) activity
  ), local_open_shift as (
    select
      s.id,
      s.shift_kind,
      s.business_date,
      s.opened_at
    from ops.shifts s
    where s.cafe_id = p_cafe_id
      and s.status = 'open'
    order by s.business_date desc, s.opened_at desc nulls last
    limit 1
  ), runtime_model as (
    select
      rm.cafe_id,
      rm.database_key,
      rm.last_activity_at,
      rm.usage_state,
      rm.has_open_shift,
      rm.open_shift_id,
      rm.open_shift_kind,
      rm.open_shift_business_date,
      rm.open_shift_opened_at,
      rm.last_shift_closed_at,
      rm.source_updated_at,
      rm.source_kind,
      rm.notes,
      rm.updated_at
    from control.cafe_runtime_status_read_model rm
    where rm.cafe_id = p_cafe_id
      and (not exists (select 1 from binding_row br) or rm.database_key is null or rm.database_key = (select br.database_key from binding_row br limit 1))
    limit 1
  ), effective_activity as (
    select
      coalesce((select rm.last_activity_at from runtime_model rm), (select lla.last_activity_at from local_last_activity lla)) as last_activity_at,
      coalesce((select rm.has_open_shift from runtime_model rm), exists(select 1 from local_open_shift)) as has_open_shift,
      coalesce((select rm.last_shift_closed_at from runtime_model rm), (select max(s.closed_at) from ops.shifts s where s.cafe_id = p_cafe_id and s.status = 'closed')) as last_shift_closed_at,
      coalesce((select rm.usage_state from runtime_model rm), case
        when exists(select 1 from local_open_shift) then 'active_now'
        when (select lla.last_activity_at from local_last_activity lla) is not null and (select lla.last_activity_at from local_last_activity lla) >= v_now - interval '24 hours' then 'active_today'
        when (select lla.last_activity_at from local_last_activity lla) is not null and (select lla.last_activity_at from local_last_activity lla) >= v_now - interval '7 days' then 'active_recently'
        else 'inactive'
      end) as usage_state
  ), attention as (
    select array_remove(array[
      case when v_cafe.is_active = false then 'cafe_disabled' end,
      case when (select count(*) from owner_rows where is_active = true) = 0 then 'no_active_owner' end,
      case when (select count(*) from latest_subscription) = 0 then 'no_subscription' end,
      case when exists (select 1 from latest_subscription ls where ls.effective_status = 'expired')
        and (coalesce((select has_open_shift from effective_activity), false) or ((select last_activity_at from effective_activity) is not null and (select last_activity_at from effective_activity) >= v_now - interval '7 days'))
        then 'expired_but_active'
      end,
      case when exists (select 1 from latest_subscription ls where ls.effective_status = 'suspended')
        and (coalesce((select has_open_shift from effective_activity), false) or ((select last_activity_at from effective_activity) is not null and (select last_activity_at from effective_activity) >= v_now - interval '7 days'))
        then 'suspended_but_active'
      end,
      case when coalesce((select has_open_shift from effective_activity), false)
        and coalesce((select open_shift_opened_at from runtime_model), (select opened_at from local_open_shift)) <= v_now - interval '18 hours' then 'open_shift_too_long' end,
      case when exists (select 1 from latest_subscription ls where ls.effective_status = 'active')
        and not coalesce((select has_open_shift from effective_activity), false)
        and ((select last_activity_at from effective_activity) is null or (select last_activity_at from effective_activity) < v_now - interval '14 days')
        and v_cafe.created_at <= v_now - interval '14 days'
        then 'paid_but_inactive'
      end
    ], null::text) as reasons
  )
  select jsonb_build_object(
    'generated_at', v_now,
    'cafe', jsonb_build_object(
      'id', v_cafe.id,
      'slug', v_cafe.slug,
      'display_name', v_cafe.display_name,
      'is_active', v_cafe.is_active,
      'created_at', v_cafe.created_at,
      'owner_count', (select count(*)::int from owner_rows),
      'active_owner_count', (select count(*)::int from owner_rows where is_active = true),
      'owners', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', r.id,
            'full_name', r.full_name,
            'phone', r.phone,
            'owner_label', r.owner_label,
            'is_active', r.is_active,
            'created_at', r.created_at
          )
          order by r.created_at asc
        )
        from owner_rows r
      ), '[]'::jsonb)
    ),
    'database_binding', (
      select jsonb_build_object(
        'database_key', br.database_key,
        'binding_source', br.binding_source,
        'created_at', br.created_at,
        'updated_at', br.updated_at,
        'runtime_status_available', exists(select 1 from runtime_model),
        'runtime_status_updated_at', (select rm.updated_at from runtime_model rm),
        'runtime_status_source_kind', (select rm.source_kind from runtime_model rm),
        'runtime_status_source_updated_at', (select rm.source_updated_at from runtime_model rm)
      )
      from binding_row br
    ),
    'subscription', jsonb_build_object(
      'current', (
        select case
          when ls.id is null then null
          else jsonb_build_object(
            'id', ls.id,
            'starts_at', ls.starts_at,
            'ends_at', ls.ends_at,
            'grace_days', ls.grace_days,
            'status', ls.status,
            'effective_status', ls.effective_status,
            'amount_paid', ls.amount_paid,
            'is_complimentary', ls.is_complimentary,
            'notes', ls.notes,
            'created_at', ls.created_at,
            'updated_at', ls.updated_at,
            'countdown_seconds', ls.countdown_seconds
          )
        end
        from latest_subscription ls
      ),
      'history', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', s.id,
            'starts_at', s.starts_at,
            'ends_at', s.ends_at,
            'grace_days', s.grace_days,
            'status', s.status,
            'effective_status', case
              when s.status = 'suspended' then 'suspended'
              when v_now > s.ends_at + make_interval(days => s.grace_days) then 'expired'
              else s.status
            end,
            'amount_paid', s.amount_paid,
            'is_complimentary', s.is_complimentary,
            'notes', s.notes,
            'created_at', s.created_at,
            'updated_at', s.updated_at,
            'countdown_seconds', greatest(0, floor(extract(epoch from (s.ends_at - v_now))))::bigint
          )
          order by s.created_at desc, s.id desc
        )
        from (
          select *
          from platform.cafe_subscriptions s
          where s.cafe_id = p_cafe_id
          order by s.created_at desc, s.id desc
          limit 12
        ) s
      ), '[]'::jsonb)
    ),
    'activity', jsonb_build_object(
      'last_activity_at', (select last_activity_at from effective_activity),
      'usage_state', (select usage_state from effective_activity),
      'has_open_shift', (select has_open_shift from effective_activity),
      'open_shift', (
        select case
          when rm.open_shift_id is not null then jsonb_build_object(
            'id', rm.open_shift_id,
            'shift_kind', rm.open_shift_kind,
            'business_date', rm.open_shift_business_date,
            'opened_at', rm.open_shift_opened_at
          )
          when los.id is not null then jsonb_build_object(
            'id', los.id,
            'shift_kind', los.shift_kind,
            'business_date', los.business_date,
            'opened_at', los.opened_at
          )
          else null
        end
        from runtime_model rm
        full outer join local_open_shift los on true
        limit 1
      ),
      'last_shift_closed_at', (select last_shift_closed_at from effective_activity),
      'read_model', jsonb_build_object(
        'source', case when exists(select 1 from runtime_model) then 'control.cafe_runtime_status_read_model' else 'local_ops_tables' end,
        'runtime_status_available', exists(select 1 from runtime_model),
        'runtime_status_updated_at', (select rm.updated_at from runtime_model rm),
        'runtime_status_source_updated_at', (select rm.source_updated_at from runtime_model rm),
        'notes', coalesce((select rm.notes from runtime_model rm), '{}'::jsonb)
      )
    ),
    'billing_follow', jsonb_build_object(
      'payment_state', case
        when (select count(*) from latest_subscription) = 0 then 'trial_or_free'
        when exists (select 1 from latest_subscription ls where ls.effective_status = 'suspended') then 'suspended'
        when exists (select 1 from latest_subscription ls where ls.effective_status = 'expired') then 'overdue'
        when exists (select 1 from latest_subscription ls where ls.effective_status = 'trial') then 'trial_or_free'
        else 'paid_current'
      end,
      'current_subscription_effective_status', (select effective_status from latest_subscription limit 1),
      'subscription_expires_at', (select ends_at from latest_subscription limit 1)
    ),
    'attention', jsonb_build_object(
      'reasons', to_jsonb((select reasons from attention)),
      'scope', 'administrative_only'
    )
  ) into v_result;

  return v_result;
end;
$$;

commit;

-- <<< 0056_control_plane_runtime_activity_read_model.sql
