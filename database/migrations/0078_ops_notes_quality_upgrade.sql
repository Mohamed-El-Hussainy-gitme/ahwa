begin;

alter table ops.order_item_issues
  drop constraint if exists order_item_issues_status_check;

alter table ops.order_item_issues
  add constraint order_item_issues_status_check
  check (status in ('logged', 'applied', 'verified', 'dismissed'));

create or replace function public.ops_update_order_item_issue_status(
  p_cafe_id uuid,
  p_item_issue_id uuid,
  p_status text,
  p_notes text default null,
  p_by_staff_id uuid default null,
  p_by_owner_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_issue ops.order_item_issues%rowtype;
  v_status text;
begin
  if (p_by_staff_id is null and p_by_owner_id is null)
     or (p_by_staff_id is not null and p_by_owner_id is not null) then
    raise exception 'Exactly one actor is required';
  end if;

  v_status := case
    when p_status in ('applied', 'verified', 'dismissed') then p_status
    else null
  end;

  if v_status is null then
    raise exception 'Invalid item issue status';
  end if;

  select *
  into v_issue
  from ops.order_item_issues
  where cafe_id = p_cafe_id
    and id = p_item_issue_id
  for update;

  if not found then
    raise exception 'item_issue not found';
  end if;

  if v_issue.status = 'dismissed' or v_issue.status = 'verified' then
    raise exception 'item_issue is already closed';
  end if;

  update ops.order_item_issues
  set status = v_status,
      resolved_at = case when v_status in ('applied', 'verified', 'dismissed') then now() else resolved_at end,
      resolved_by_staff_id = case when v_status in ('applied', 'verified', 'dismissed') then p_by_staff_id else resolved_by_staff_id end,
      resolved_by_owner_id = case when v_status in ('applied', 'verified', 'dismissed') then p_by_owner_id else resolved_by_owner_id end,
      notes = case
        when nullif(btrim(coalesce(p_notes, '')), '') is null then notes
        when notes is null or btrim(notes) = '' then btrim(p_notes)
        else notes || E'\n' || btrim(p_notes)
      end
  where cafe_id = p_cafe_id
    and id = p_item_issue_id;

  return jsonb_build_object(
    'ok', true,
    'item_issue_id', v_issue.id,
    'shift_id', v_issue.shift_id,
    'service_session_id', v_issue.service_session_id,
    'order_item_id', v_issue.order_item_id,
    'status', v_status
  );
end;
$$;

grant execute on function public.ops_update_order_item_issue_status(uuid, uuid, text, text, uuid, uuid) to authenticated;

commit;
