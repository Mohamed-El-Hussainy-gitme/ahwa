begin;

create table if not exists control.support_access_requests (
  id uuid primary key default gen_random_uuid(),
  super_admin_user_id uuid not null references platform.super_admin_users(id) on delete cascade,
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  database_key text not null references control.operational_databases(database_key) on delete restrict,
  support_message_id uuid null references platform.support_messages(id) on delete set null,
  scope text not null default 'diagnostic'
    check (scope in ('diagnostic', 'read_only', 'guided_write')),
  reason text not null,
  status text not null default 'requested'
    check (status in ('requested', 'active', 'closed', 'revoked', 'expired')),
  requested_at timestamptz not null default now(),
  activated_at timestamptz null,
  expires_at timestamptz not null,
  closed_at timestamptz null,
  closed_note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_control_support_access_reason_nonempty check (nullif(btrim(reason), '') is not null),
  constraint chk_control_support_access_expiry_valid check (expires_at > requested_at)
);

create index if not exists idx_control_support_access_requests_cafe_status_requested_at
  on control.support_access_requests (cafe_id, status, requested_at desc);

create index if not exists idx_control_support_access_requests_admin_status_requested_at
  on control.support_access_requests (super_admin_user_id, status, requested_at desc);

create index if not exists idx_control_support_access_requests_message
  on control.support_access_requests (support_message_id, requested_at desc)
  where support_message_id is not null;

create table if not exists control.support_access_audit_events (
  id uuid primary key default gen_random_uuid(),
  support_access_request_id uuid not null references control.support_access_requests(id) on delete cascade,
  actor_super_admin_user_id uuid null references platform.super_admin_users(id) on delete set null,
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  database_key text not null references control.operational_databases(database_key) on delete restrict,
  event_kind text not null
    check (event_kind in ('requested', 'activated', 'closed', 'revoked', 'expired')),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_control_support_access_audit_events_request_created_at
  on control.support_access_audit_events (support_access_request_id, created_at desc);

create index if not exists idx_control_support_access_audit_events_cafe_created_at
  on control.support_access_audit_events (cafe_id, created_at desc);

drop trigger if exists trg_control_support_access_requests_set_updated_at on control.support_access_requests;
create trigger trg_control_support_access_requests_set_updated_at
before update on control.support_access_requests
for each row
execute function control.set_updated_at();

create or replace function public.control_expire_support_access_requests()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, ops, platform, control
as $$
declare
  v_rows integer := 0;
begin
  with changed as (
    update control.support_access_requests sar
    set status = 'expired',
        closed_at = coalesce(sar.closed_at, now()),
        updated_at = now()
    where sar.status in ('requested', 'active')
      and sar.expires_at <= now()
    returning sar.id, sar.super_admin_user_id, sar.cafe_id, sar.database_key, sar.expires_at
  ), inserted as (
    insert into control.support_access_audit_events (
      support_access_request_id,
      actor_super_admin_user_id,
      cafe_id,
      database_key,
      event_kind,
      detail,
      created_at
    )
    select
      changed.id,
      changed.super_admin_user_id,
      changed.cafe_id,
      changed.database_key,
      'expired',
      jsonb_build_object('expires_at', changed.expires_at),
      now()
    from changed
    returning 1
  )
  select count(*) into v_rows from changed;

  return coalesce(v_rows, 0);
end;
$$;

create or replace function public.control_request_support_access(
  p_super_admin_user_id uuid,
  p_cafe_id uuid,
  p_reason text,
  p_scope text default 'diagnostic',
  p_support_message_id uuid default null,
  p_duration_minutes integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, ops, platform, control
as $$
declare
  v_scope text := coalesce(nullif(btrim(p_scope), ''), 'diagnostic');
  v_reason text := nullif(btrim(p_reason), '');
  v_duration_minutes integer := greatest(15, least(coalesce(p_duration_minutes, 60), 480));
  v_database_key text;
  v_request_id uuid;
  v_expires_at timestamptz;
begin
  if p_super_admin_user_id is null then
    raise exception 'p_super_admin_user_id is required';
  end if;

  if p_cafe_id is null then
    raise exception 'p_cafe_id is required';
  end if;

  if v_reason is null then
    raise exception 'p_reason is required';
  end if;

  if v_scope not in ('diagnostic', 'read_only', 'guided_write') then
    raise exception 'invalid support scope';
  end if;

  if not exists (
    select 1
    from platform.super_admin_users sau
    where sau.id = p_super_admin_user_id
      and sau.is_active = true
  ) then
    raise exception 'super admin not found or inactive';
  end if;

  select coalesce(b.database_key, public.control_get_default_operational_database_key())
  into v_database_key
  from ops.cafes c
  left join control.cafe_database_bindings b
    on b.cafe_id = c.id
  where c.id = p_cafe_id;

  if v_database_key is null then
    raise exception 'operational database binding not found';
  end if;

  v_expires_at := now() + make_interval(mins => v_duration_minutes);

  insert into control.support_access_requests (
    super_admin_user_id,
    cafe_id,
    database_key,
    support_message_id,
    scope,
    reason,
    status,
    requested_at,
    expires_at,
    created_at,
    updated_at
  )
  values (
    p_super_admin_user_id,
    p_cafe_id,
    v_database_key,
    p_support_message_id,
    v_scope,
    v_reason,
    'requested',
    now(),
    v_expires_at,
    now(),
    now()
  )
  returning id into v_request_id;

  insert into control.support_access_audit_events (
    support_access_request_id,
    actor_super_admin_user_id,
    cafe_id,
    database_key,
    event_kind,
    detail,
    created_at
  )
  values (
    v_request_id,
    p_super_admin_user_id,
    p_cafe_id,
    v_database_key,
    'requested',
    jsonb_build_object(
      'scope', v_scope,
      'reason', v_reason,
      'duration_minutes', v_duration_minutes,
      'support_message_id', p_support_message_id
    ),
    now()
  );

  return jsonb_build_object(
    'ok', true,
    'id', v_request_id,
    'cafe_id', p_cafe_id,
    'database_key', v_database_key,
    'scope', v_scope,
    'status', 'requested',
    'reason', v_reason,
    'requested_at', now(),
    'expires_at', v_expires_at
  );
end;
$$;

create or replace function public.control_activate_support_access(
  p_request_id uuid,
  p_super_admin_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, ops, platform, control
as $$
declare
  v_request control.support_access_requests%rowtype;
  v_was_requested boolean := false;
begin
  if p_request_id is null then
    raise exception 'p_request_id is required';
  end if;

  if p_super_admin_user_id is null then
    raise exception 'p_super_admin_user_id is required';
  end if;

  perform public.control_expire_support_access_requests();

  select *
  into v_request
  from control.support_access_requests sar
  where sar.id = p_request_id
  for update;

  if not found then
    raise exception 'support access request not found';
  end if;

  if v_request.super_admin_user_id <> p_super_admin_user_id then
    raise exception 'support access request does not belong to this super admin';
  end if;

  if v_request.status = 'expired' then
    raise exception 'support access request is expired';
  end if;

  if v_request.status in ('closed', 'revoked') then
    raise exception 'support access request is not active';
  end if;

  v_was_requested := v_request.status = 'requested';

  if v_was_requested then
    update control.support_access_requests sar
    set status = 'active',
        activated_at = coalesce(sar.activated_at, now()),
        updated_at = now()
    where sar.id = p_request_id
    returning * into v_request;

    insert into control.support_access_audit_events (
      support_access_request_id,
      actor_super_admin_user_id,
      cafe_id,
      database_key,
      event_kind,
      detail,
      created_at
    )
    values (
      v_request.id,
      p_super_admin_user_id,
      v_request.cafe_id,
      v_request.database_key,
      'activated',
      jsonb_build_object('activated_at', v_request.activated_at),
      now()
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', v_request.id,
    'cafe_id', v_request.cafe_id,
    'database_key', v_request.database_key,
    'scope', v_request.scope,
    'status', v_request.status,
    'reason', v_request.reason,
    'requested_at', v_request.requested_at,
    'activated_at', v_request.activated_at,
    'expires_at', v_request.expires_at,
    'closed_at', v_request.closed_at
  );
end;
$$;

create or replace function public.control_close_support_access(
  p_request_id uuid,
  p_super_admin_user_id uuid,
  p_close_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, ops, platform, control
as $$
declare
  v_request control.support_access_requests%rowtype;
  v_close_note text := nullif(btrim(p_close_note), '');
  v_should_close boolean := false;
begin
  if p_request_id is null then
    raise exception 'p_request_id is required';
  end if;

  if p_super_admin_user_id is null then
    raise exception 'p_super_admin_user_id is required';
  end if;

  perform public.control_expire_support_access_requests();

  select *
  into v_request
  from control.support_access_requests sar
  where sar.id = p_request_id
  for update;

  if not found then
    raise exception 'support access request not found';
  end if;

  if v_request.super_admin_user_id <> p_super_admin_user_id then
    raise exception 'support access request does not belong to this super admin';
  end if;

  v_should_close := v_request.status in ('requested', 'active');

  if v_should_close then
    update control.support_access_requests sar
    set status = 'closed',
        closed_at = coalesce(sar.closed_at, now()),
        closed_note = coalesce(v_close_note, sar.closed_note),
        updated_at = now()
    where sar.id = p_request_id
    returning * into v_request;

    insert into control.support_access_audit_events (
      support_access_request_id,
      actor_super_admin_user_id,
      cafe_id,
      database_key,
      event_kind,
      detail,
      created_at
    )
    values (
      v_request.id,
      p_super_admin_user_id,
      v_request.cafe_id,
      v_request.database_key,
      'closed',
      jsonb_build_object('closed_note', v_close_note),
      now()
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', v_request.id,
    'cafe_id', v_request.cafe_id,
    'database_key', v_request.database_key,
    'scope', v_request.scope,
    'status', v_request.status,
    'reason', v_request.reason,
    'requested_at', v_request.requested_at,
    'activated_at', v_request.activated_at,
    'expires_at', v_request.expires_at,
    'closed_at', v_request.closed_at,
    'closed_note', v_request.closed_note
  );
end;
$$;

create or replace function public.control_get_active_support_access(
  p_super_admin_user_id uuid,
  p_cafe_id uuid default null
)
returns table (
  id uuid,
  super_admin_user_id uuid,
  cafe_id uuid,
  database_key text,
  support_message_id uuid,
  scope text,
  reason text,
  status text,
  requested_at timestamptz,
  activated_at timestamptz,
  expires_at timestamptz,
  closed_at timestamptz,
  closed_note text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public, ops, platform, control
as $$
  with _ as (
    select public.control_expire_support_access_requests()
  )
  select
    sar.id,
    sar.super_admin_user_id,
    sar.cafe_id,
    sar.database_key,
    sar.support_message_id,
    sar.scope,
    sar.reason,
    sar.status,
    sar.requested_at,
    sar.activated_at,
    sar.expires_at,
    sar.closed_at,
    sar.closed_note,
    sar.updated_at
  from control.support_access_requests sar
  where sar.super_admin_user_id = p_super_admin_user_id
    and sar.status = 'active'
    and (p_cafe_id is null or sar.cafe_id = p_cafe_id)
  order by sar.activated_at desc nulls last, sar.requested_at desc, sar.id desc;
$$;

create or replace function public.control_list_support_access_requests(
  p_super_admin_user_id uuid default null,
  p_cafe_id uuid default null,
  p_status text default null,
  p_limit integer default 50
)
returns table (
  id uuid,
  super_admin_user_id uuid,
  super_admin_email text,
  cafe_id uuid,
  cafe_slug text,
  cafe_display_name text,
  database_key text,
  support_message_id uuid,
  scope text,
  reason text,
  status text,
  requested_at timestamptz,
  activated_at timestamptz,
  expires_at timestamptz,
  closed_at timestamptz,
  closed_note text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public, ops, platform, control
as $$
  with _ as (
    select public.control_expire_support_access_requests()
  )
  select
    sar.id,
    sar.super_admin_user_id,
    sau.email as super_admin_email,
    sar.cafe_id,
    c.slug as cafe_slug,
    c.display_name as cafe_display_name,
    sar.database_key,
    sar.support_message_id,
    sar.scope,
    sar.reason,
    sar.status,
    sar.requested_at,
    sar.activated_at,
    sar.expires_at,
    sar.closed_at,
    sar.closed_note,
    sar.updated_at
  from control.support_access_requests sar
  join platform.super_admin_users sau
    on sau.id = sar.super_admin_user_id
  join ops.cafes c
    on c.id = sar.cafe_id
  where (p_super_admin_user_id is null or sar.super_admin_user_id = p_super_admin_user_id)
    and (p_cafe_id is null or sar.cafe_id = p_cafe_id)
    and (p_status is null or sar.status = p_status)
  order by sar.requested_at desc, sar.id desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

comment on table control.support_access_requests is
  'Canonical explicit support-access requests/sessions for super-admin support. Replaces legacy always-off support grants with time-scoped audited support sessions.';

comment on table control.support_access_audit_events is
  'Audit trail for explicit support-access lifecycle events (request, activate, close, expire).';

commit;
