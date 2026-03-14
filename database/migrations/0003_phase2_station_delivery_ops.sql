create or replace function public.ops_list_station_queue(
  p_cafe_id uuid,
  p_shift_id uuid,
  p_station_code text
)
returns jsonb
language sql
security definer
set search_path = public, ops
as $$
  select coalesce(jsonb_agg(row_to_json(q) order by q.created_at asc), '[]'::jsonb)
  from (
    select
      oi.id as order_item_id,
      oi.order_id,
      oi.service_session_id,
      ss.session_label,
      oi.menu_product_id,
      mp.product_name,
      oi.station_code,
      oi.unit_price,
      oi.qty_total,
      oi.qty_submitted,
      oi.qty_ready,
      oi.qty_delivered,
      oi.qty_paid,
      oi.qty_deferred,
      oi.qty_remade,
      oi.qty_cancelled,
      greatest(oi.qty_submitted - oi.qty_ready - oi.qty_cancelled, 0) as qty_waiting,
      oi.created_at
    from ops.order_items oi
    join ops.service_sessions ss
      on ss.id = oi.service_session_id
     and ss.cafe_id = oi.cafe_id
    join ops.menu_products mp
      on mp.id = oi.menu_product_id
     and mp.cafe_id = oi.cafe_id
    where oi.cafe_id = p_cafe_id
      and oi.shift_id = p_shift_id
      and oi.station_code = p_station_code
      and greatest(oi.qty_submitted - oi.qty_ready - oi.qty_cancelled, 0) > 0
    order by oi.created_at asc
  ) q;
$$;

create or replace function public.ops_mark_partial_ready(
  p_cafe_id uuid,
  p_order_item_id uuid,
  p_quantity integer,
  p_by_staff_id uuid default null,
  p_by_owner_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_item ops.order_items%rowtype;
  v_waiting integer;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'p_quantity must be greater than zero';
  end if;

  if (p_by_staff_id is null and p_by_owner_id is null)
     or (p_by_staff_id is not null and p_by_owner_id is not null) then
    raise exception 'Exactly one actor is required';
  end if;

  select *
  into v_item
  from ops.order_items
  where cafe_id = p_cafe_id
    and id = p_order_item_id
  for update;

  if not found then
    raise exception 'order_item not found';
  end if;

  v_waiting := greatest(v_item.qty_submitted - v_item.qty_ready - v_item.qty_cancelled, 0);

  if v_waiting = 0 then
    raise exception 'No waiting quantity available for partial ready';
  end if;

  if p_quantity > v_waiting then
    raise exception 'Requested quantity % exceeds waiting quantity %', p_quantity, v_waiting;
  end if;

  update ops.order_items
  set qty_ready = qty_ready + p_quantity
  where cafe_id = p_cafe_id
    and id = p_order_item_id;

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
  )
  values (
    v_item.cafe_id,
    v_item.shift_id,
    v_item.service_session_id,
    v_item.id,
    v_item.station_code,
    'partial_ready',
    p_quantity,
    p_notes,
    p_by_staff_id,
    p_by_owner_id
  );

  return jsonb_build_object(
    'ok', true,
    'order_item_id', v_item.id,
    'qty_marked_ready', p_quantity
  );
end;
$$;

create or replace function public.ops_mark_ready(
  p_cafe_id uuid,
  p_order_item_id uuid,
  p_quantity integer default null,
  p_by_staff_id uuid default null,
  p_by_owner_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_item ops.order_items%rowtype;
  v_waiting integer;
  v_quantity integer;
begin
  if (p_by_staff_id is null and p_by_owner_id is null)
     or (p_by_staff_id is not null and p_by_owner_id is not null) then
    raise exception 'Exactly one actor is required';
  end if;

  select *
  into v_item
  from ops.order_items
  where cafe_id = p_cafe_id
    and id = p_order_item_id
  for update;

  if not found then
    raise exception 'order_item not found';
  end if;

  v_waiting := greatest(v_item.qty_submitted - v_item.qty_ready - v_item.qty_cancelled, 0);

  if v_waiting = 0 then
    raise exception 'No waiting quantity available for ready';
  end if;

  v_quantity := coalesce(p_quantity, v_waiting);
  if v_quantity <= 0 or v_quantity > v_waiting then
    raise exception 'invalid_quantity';
  end if;

  update ops.order_items
  set qty_ready = qty_ready + v_quantity
  where cafe_id = p_cafe_id
    and id = p_order_item_id;

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
  )
  values (
    v_item.cafe_id,
    v_item.shift_id,
    v_item.service_session_id,
    v_item.id,
    v_item.station_code,
    'ready',
    v_quantity,
    p_notes,
    p_by_staff_id,
    p_by_owner_id
  );

  return jsonb_build_object(
    'ok', true,
    'order_item_id', v_item.id,
    'qty_marked_ready', v_quantity
  );
end;
$$;

create or replace function public.ops_list_ready_for_delivery(
  p_cafe_id uuid,
  p_shift_id uuid
)
returns jsonb
language sql
security definer
set search_path = public, ops
as $$
  select coalesce(jsonb_agg(row_to_json(q) order by q.created_at asc), '[]'::jsonb)
  from (
    select
      oi.id as order_item_id,
      oi.order_id,
      oi.service_session_id,
      ss.session_label,
      oi.menu_product_id,
      mp.product_name,
      oi.station_code,
      oi.unit_price,
      oi.qty_total,
      oi.qty_ready,
      oi.qty_delivered,
      oi.qty_paid,
      oi.qty_deferred,
      greatest(oi.qty_ready - oi.qty_delivered, 0) as qty_ready_for_delivery,
      oi.created_at
    from ops.order_items oi
    join ops.service_sessions ss
      on ss.id = oi.service_session_id
     and ss.cafe_id = oi.cafe_id
    join ops.menu_products mp
      on mp.id = oi.menu_product_id
     and mp.cafe_id = oi.cafe_id
    where oi.cafe_id = p_cafe_id
      and oi.shift_id = p_shift_id
      and greatest(oi.qty_ready - oi.qty_delivered, 0) > 0
    order by oi.created_at asc
  ) q;
$$;

create or replace function public.ops_deliver_selected_quantities(
  p_cafe_id uuid,
  p_order_item_id uuid,
  p_quantity integer,
  p_by_staff_id uuid default null,
  p_by_owner_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_item ops.order_items%rowtype;
  v_remaining integer;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'p_quantity must be greater than zero';
  end if;

  if (p_by_staff_id is null and p_by_owner_id is null)
     or (p_by_staff_id is not null and p_by_owner_id is not null) then
    raise exception 'Exactly one actor is required';
  end if;

  select *
  into v_item
  from ops.order_items
  where cafe_id = p_cafe_id
    and id = p_order_item_id
  for update;

  if not found then
    raise exception 'order_item not found';
  end if;

  v_remaining := greatest(v_item.qty_ready - v_item.qty_delivered, 0);

  if v_remaining = 0 then
    raise exception 'No ready quantity available for delivery';
  end if;

  if p_quantity > v_remaining then
    raise exception 'Requested quantity % exceeds ready-for-delivery quantity %', p_quantity, v_remaining;
  end if;

  update ops.order_items
  set qty_delivered = qty_delivered + p_quantity
  where cafe_id = p_cafe_id
    and id = p_order_item_id;

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
  )
  values (
    v_item.cafe_id,
    v_item.shift_id,
    v_item.service_session_id,
    v_item.id,
    v_item.station_code,
    'delivered',
    p_quantity,
    p_notes,
    p_by_staff_id,
    p_by_owner_id
  );

  return jsonb_build_object(
    'ok', true,
    'order_item_id', v_item.id,
    'qty_delivered_now', p_quantity
  );
end;
$$;
