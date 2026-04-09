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
