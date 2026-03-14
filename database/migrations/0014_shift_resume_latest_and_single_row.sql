begin;

with ranked as (
  select
    s.id,
    s.cafe_id,
    s.shift_kind,
    s.business_date,
    s.status,
    row_number() over (
      partition by s.cafe_id, s.shift_kind, s.business_date
      order by case when s.status = 'open' then 0 else 1 end, s.opened_at asc, s.id asc
    ) as rn,
    first_value(s.id) over (
      partition by s.cafe_id, s.shift_kind, s.business_date
      order by case when s.status = 'open' then 0 else 1 end, s.opened_at asc, s.id asc
    ) as canonical_id
  from ops.shifts s
), dupes as (
  select id, cafe_id, canonical_id
  from ranked
  where rn > 1
)
insert into ops.shift_snapshots (cafe_id, shift_id, snapshot_json)
select ds.cafe_id, ds.canonical_id, ss.snapshot_json
from dupes ds
join ops.shift_snapshots ss
  on ss.cafe_id = ds.cafe_id
 and ss.shift_id = ds.id
left join ops.shift_snapshots existing
  on existing.cafe_id = ds.cafe_id
 and existing.shift_id = ds.canonical_id
where existing.shift_id is null
on conflict (cafe_id, shift_id) do nothing;

with ranked as (
  select s.id, s.cafe_id, s.shift_kind, s.business_date,
         row_number() over (partition by s.cafe_id, s.shift_kind, s.business_date order by case when s.status = 'open' then 0 else 1 end, s.opened_at asc, s.id asc) as rn,
         first_value(s.id) over (partition by s.cafe_id, s.shift_kind, s.business_date order by case when s.status = 'open' then 0 else 1 end, s.opened_at asc, s.id asc) as canonical_id
  from ops.shifts s
), dupes as (select id, cafe_id, canonical_id from ranked where rn > 1)
update ops.shift_role_assignments a set shift_id = d.canonical_id from dupes d where a.cafe_id = d.cafe_id and a.shift_id = d.id;

with ranked as (
  select s.id, s.cafe_id, s.shift_kind, s.business_date,
         row_number() over (partition by s.cafe_id, s.shift_kind, s.business_date order by case when s.status = 'open' then 0 else 1 end, s.opened_at asc, s.id asc) as rn,
         first_value(s.id) over (partition by s.cafe_id, s.shift_kind, s.business_date order by case when s.status = 'open' then 0 else 1 end, s.opened_at asc, s.id asc) as canonical_id
  from ops.shifts s
), dupes as (select id, cafe_id, canonical_id from ranked where rn > 1)
update ops.service_sessions ss set shift_id = d.canonical_id from dupes d where ss.cafe_id = d.cafe_id and ss.shift_id = d.id;

with ranked as (
  select s.id, s.cafe_id, s.shift_kind, s.business_date,
         row_number() over (partition by s.cafe_id, s.shift_kind, s.business_date order by case when s.status = 'open' then 0 else 1 end, s.opened_at asc, s.id asc) as rn,
         first_value(s.id) over (partition by s.cafe_id, s.shift_kind, s.business_date order by case when s.status = 'open' then 0 else 1 end, s.opened_at asc, s.id asc) as canonical_id
  from ops.shifts s
), dupes as (select id, cafe_id, canonical_id from ranked where rn > 1)
update ops.orders o set shift_id = d.canonical_id from dupes d where o.cafe_id = d.cafe_id and o.shift_id = d.id;

with ranked as (
  select s.id, s.cafe_id, s.shift_kind, s.business_date,
         row_number() over (partition by s.cafe_id, s.shift_kind, s.business_date order by case when s.status = 'open' then 0 else 1 end, s.opened_at asc, s.id asc) as rn,
         first_value(s.id) over (partition by s.cafe_id, s.shift_kind, s.business_date order by case when s.status = 'open' then 0 else 1 end, s.opened_at asc, s.id asc) as canonical_id
  from ops.shifts s
), dupes as (select id, cafe_id, canonical_id from ranked where rn > 1)
update ops.order_items oi set shift_id = d.canonical_id from dupes d where oi.cafe_id = d.cafe_id and oi.shift_id = d.id;

with ranked as (
  select s.id, s.cafe_id, s.shift_kind, s.business_date,
         row_number() over (partition by s.cafe_id, s.shift_kind, s.business_date order by case when s.status = 'open' then 0 else 1 end, s.opened_at asc, s.id asc) as rn,
         first_value(s.id) over (partition by s.cafe_id, s.shift_kind, s.business_date order by case when s.status = 'open' then 0 else 1 end, s.opened_at asc, s.id asc) as canonical_id
  from ops.shifts s
), dupes as (select id, cafe_id, canonical_id from ranked where rn > 1)
update ops.fulfillment_events fe set shift_id = d.canonical_id from dupes d where fe.cafe_id = d.cafe_id and fe.shift_id = d.id;

with ranked as (
  select s.id, s.cafe_id, s.shift_kind, s.business_date,
         row_number() over (partition by s.cafe_id, s.shift_kind, s.business_date order by case when s.status = 'open' then 0 else 1 end, s.opened_at asc, s.id asc) as rn,
         first_value(s.id) over (partition by s.cafe_id, s.shift_kind, s.business_date order by case when s.status = 'open' then 0 else 1 end, s.opened_at asc, s.id asc) as canonical_id
  from ops.shifts s
), dupes as (select id, cafe_id, canonical_id from ranked where rn > 1)
update ops.payments p set shift_id = d.canonical_id from dupes d where p.cafe_id = d.cafe_id and p.shift_id = d.id;

with ranked as (
  select s.id, s.cafe_id, s.shift_kind, s.business_date,
         row_number() over (partition by s.cafe_id, s.shift_kind, s.business_date order by case when s.status = 'open' then 0 else 1 end, s.opened_at asc, s.id asc) as rn,
         first_value(s.id) over (partition by s.cafe_id, s.shift_kind, s.business_date order by case when s.status = 'open' then 0 else 1 end, s.opened_at asc, s.id asc) as canonical_id
  from ops.shifts s
), dupes as (select id, cafe_id, canonical_id from ranked where rn > 1)
delete from ops.shift_snapshots ss using dupes d where ss.cafe_id = d.cafe_id and ss.shift_id = d.id;

with ranked as (
  select s.id, s.cafe_id, s.shift_kind, s.business_date,
         row_number() over (partition by s.cafe_id, s.shift_kind, s.business_date order by case when s.status = 'open' then 0 else 1 end, s.opened_at asc, s.id asc) as rn
  from ops.shifts s
)
delete from ops.shifts s using ranked r where s.id = r.id and r.rn > 1;

alter table ops.shifts drop constraint if exists shifts_cafe_id_shift_kind_business_date_status_key;
alter table ops.shifts add constraint shifts_cafe_id_shift_kind_business_date_key unique (cafe_id, shift_kind, business_date) deferrable initially immediate;

create or replace function public.ops_open_shift(
  p_cafe_id uuid,
  p_shift_kind text,
  p_business_date date,
  p_opened_by_owner_id uuid,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_open_shift_id uuid;
  v_open_shift_kind text;
  v_open_business_date date;
  v_candidate_id uuid;
  v_candidate_date date;
  v_has_later_shift boolean;
  v_shift_id uuid;
  v_requested_sort int;
begin
  if p_cafe_id is null then raise exception 'cafe_id_required'; end if;
  if p_shift_kind not in ('morning', 'evening') then raise exception 'invalid_shift_kind'; end if;
  if p_business_date is null then raise exception 'business_date_required'; end if;
  if p_opened_by_owner_id is null then raise exception 'opened_by_owner_id_required'; end if;

  v_requested_sort := case p_shift_kind when 'morning' then 1 else 2 end;

  select s.id, s.shift_kind, s.business_date
  into v_open_shift_id, v_open_shift_kind, v_open_business_date
  from ops.shifts s
  where s.cafe_id = p_cafe_id and s.status = 'open'
  order by s.opened_at desc
  limit 1;

  if v_open_shift_id is not null then
    if v_open_shift_kind = p_shift_kind and v_open_business_date = p_business_date then
      return jsonb_build_object('shift_id', v_open_shift_id, 'reused', true, 'mode', 'resumed_open');
    end if;
    raise exception 'another_shift_is_already_open';
  end if;

  select s.id, s.business_date
  into v_candidate_id, v_candidate_date
  from ops.shifts s
  where s.cafe_id = p_cafe_id
    and s.shift_kind = p_shift_kind
    and s.status = 'closed'
    and (s.business_date = p_business_date or (p_shift_kind = 'evening' and s.business_date = p_business_date - 1))
  order by s.business_date desc, s.opened_at desc
  limit 1;

  if v_candidate_id is not null then
    select exists (
      select 1
      from ops.shifts s
      where s.cafe_id = p_cafe_id
        and s.id <> v_candidate_id
        and (s.business_date > v_candidate_date or (s.business_date = v_candidate_date and case s.shift_kind when 'morning' then 1 else 2 end > v_requested_sort))
    ) into v_has_later_shift;

    if not v_has_later_shift then
      delete from ops.shift_snapshots where cafe_id = p_cafe_id and shift_id = v_candidate_id;

      update ops.shifts
      set status = 'open',
          closed_at = null,
          closed_by_owner_id = null,
          notes = case
            when p_notes is null or btrim(p_notes) = '' then notes
            when notes is null or btrim(notes) = '' then p_notes
            else notes || E'\n[resume] ' || p_notes
          end
      where cafe_id = p_cafe_id and id = v_candidate_id and status = 'closed';

      return jsonb_build_object('shift_id', v_candidate_id, 'reused', true, 'mode', 'resumed_closed');
    end if;

    raise exception 'cannot_resume_shift_after_next_shift_started';
  end if;

  insert into ops.shifts (cafe_id, shift_kind, business_date, status, opened_by_owner_id, notes)
  values (p_cafe_id, p_shift_kind, p_business_date, 'open', p_opened_by_owner_id, p_notes)
  returning id into v_shift_id;

  return jsonb_build_object('shift_id', v_shift_id, 'reused', false, 'mode', 'created');
end;
$$;

commit;
