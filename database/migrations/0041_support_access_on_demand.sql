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
