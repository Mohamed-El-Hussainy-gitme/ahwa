begin;

alter table platform.cafe_subscriptions
  add column if not exists amount_paid numeric(12,2) not null default 0;

alter table platform.cafe_subscriptions
  add column if not exists is_complimentary boolean not null default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chk_platform_cafe_subscriptions_amount_paid_nonnegative'
  ) then
    alter table platform.cafe_subscriptions
      add constraint chk_platform_cafe_subscriptions_amount_paid_nonnegative
      check (amount_paid >= 0);
  end if;
end;
$$;

drop function if exists public.platform_create_cafe_with_owner(uuid, text, text, text, text, text);

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
  p_subscription_notes text default null
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
  v_subscription_id uuid;
  v_subscription_status text;
  v_should_create_subscription boolean := p_subscription_starts_at is not null or p_subscription_ends_at is not null;
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
    'slug', v_slug
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
  p_amount_paid numeric default 0,
  p_is_complimentary boolean default false,
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

  if coalesce(p_amount_paid, 0) < 0 then
    raise exception 'amount_paid must be >= 0';
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
    amount_paid,
    is_complimentary,
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
    coalesce(p_amount_paid, 0),
    coalesce(p_is_complimentary, false),
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
      'amount_paid', coalesce(p_amount_paid, 0),
      'is_complimentary', coalesce(p_is_complimentary, false),
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
      end as current_subscription
    from ops.cafes c
    left join latest_subscription ls
      on ls.cafe_id = c.id
    left join last_activity la
      on la.cafe_id = c.id
  ) x;
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
        'amount_paid', s.amount_paid,
        'is_complimentary', s.is_complimentary,
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

create or replace function public.platform_get_cafe_detail(
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
        when v_now > s.ends_at + make_interval(days => s.grace_days) then 'expired'
        else s.status
      end as effective_status,
      greatest(0, floor(extract(epoch from (s.ends_at - v_now))))::bigint as countdown_seconds
    from platform.cafe_subscriptions s
    where s.cafe_id = p_cafe_id
    order by s.cafe_id, s.created_at desc, s.id desc
  ),
  owner_rows as (
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
  ),
  last_activity as (
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
  ),
  open_shift as (
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
  ),
  usage_state as (
    select case
      when exists(select 1 from open_shift) then 'active_now'
      when (select last_activity_at from last_activity) is not null and (select last_activity_at from last_activity) >= v_now - interval '24 hours' then 'active_today'
      when (select last_activity_at from last_activity) is not null and (select last_activity_at from last_activity) >= v_now - interval '7 days' then 'active_recently'
      else 'inactive'
    end as value
  ),
  attention as (
    select array_remove(array[
      case when v_cafe.is_active = false then 'cafe_disabled' end,
      case when (select count(*) from owner_rows where is_active = true) = 0 then 'no_active_owner' end,
      case when (select count(*) from latest_subscription) = 0 then 'no_subscription' end,
      case when exists (select 1 from latest_subscription ls where ls.effective_status = 'expired')
        and (exists (select 1 from open_shift) or ((select last_activity_at from last_activity) is not null and (select last_activity_at from last_activity) >= v_now - interval '7 days'))
        then 'expired_but_active'
      end,
      case when exists (select 1 from latest_subscription ls where ls.effective_status = 'suspended')
        and (exists (select 1 from open_shift) or ((select last_activity_at from last_activity) is not null and (select last_activity_at from last_activity) >= v_now - interval '7 days'))
        then 'suspended_but_active'
      end,
      case when exists (select 1 from open_shift os where os.opened_at <= v_now - interval '18 hours') then 'open_shift_too_long' end,
      case when exists (select 1 from latest_subscription ls where ls.effective_status = 'active')
        and not exists (select 1 from open_shift)
        and ((select last_activity_at from last_activity) is null or (select last_activity_at from last_activity) < v_now - interval '14 days')
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
      'last_activity_at', (select last_activity_at from last_activity),
      'usage_state', (select value from usage_state),
      'has_open_shift', exists(select 1 from open_shift),
      'open_shift', (
        select case
          when os.id is null then null
          else jsonb_build_object(
            'id', os.id,
            'shift_kind', os.shift_kind,
            'business_date', os.business_date,
            'opened_at', os.opened_at
          )
        end
        from open_shift os
      ),
      'last_shift_closed_at', (
        select max(s.closed_at)
        from ops.shifts s
        where s.cafe_id = p_cafe_id
          and s.status = 'closed'
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

create or replace function public.platform_money_follow_overview(
  p_super_admin_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, platform
as $$
declare
  v_admin platform.super_admin_users%rowtype;
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
      case
        when s.status = 'suspended' then 'suspended'
        when v_now > s.ends_at + make_interval(days => s.grace_days) then 'expired'
        else s.status
      end as effective_status,
      greatest(0, floor(extract(epoch from (s.ends_at - v_now))))::bigint as countdown_seconds
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
    ) activity
    group by activity.cafe_id
  ),
  open_shift_now as (
    select s.cafe_id, true as has_open_shift
    from ops.shifts s
    where s.status = 'open'
    group by s.cafe_id
  ),
  current_watchlist as (
    select
      c.id as cafe_id,
      c.slug,
      c.display_name,
      c.is_active,
      ls.id as subscription_id,
      ls.starts_at,
      ls.ends_at,
      ls.status,
      ls.effective_status,
      ls.amount_paid,
      ls.is_complimentary,
      ls.notes,
      ls.countdown_seconds,
      la.last_activity_at,
      coalesce(os.has_open_shift, false) as has_open_shift,
      case
        when ls.id is null then 'trial_or_free'
        when ls.effective_status = 'suspended' then 'suspended'
        when ls.effective_status = 'expired' then 'overdue'
        when ls.effective_status = 'trial' then 'trial_or_free'
        else 'paid_current'
      end as payment_state
    from ops.cafes c
    left join latest_subscription ls on ls.cafe_id = c.id
    left join last_activity la on la.cafe_id = c.id
    left join open_shift_now os on os.cafe_id = c.id
  )
  select jsonb_build_object(
    'generated_at', v_now,
    'summary', jsonb_build_object(
      'subscriptions_total', (select count(*)::int from platform.cafe_subscriptions),
      'paid_entries', (select count(*)::int from platform.cafe_subscriptions where is_complimentary = false and amount_paid > 0),
      'complimentary_entries', (select count(*)::int from platform.cafe_subscriptions where is_complimentary = true),
      'collected_total', coalesce((select sum(amount_paid) from platform.cafe_subscriptions where is_complimentary = false), 0)::numeric(12,2),
      'overdue_count', (select count(*)::int from current_watchlist where payment_state = 'overdue'),
      'due_soon_count', (select count(*)::int from current_watchlist where effective_status in ('active', 'trial') and ends_at <= v_now + interval '7 days' and ends_at >= v_now),
      'suspended_count', (select count(*)::int from current_watchlist where payment_state = 'suspended')
    ),
    'watchlist', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'cafe_id', w.cafe_id,
          'slug', w.slug,
          'display_name', w.display_name,
          'is_active', w.is_active,
          'payment_state', w.payment_state,
          'effective_status', w.effective_status,
          'ends_at', w.ends_at,
          'countdown_seconds', w.countdown_seconds,
          'amount_paid', w.amount_paid,
          'is_complimentary', w.is_complimentary,
          'last_activity_at', w.last_activity_at,
          'has_open_shift', w.has_open_shift,
          'notes', w.notes
        )
        order by w.ends_at asc nulls last, w.last_activity_at desc nulls last
      )
      from current_watchlist w
      where w.payment_state in ('overdue', 'suspended')
         or (w.effective_status in ('active', 'trial') and w.ends_at <= v_now + interval '7 days')
    ), '[]'::jsonb),
    'recent_entries', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'subscription_id', s.id,
          'cafe_id', c.id,
          'slug', c.slug,
          'display_name', c.display_name,
          'starts_at', s.starts_at,
          'ends_at', s.ends_at,
          'status', s.status,
          'effective_status', case
            when s.status = 'suspended' then 'suspended'
            when v_now > s.ends_at + make_interval(days => s.grace_days) then 'expired'
            else s.status
          end,
          'amount_paid', s.amount_paid,
          'is_complimentary', s.is_complimentary,
          'notes', s.notes,
          'created_at', s.created_at
        )
        order by s.created_at desc, s.id desc
      )
      from (
        select *
        from platform.cafe_subscriptions
        order by created_at desc, id desc
        limit 60
      ) s
      join ops.cafes c on c.id = s.cafe_id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

commit;
