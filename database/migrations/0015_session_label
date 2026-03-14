create or replace function public.ops_open_or_resume_service_session(
  p_cafe_id uuid,
  p_shift_id uuid,
  p_session_label text default null,
  p_staff_member_id uuid default null,
  p_owner_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $function$
declare
  v_session_id uuid;
  v_requested_label text;
  v_existing_label text;
  v_norm_label text;
begin
  if p_cafe_id is null then
    raise exception 'cafe_id_required';
  end if;

  if p_shift_id is null then
    raise exception 'shift_id_required';
  end if;

  if (p_staff_member_id is null and p_owner_user_id is null)
     or (p_staff_member_id is not null and p_owner_user_id is not null) then
    raise exception 'exactly_one_actor_required';
  end if;

  v_requested_label := nullif(btrim(coalesce(p_session_label, '')), '');

  if v_requested_label is not null then
    v_norm_label := lower(v_requested_label);

    select s.id, s.session_label
    into v_session_id, v_existing_label
    from ops.service_sessions s
    where s.cafe_id = p_cafe_id
      and s.shift_id = p_shift_id
      and s.status = 'open'
      and lower(btrim(s.session_label)) = v_norm_label
    order by s.opened_at desc
    limit 1;

    if v_session_id is not null then
      return jsonb_build_object(
        'service_session_id', v_session_id,
        'session_label', v_existing_label,
        'reused', true
      );
    end if;
  end if;

  begin
    insert into ops.service_sessions (
      cafe_id,
      shift_id,
      session_label,
      status,
      opened_by_staff_id,
      opened_by_owner_id
    )
    values (
      p_cafe_id,
      p_shift_id,
      coalesce(v_requested_label, ops.generate_session_label()),
      'open',
      p_staff_member_id,
      p_owner_user_id
    )
    returning id, session_label into v_session_id, v_existing_label;
  exception
    when unique_violation then
      if v_requested_label is null then
        raise;
      end if;

      select s.id, s.session_label
      into v_session_id, v_existing_label
      from ops.service_sessions s
      where s.cafe_id = p_cafe_id
        and s.shift_id = p_shift_id
        and s.status = 'open'
        and lower(btrim(s.session_label)) = lower(v_requested_label)
      order by s.opened_at desc
      limit 1;

      if v_session_id is null then
        raise;
      end if;

      return jsonb_build_object(
        'service_session_id', v_session_id,
        'session_label', v_existing_label,
        'reused', true
      );
  end;

  return jsonb_build_object(
    'service_session_id', v_session_id,
    'session_label', v_existing_label,
    'reused', false
  );
end;
$function$;