-- Delta patch: align supervisor privileges (supervisor = waiter + billing only)

-- Remove supervisor from kitchen view/update
create or replace function public.can_kitchen()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_owner()
      or public.has_shift_role('barista')
      or public.has_shift_role('shisha');
$$;

create or replace function public.can_update_kitchen_item(item_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_owner()
      or (item_role = 'barista' and public.has_shift_role('barista'))
      or (item_role = 'shisha' and public.has_shift_role('shisha'));
$$;

-- Optional hardening: prevent duplicate staff names within the same cafe.
-- Run only if you are sure there are no duplicates already.
-- create unique index if not exists staff_profiles_cafe_login_name_uniq
--   on public.staff_profiles (cafe_id, login_name)
--   where is_active;
