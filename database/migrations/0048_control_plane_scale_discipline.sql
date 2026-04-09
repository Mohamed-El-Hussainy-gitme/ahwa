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
