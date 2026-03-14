begin;

create or replace function public.ops_deliver_available_quantities(
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
  v_normal_ready integer;
  v_replacement_ready integer;
  v_normal_to_deliver integer;
  v_replacement_to_deliver integer;
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

  v_normal_ready := greatest(
    least(v_item.qty_ready, v_item.qty_total - v_item.qty_cancelled) - v_item.qty_delivered,
    0
  );
  v_replacement_ready := greatest(
    v_item.qty_ready
      - least(v_item.qty_ready, v_item.qty_total - v_item.qty_cancelled)
      - v_item.qty_replacement_delivered,
    0
  );

  if p_quantity > (v_normal_ready + v_replacement_ready) then
    raise exception 'Requested quantity % exceeds ready quantity %', p_quantity, (v_normal_ready + v_replacement_ready);
  end if;

  v_normal_to_deliver := least(p_quantity, v_normal_ready);
  v_replacement_to_deliver := greatest(least(p_quantity - v_normal_to_deliver, v_replacement_ready), 0);

  if v_normal_to_deliver > 0 then
    update ops.order_items
    set qty_delivered = qty_delivered + v_normal_to_deliver
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
      v_normal_to_deliver,
      p_notes,
      p_by_staff_id,
      p_by_owner_id
    );
  end if;

  if v_replacement_to_deliver > 0 then
    update ops.order_items
    set qty_replacement_delivered = qty_replacement_delivered + v_replacement_to_deliver
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
      'remake_delivered',
      v_replacement_to_deliver,
      p_notes,
      p_by_staff_id,
      p_by_owner_id
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'order_item_id', v_item.id,
    'delivered_qty', v_normal_to_deliver,
    'replacement_delivered_qty', v_replacement_to_deliver,
    'quantity', p_quantity
  );
end;
$$;

commit;
