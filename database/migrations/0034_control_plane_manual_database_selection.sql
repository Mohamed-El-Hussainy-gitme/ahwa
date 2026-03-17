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
