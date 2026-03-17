begin;

create schema if not exists control;

create table if not exists control.operational_databases (
  database_key text primary key,
  display_name text not null,
  region_code text null,
  status text not null default 'active'
    check (status in ('active', 'degraded', 'maintenance', 'disabled')),
  is_accepting_new_cafes boolean not null default true,
  is_default boolean not null default false,
  schema_version text null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_control_operational_databases_default_true
  on control.operational_databases (is_default)
  where is_default = true;

create table if not exists control.cafe_database_bindings (
  cafe_id uuid primary key references ops.cafes(id) on delete cascade,
  database_key text not null references control.operational_databases(database_key) on delete restrict,
  bound_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  notes text null
);

create index if not exists idx_control_cafe_database_bindings_database_key
  on control.cafe_database_bindings (database_key, bound_at desc);

create table if not exists control.database_migration_runs (
  database_key text not null references control.operational_databases(database_key) on delete cascade,
  migration_name text not null,
  applied_at timestamptz not null default now(),
  status text not null default 'applied'
    check (status in ('applied', 'failed')),
  error_message text null,
  primary key (database_key, migration_name)
);

create index if not exists idx_control_database_migration_runs_applied_at
  on control.database_migration_runs (applied_at desc);

create table if not exists control.operational_database_health (
  database_key text not null references control.operational_databases(database_key) on delete cascade,
  checked_at timestamptz not null default now(),
  status text not null
    check (status in ('healthy', 'degraded', 'unreachable', 'maintenance')),
  latency_ms integer null check (latency_ms is null or latency_ms >= 0),
  runtime_open_shift_count integer null check (runtime_open_shift_count is null or runtime_open_shift_count >= 0),
  maintenance_status text null,
  details jsonb not null default '{}'::jsonb,
  primary key (database_key, checked_at)
);

create index if not exists idx_control_operational_database_health_latest
  on control.operational_database_health (database_key, checked_at desc);

create or replace function control.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_control_operational_databases_set_updated_at on control.operational_databases;
create trigger trg_control_operational_databases_set_updated_at
before update on control.operational_databases
for each row
execute function control.set_updated_at();

drop trigger if exists trg_control_cafe_database_bindings_set_updated_at on control.cafe_database_bindings;
create trigger trg_control_cafe_database_bindings_set_updated_at
before update on control.cafe_database_bindings
for each row
execute function control.set_updated_at();

insert into control.operational_databases (
  database_key,
  display_name,
  region_code,
  status,
  is_accepting_new_cafes,
  is_default,
  schema_version,
  notes
)
values (
  'ops-db-01',
  'Primary operational database',
  null,
  'active',
  true,
  true,
  '0034',
  'Default single-database operational binding until multi-db routing is enabled.'
)
on conflict (database_key)
do update set display_name = excluded.display_name,
              status = excluded.status,
              is_accepting_new_cafes = excluded.is_accepting_new_cafes,
              is_default = excluded.is_default,
              schema_version = excluded.schema_version,
              notes = excluded.notes,
              updated_at = now();

update control.operational_databases
set is_default = case when database_key = 'ops-db-01' then true else false end,
    updated_at = now()
where is_default is distinct from (database_key = 'ops-db-01');

create or replace function public.control_get_default_operational_database_key()
returns text
language sql
stable
security definer
set search_path = pg_catalog, control
as $$
  select od.database_key
  from control.operational_databases od
  where od.is_default = true
  order by od.created_at asc, od.database_key asc
  limit 1;
$$;

create or replace function public.control_backfill_default_cafe_bindings(
  p_database_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, ops, control
as $$
declare
  v_database_key text := nullif(btrim(p_database_key), '');
  v_rows integer := 0;
begin
  if v_database_key is null then
    v_database_key := public.control_get_default_operational_database_key();
  end if;

  if v_database_key is null then
    raise exception 'default operational database is not configured';
  end if;

  if not exists (
    select 1
    from control.operational_databases od
    where od.database_key = v_database_key
  ) then
    raise exception 'operational database % not found', v_database_key;
  end if;

  insert into control.cafe_database_bindings (
    cafe_id,
    database_key,
    bound_at,
    updated_at,
    notes
  )
  select
    c.id,
    v_database_key,
    now(),
    now(),
    'backfilled default binding'
  from ops.cafes c
  where not exists (
    select 1
    from control.cafe_database_bindings b
    where b.cafe_id = c.id
  );

  get diagnostics v_rows = row_count;

  return jsonb_build_object(
    'ok', true,
    'database_key', v_database_key,
    'bound_rows', v_rows
  );
end;
$$;

create or replace function control.bind_new_cafe_to_default_database()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, ops, control
as $$
declare
  v_database_key text;
begin
  if exists (
    select 1
    from control.cafe_database_bindings b
    where b.cafe_id = new.id
  ) then
    return new;
  end if;

  v_database_key := public.control_get_default_operational_database_key();

  if v_database_key is null then
    raise exception 'default operational database is not configured';
  end if;

  insert into control.cafe_database_bindings (
    cafe_id,
    database_key,
    bound_at,
    updated_at,
    notes
  )
  values (
    new.id,
    v_database_key,
    now(),
    now(),
    'auto default binding on cafe create'
  )
  on conflict (cafe_id)
  do nothing;

  return new;
end;
$$;

drop trigger if exists trg_control_bind_new_cafe_to_default_database on ops.cafes;
create trigger trg_control_bind_new_cafe_to_default_database
after insert on ops.cafes
for each row
execute function control.bind_new_cafe_to_default_database();

select public.control_backfill_default_cafe_bindings('ops-db-01');

create or replace function public.control_get_cafe_database_binding(
  p_cafe_id uuid
)
returns table (
  cafe_id uuid,
  database_key text,
  database_display_name text,
  database_status text,
  is_accepting_new_cafes boolean,
  is_default boolean,
  schema_version text,
  bound_at timestamptz,
  updated_at timestamptz,
  notes text
)
language sql
stable
security definer
set search_path = pg_catalog, public, ops, control
as $$
  select
    b.cafe_id,
    b.database_key,
    od.display_name as database_display_name,
    od.status as database_status,
    od.is_accepting_new_cafes,
    od.is_default,
    od.schema_version,
    b.bound_at,
    b.updated_at,
    b.notes
  from control.cafe_database_bindings b
  join control.operational_databases od
    on od.database_key = b.database_key
  where b.cafe_id = p_cafe_id;
$$;

create or replace function public.control_assign_cafe_database(
  p_super_admin_user_id uuid,
  p_cafe_id uuid,
  p_database_key text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, ops, platform, control
as $$
declare
  v_admin platform.super_admin_users%rowtype;
  v_cafe ops.cafes%rowtype;
  v_database control.operational_databases%rowtype;
  v_database_key text := nullif(btrim(p_database_key), '');
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

  if v_database_key is null then
    raise exception 'p_database_key is required';
  end if;

  select *
  into v_database
  from control.operational_databases
  where database_key = v_database_key;

  if not found then
    raise exception 'operational_database_not_found';
  end if;

  insert into control.cafe_database_bindings (
    cafe_id,
    database_key,
    bound_at,
    updated_at,
    notes
  )
  values (
    p_cafe_id,
    v_database.database_key,
    now(),
    now(),
    coalesce(nullif(btrim(p_notes), ''), 'manual control-plane assignment')
  )
  on conflict (cafe_id)
  do update set database_key = excluded.database_key,
                bound_at = now(),
                updated_at = now(),
                notes = excluded.notes;

  return jsonb_build_object(
    'ok', true,
    'cafe_id', p_cafe_id,
    'database_key', v_database.database_key,
    'database_display_name', v_database.display_name,
    'is_default', v_database.is_default,
    'assigned_at', now()
  );
end;
$$;

create or replace function public.control_platform_overview(
  p_super_admin_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, ops, platform, control
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

  return jsonb_build_object(
    'default_database_key', public.control_get_default_operational_database_key(),
    'unbound_cafe_count', (
      select count(*)::int
      from ops.cafes c
      where not exists (
        select 1
        from control.cafe_database_bindings b
        where b.cafe_id = c.id
      )
    ),
    'operational_databases', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'database_key', x.database_key,
          'display_name', x.display_name,
          'region_code', x.region_code,
          'status', x.status,
          'is_accepting_new_cafes', x.is_accepting_new_cafes,
          'is_default', x.is_default,
          'schema_version', x.schema_version,
          'notes', x.notes,
          'created_at', x.created_at,
          'updated_at', x.updated_at,
          'bound_cafe_count', x.bound_cafe_count,
          'active_bound_cafe_count', x.active_bound_cafe_count,
          'latest_bound_at', x.latest_bound_at,
          'latest_health', x.latest_health
        )
        order by x.is_default desc, x.database_key asc
      )
      from (
        select
          od.database_key,
          od.display_name,
          od.region_code,
          od.status,
          od.is_accepting_new_cafes,
          od.is_default,
          od.schema_version,
          od.notes,
          od.created_at,
          od.updated_at,
          coalesce(bound_counts.bound_cafe_count, 0) as bound_cafe_count,
          coalesce(bound_counts.active_bound_cafe_count, 0) as active_bound_cafe_count,
          bound_counts.latest_bound_at,
          latest_health.latest_health
        from control.operational_databases od
        left join (
          select
            b.database_key,
            count(*)::int as bound_cafe_count,
            count(*) filter (where c.is_active = true)::int as active_bound_cafe_count,
            max(b.bound_at) as latest_bound_at
          from control.cafe_database_bindings b
          join ops.cafes c
            on c.id = b.cafe_id
          group by b.database_key
        ) bound_counts
          on bound_counts.database_key = od.database_key
        left join lateral (
          select jsonb_build_object(
            'checked_at', h.checked_at,
            'status', h.status,
            'latency_ms', h.latency_ms,
            'runtime_open_shift_count', h.runtime_open_shift_count,
            'maintenance_status', h.maintenance_status,
            'details', h.details
          ) as latest_health
          from control.operational_database_health h
          where h.database_key = od.database_key
          order by h.checked_at desc
          limit 1
        ) latest_health on true
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

comment on schema control is 'Platform control-plane metadata for operational database routing and health.';
comment on table control.operational_databases is 'Registry of operational databases that can host cafes.';
comment on table control.cafe_database_bindings is 'Current cafe to operational-database routing bindings.';
comment on table control.database_migration_runs is 'Cross-database migration tracking owned by the control plane.';
comment on table control.operational_database_health is 'Periodic health snapshots for each operational database.';

commit;
