begin;

create or replace function app.has_platform_support_access(
  p_cafe_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, ops, platform, app
as $$
  select false
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
    and app.current_cafe_id() = p_cafe_id
$$;

drop function if exists public.platform_grant_support_access(uuid, uuid, text, timestamptz);

comment on table platform.support_access_grants is
  'legacy archive only after 0022; new support grants are no longer part of the canonical platform access model';

commit;
