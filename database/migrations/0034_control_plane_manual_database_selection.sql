begin;

create schema if not exists control;

create table if not exists control.operational_databases (
  database_key text primary key,
  display_name text not null,
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
  database_key text not null references control.operational_databases(database_key) on delete restrict,
  binding_source text not null default 'manual' check (binding_source in ('manual', 'default', 'backfill', 'migration')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_control_cafe_database_bindings_database_key
  on control.cafe_database_bindings(database_key, created_at desc);

create or replace function control.touch_updated_at()
returns trigger
language plpgsql
set search_path = public, control
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_updated_at_operational_databases on control.operational_databases;
create trigger trg_touch_updated_at_operational_databases
  before update on control.operational_databases
  for each row execute function control.touch_updated_at();

drop trigger if exists trg_touch_updated_at_cafe_database_bindings on control.cafe_database_bindings;
create trigger trg_touch_updated_at_cafe_database_bindings
  before update on control.cafe_database_bindings
  for each row execute function control.touch_updated_at();

insert into control.operational_databases (
  database_key,
  display_name,
  description,
  is_active,
  is_accepting_new_cafes
)
values (
  'ops-db-01',
  'Operational DB 01',
  'Default operational database for current production rollout.',
  true,
  true
)
on conflict (database_key)
do update set display_name = excluded.display_name,
              description = excluded.description,
              is_active = excluded.is_active,
              is_accepting_new_cafes = excluded.is_accepting_new_cafes,
              updated_at = now();

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
left join control.cafe_database_bindings b
  on b.cafe_id = c.id
where b.cafe_id is null;

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
  order by case when od.database_key = 'ops-db-01' then 0 else 1 end,
           od.created_at asc,
           od.database_key asc
  limit 1;
$$;

create or replace function public.control_list_operational_databases()
returns jsonb
language sql
security definer
set search_path = public, control
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.is_accepting_new_cafes desc, x.created_at asc, x.database_key asc), '[]'::jsonb)
  from (
    select
      od.database_key,
      od.display_name,
      od.description,
      od.is_active,
      od.is_accepting_new_cafes,
      od.created_at,
      od.updated_at,
      (
        select count(*)::integer
        from control.cafe_database_bindings b
        where b.database_key = od.database_key
      ) as cafe_count
    from control.operational_databases od
  ) x;
$$;

create or replace function public.control_assign_cafe_database(
  p_cafe_id uuid,
  p_database_key text,
  p_binding_source text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, control
as $$
declare
  v_database_key text := lower(nullif(btrim(p_database_key), ''));
  v_binding_source text := lower(coalesce(nullif(btrim(p_binding_source), ''), 'manual'));
  v_database control.operational_databases%rowtype;
begin
  if p_cafe_id is null then
    raise exception 'p_cafe_id is required';
  end if;

  if v_database_key is null then
    raise exception 'p_database_key is required';
  end if;

  if v_binding_source not in ('manual', 'default', 'backfill', 'migration') then
    raise exception 'invalid binding_source';
  end if;

  perform 1
  from ops.cafes c
  where c.id = p_cafe_id;

  if not found then
    raise exception 'cafe not found';
  end if;

  select *
  into v_database
  from control.operational_databases od
  where od.database_key = v_database_key
    and od.is_active = true;

  if not found then
    raise exception 'operational database not found or inactive';
  end if;

  insert into control.cafe_database_bindings (
    cafe_id,
    database_key,
    binding_source,
    created_at,
    updated_at
  )
  values (
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
    'database_key', v_database.database_key,
    'binding_source', v_binding_source
  );
end;
$$;

create or replace function control.ensure_default_cafe_database_binding()
returns trigger
language plpgsql
set search_path = public, ops, control
as $$
declare
  v_default_database_key text;
begin
  if exists (
    select 1
    from control.cafe_database_bindings b
    where b.cafe_id = new.id
  ) then
    return new;
  end if;

  v_default_database_key := public.control_get_default_operational_database_key();

  if v_default_database_key is null then
    raise exception 'no accepting operational database configured';
  end if;

  insert into control.cafe_database_bindings (
    cafe_id,
    database_key,
    binding_source,
    created_at,
    updated_at
  ) values (
    new.id,
    v_default_database_key,
    'default',
    now(),
    now()
  )
  on conflict (cafe_id)
  do nothing;

  return new;
end;
$$;

drop trigger if exists trg_ensure_default_cafe_database_binding on ops.cafes;
create trigger trg_ensure_default_cafe_database_binding
  after insert on ops.cafes
  for each row execute function control.ensure_default_cafe_database_binding();

drop function if exists public.platform_create_cafe_with_owner(uuid, text, text, text, text, text, timestamptz, timestamptz, integer, text, numeric, boolean, text);

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
set search_path = public, ops, platform, control, extensions
as $$
declare
  v_admin platform.super_admin_users%rowtype;
  v_cafe_id uuid;
  v_owner_id uuid;
  v_slug text;
  v_subscription_id uuid;
  v_subscription_status text;
  v_should_create_subscription boolean := p_subscription_starts_at is not null or p_subscription_ends_at is not null;
  v_database_key text := lower(nullif(btrim(coalesce(p_database_key, '')), ''));
  v_default_database_key text;
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

  if v_database_key is null then
    v_default_database_key := public.control_get_default_operational_database_key();
    if v_default_database_key is null then
      raise exception 'no accepting operational database configured';
    end if;
    v_database_key := v_default_database_key;
  end if;

  perform 1
  from control.operational_databases od
  where od.database_key = v_database_key
    and od.is_active = true
    and od.is_accepting_new_cafes = true;

  if not found then
    raise exception 'selected operational database is unavailable';
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

  perform public.control_assign_cafe_database(v_cafe_id, v_database_key, 'manual');

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
          'amount_paid', ls.amount_paid,
          'is_complimentary', ls.is_complimentary,
          'notes', ls.notes,
          'created_at', ls.created_at,
          'updated_at', ls.updated_at,
          'countdown_seconds', ls.countdown_seconds
        )
      end as current_subscription,
      case
        when binding.cafe_id is null then null
        else jsonb_build_object(
          'database_key', binding.database_key,
          'display_name', binding.display_name,
          'is_active', binding.is_active,
          'is_accepting_new_cafes', binding.is_accepting_new_cafes,
          'binding_source', binding.binding_source,
          'created_at', binding.created_at,
          'updated_at', binding.updated_at
        )
      end as database_binding
    from ops.cafes c
    left join latest_subscription ls
      on ls.cafe_id = c.id
    left join last_activity la
      on la.cafe_id = c.id
    left join lateral (
      select
        b.cafe_id,
        b.database_key,
        b.binding_source,
        b.created_at,
        b.updated_at,
        od.display_name,
        od.is_active,
        od.is_accepting_new_cafes
      from control.cafe_database_bindings b
      join control.operational_databases od
        on od.database_key = b.database_key
      where b.cafe_id = c.id
      limit 1
    ) binding on true
  ) x;
$$;

commit;
