begin;

update ops.owner_users
set phone = btrim(phone)
where phone is distinct from btrim(phone);

do $$
begin
  if exists (
    select 1
    from ops.owner_users ou
    where ou.is_active = true
    group by ou.cafe_id, btrim(ou.phone)
    having count(*) > 1
  ) then
    raise exception 'owner_phone_normalization_conflict';
  end if;
end;
$$;

create unique index if not exists uq_owner_users_cafe_phone_trimmed_active
  on ops.owner_users (cafe_id, btrim(phone))
  where is_active = true;

commit;
