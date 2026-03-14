create extension if not exists pgcrypto;

create or replace function public.ops_bootstrap_cafe_owner(
  p_slug text,
  p_display_name text,
  p_owner_name text,
  p_owner_phone text,
  p_owner_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_cafe_id uuid;
  v_owner_id uuid;
begin
  if coalesce(trim(p_slug), '') = '' then
    raise exception 'slug_required';
  end if;
  if coalesce(trim(p_display_name), '') = '' then
    raise exception 'display_name_required';
  end if;
  if coalesce(trim(p_owner_name), '') = '' then
    raise exception 'owner_name_required';
  end if;
  if coalesce(trim(p_owner_phone), '') = '' then
    raise exception 'owner_phone_required';
  end if;
  if coalesce(trim(p_owner_password), '') = '' then
    raise exception 'owner_password_required';
  end if;

  insert into ops.cafes (slug, display_name)
  values (trim(lower(p_slug)), trim(p_display_name))
  returning id into v_cafe_id;

  insert into ops.owner_users (cafe_id, full_name, phone, password_hash)
  values (
    v_cafe_id,
    trim(p_owner_name),
    trim(p_owner_phone),
    crypt(p_owner_password, gen_salt('bf'))
  )
  returning id into v_owner_id;

  return jsonb_build_object(
    'cafe_id', v_cafe_id,
    'owner_user_id', v_owner_id,
    'slug', trim(lower(p_slug))
  );
end;
$$;

create or replace function public.ops_create_staff_member(
  p_cafe_id uuid,
  p_full_name text,
  p_pin text
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_staff_id uuid;
begin
  if p_cafe_id is null then
    raise exception 'cafe_id_required';
  end if;
  if coalesce(trim(p_full_name), '') = '' then
    raise exception 'full_name_required';
  end if;
  if coalesce(trim(p_pin), '') = '' then
    raise exception 'pin_required';
  end if;

  insert into ops.staff_members (cafe_id, full_name, pin_hash)
  values (
    p_cafe_id,
    trim(p_full_name),
    crypt(p_pin, gen_salt('bf'))
  )
  returning id into v_staff_id;

  return jsonb_build_object('staff_member_id', v_staff_id);
end;
$$;

create or replace function public.ops_create_menu_section(
  p_cafe_id uuid,
  p_title text,
  p_station_code text,
  p_sort_order integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_section_id uuid;
begin
  if p_cafe_id is null then
    raise exception 'cafe_id_required';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'title_required';
  end if;
  if p_station_code not in ('barista', 'shisha', 'service') then
    raise exception 'invalid_station_code';
  end if;

  insert into ops.menu_sections (cafe_id, title, station_code, sort_order)
  values (p_cafe_id, trim(p_title), p_station_code, coalesce(p_sort_order, 0))
  returning id into v_section_id;

  return jsonb_build_object('section_id', v_section_id);
end;
$$;

create or replace function public.ops_create_menu_product(
  p_cafe_id uuid,
  p_section_id uuid,
  p_product_name text,
  p_station_code text,
  p_unit_price numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_product_id uuid;
begin
  if p_cafe_id is null then
    raise exception 'cafe_id_required';
  end if;
  if p_section_id is null then
    raise exception 'section_id_required';
  end if;
  if coalesce(trim(p_product_name), '') = '' then
    raise exception 'product_name_required';
  end if;
  if p_station_code not in ('barista', 'shisha', 'service') then
    raise exception 'invalid_station_code';
  end if;
  if p_unit_price is null or p_unit_price < 0 then
    raise exception 'invalid_unit_price';
  end if;

  insert into ops.menu_products (cafe_id, section_id, product_name, station_code, unit_price)
  values (p_cafe_id, p_section_id, trim(p_product_name), p_station_code, p_unit_price)
  returning id into v_product_id;

  return jsonb_build_object('product_id', v_product_id);
end;
$$;

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
  v_shift_id uuid;
  v_existing_open uuid;
begin
  if p_cafe_id is null then
    raise exception 'cafe_id_required';
  end if;
  if p_shift_kind not in ('morning', 'evening') then
    raise exception 'invalid_shift_kind';
  end if;
  if p_business_date is null then
    raise exception 'business_date_required';
  end if;
  if p_opened_by_owner_id is null then
    raise exception 'opened_by_owner_id_required';
  end if;

  select s.id into v_existing_open
  from ops.shifts s
  where s.cafe_id = p_cafe_id
    and s.status = 'open'
  limit 1;

  if v_existing_open is not null then
    return jsonb_build_object('shift_id', v_existing_open, 'reused', true);
  end if;

  insert into ops.shifts (
    cafe_id,
    shift_kind,
    business_date,
    status,
    opened_by_owner_id,
    notes
  ) values (
    p_cafe_id,
    p_shift_kind,
    p_business_date,
    'open',
    p_opened_by_owner_id,
    p_notes
  ) returning id into v_shift_id;

  return jsonb_build_object('shift_id', v_shift_id, 'reused', false);
end;
$$;

create or replace function public.ops_assign_shift_role(
  p_cafe_id uuid,
  p_shift_id uuid,
  p_role_code text,
  p_staff_member_id uuid default null,
  p_owner_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_assignment_id uuid;
begin
  if p_cafe_id is null then
    raise exception 'cafe_id_required';
  end if;
  if p_shift_id is null then
    raise exception 'shift_id_required';
  end if;
  if p_role_code not in ('supervisor', 'waiter', 'barista', 'shisha') then
    raise exception 'invalid_role_code';
  end if;
  if (p_staff_member_id is null and p_owner_user_id is null) or (p_staff_member_id is not null and p_owner_user_id is not null) then
    raise exception 'exactly_one_actor_required';
  end if;

  update ops.shift_role_assignments
  set is_active = false
  where cafe_id = p_cafe_id
    and shift_id = p_shift_id
    and role_code = p_role_code
    and is_active = true;

  insert into ops.shift_role_assignments (
    cafe_id,
    shift_id,
    role_code,
    staff_member_id,
    owner_user_id,
    is_active
  ) values (
    p_cafe_id,
    p_shift_id,
    p_role_code,
    p_staff_member_id,
    p_owner_user_id,
    true
  ) returning id into v_assignment_id;

  return jsonb_build_object('assignment_id', v_assignment_id);
end;
$$;

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
as $$
declare
  v_session_id uuid;
  v_effective_label text;
  v_norm_label text;
begin
  if p_cafe_id is null then
    raise exception 'cafe_id_required';
  end if;
  if p_shift_id is null then
    raise exception 'shift_id_required';
  end if;
  if (p_staff_member_id is null and p_owner_user_id is null) or (p_staff_member_id is not null and p_owner_user_id is not null) then
    raise exception 'exactly_one_actor_required';
  end if;

  v_effective_label := nullif(trim(coalesce(p_session_label, '')), '');

  if v_effective_label is not null then
    v_norm_label := lower(v_effective_label);

    select s.id, s.session_label into v_session_id, v_effective_label
    from ops.service_sessions s
    where s.cafe_id = p_cafe_id
      and s.shift_id = p_shift_id
      and s.status = 'open'
      and lower(s.session_label) = v_norm_label
    order by s.opened_at desc
    limit 1;
  end if;

  if v_session_id is null then
    insert into ops.service_sessions (
      cafe_id,
      shift_id,
      session_label,
      status,
      opened_by_staff_id,
      opened_by_owner_id
    ) values (
      p_cafe_id,
      p_shift_id,
      coalesce(v_effective_label, ops.generate_session_label()),
      'open',
      p_staff_member_id,
      p_owner_user_id
    )
    returning id, session_label into v_session_id, v_effective_label;

    return jsonb_build_object(
      'service_session_id', v_session_id,
      'session_label', v_effective_label,
      'reused', false
    );
  end if;

  return jsonb_build_object(
    'service_session_id', v_session_id,
    'session_label', v_effective_label,
    'reused', true
  );
end;
$$;

create or replace function public.ops_create_order_with_items(
  p_cafe_id uuid,
  p_shift_id uuid,
  p_service_session_id uuid default null,
  p_session_label text default null,
  p_created_by_staff_id uuid default null,
  p_created_by_owner_id uuid default null,
  p_items jsonb default '[]'::jsonb,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_session_id uuid;
  v_session_label text;
  v_order_id uuid;
  v_item jsonb;
  v_product record;
  v_order_item_id uuid;
  v_item_count integer := 0;
  v_qty integer;
  v_notes text;
  v_open_check uuid;
  v_result jsonb;
begin
  if p_cafe_id is null then
    raise exception 'cafe_id_required';
  end if;
  if p_shift_id is null then
    raise exception 'shift_id_required';
  end if;
  if (p_created_by_staff_id is null and p_created_by_owner_id is null) or (p_created_by_staff_id is not null and p_created_by_owner_id is not null) then
    raise exception 'exactly_one_actor_required';
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'items_required';
  end if;

  if p_service_session_id is not null then
    select s.id, s.session_label into v_session_id, v_session_label
    from ops.service_sessions s
    where s.cafe_id = p_cafe_id
      and s.shift_id = p_shift_id
      and s.id = p_service_session_id
      and s.status = 'open'
    limit 1;

    if v_session_id is null then
      raise exception 'service_session_not_found';
    end if;
  else
    select (x->>'service_session_id')::uuid, x->>'session_label'
    into v_session_id, v_session_label
    from (
      select public.ops_open_or_resume_service_session(
        p_cafe_id,
        p_shift_id,
        p_session_label,
        p_created_by_staff_id,
        p_created_by_owner_id
      ) as x
    ) q;
  end if;

  select s.id into v_open_check
  from ops.shifts s
  where s.cafe_id = p_cafe_id
    and s.id = p_shift_id
    and s.status = 'open'
  limit 1;

  if v_open_check is null then
    raise exception 'shift_not_open';
  end if;

  insert into ops.orders (
    cafe_id,
    shift_id,
    service_session_id,
    status,
    submitted_at,
    created_by_staff_id,
    created_by_owner_id,
    notes
  ) values (
    p_cafe_id,
    p_shift_id,
    v_session_id,
    'submitted',
    now(),
    p_created_by_staff_id,
    p_created_by_owner_id,
    p_notes
  ) returning id into v_order_id;

  for v_item in
    select value from jsonb_array_elements(p_items)
  loop
    if coalesce(v_item->>'menu_product_id', '') = '' then
      raise exception 'menu_product_id_required';
    end if;

    v_qty := coalesce((v_item->>'qty')::integer, 0);
    if v_qty <= 0 then
      raise exception 'invalid_qty';
    end if;

    v_notes := nullif(trim(coalesce(v_item->>'notes', '')), '');

    select p.id, p.station_code, p.unit_price
    into v_product
    from ops.menu_products p
    where p.cafe_id = p_cafe_id
      and p.id = (v_item->>'menu_product_id')::uuid
      and p.is_active = true
    limit 1;

    if v_product.id is null then
      raise exception 'menu_product_not_found';
    end if;

    insert into ops.order_items (
      cafe_id,
      shift_id,
      service_session_id,
      order_id,
      menu_product_id,
      station_code,
      unit_price,
      qty_total,
      qty_submitted,
      notes
    ) values (
      p_cafe_id,
      p_shift_id,
      v_session_id,
      v_order_id,
      v_product.id,
      v_product.station_code,
      v_product.unit_price,
      v_qty,
      v_qty,
      v_notes
    ) returning id into v_order_item_id;

    insert into ops.fulfillment_events (
      cafe_id,
      shift_id,
      service_session_id,
      order_item_id,
      station_code,
      event_code,
      quantity,
      notes,
      by_staff_id,
      by_owner_id
    ) values (
      p_cafe_id,
      p_shift_id,
      v_session_id,
      v_order_item_id,
      v_product.station_code,
      'submitted',
      v_qty,
      v_notes,
      p_created_by_staff_id,
      p_created_by_owner_id
    );

    v_item_count := v_item_count + 1;
  end loop;

  v_result := jsonb_build_object(
    'order_id', v_order_id,
    'service_session_id', v_session_id,
    'session_label', v_session_label,
    'items_count', v_item_count,
    'status', 'submitted'
  );

  return v_result;
end;
$$;
