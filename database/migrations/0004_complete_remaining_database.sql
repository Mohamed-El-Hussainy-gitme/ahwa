begin;

alter table ops.payments
  alter column service_session_id drop not null;

alter table ops.order_items
  add column if not exists qty_replacement_delivered integer not null default 0;

alter table ops.order_items
  drop constraint if exists ck_order_items_progress;

alter table ops.order_items
  add constraint ck_order_items_progress
  check (
    qty_submitted <= qty_total
    and qty_ready <= qty_submitted + qty_remade
    and qty_delivered <= qty_ready
    and qty_replacement_delivered <= qty_ready
    and qty_replacement_delivered <= qty_remade
    and qty_paid + qty_deferred <= qty_delivered
    and qty_cancelled <= qty_total
  );

alter table ops.fulfillment_events
  drop constraint if exists fulfillment_events_event_code_check;

alter table ops.fulfillment_events
  add constraint fulfillment_events_event_code_check
  check (
    event_code in (
      'submitted',
      'partial_ready',
      'ready',
      'delivered',
      'remake_requested',
      'remake_submitted',
      'remake_delivered',
      'cancelled'
    )
  );

create index if not exists idx_order_items_session_label_lookup
  on ops.service_sessions(cafe_id, shift_id, session_label);

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
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at asc), '[]'::jsonb)
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
      oi.qty_replacement_delivered,
      oi.qty_paid,
      oi.qty_deferred,
      oi.qty_remade,
      oi.qty_cancelled,
      greatest(oi.qty_submitted - least(oi.qty_ready, oi.qty_submitted) - oi.qty_cancelled, 0) as qty_waiting_original,
      greatest(oi.qty_remade - greatest(oi.qty_ready - least(oi.qty_ready, oi.qty_submitted), 0), 0) as qty_waiting_replacement,
      greatest(oi.qty_submitted - least(oi.qty_ready, oi.qty_submitted) - oi.qty_cancelled, 0)
        + greatest(oi.qty_remade - greatest(oi.qty_ready - least(oi.qty_ready, oi.qty_submitted), 0), 0) as qty_waiting,
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
      and (
        greatest(oi.qty_submitted - least(oi.qty_ready, oi.qty_submitted) - oi.qty_cancelled, 0)
        + greatest(oi.qty_remade - greatest(oi.qty_ready - least(oi.qty_ready, oi.qty_submitted), 0), 0)
      ) > 0
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

  v_waiting :=
      greatest(v_item.qty_submitted - least(v_item.qty_ready, v_item.qty_submitted) - v_item.qty_cancelled, 0)
    + greatest(v_item.qty_remade - greatest(v_item.qty_ready - least(v_item.qty_ready, v_item.qty_submitted), 0), 0);

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

drop function if exists public.ops_mark_ready(uuid, uuid, integer, uuid, uuid, text);

create or replace function public.ops_mark_ready(
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

  v_waiting :=
      greatest(v_item.qty_submitted - least(v_item.qty_ready, v_item.qty_submitted) - v_item.qty_cancelled, 0)
    + greatest(v_item.qty_remade - greatest(v_item.qty_ready - least(v_item.qty_ready, v_item.qty_submitted), 0), 0);

  if v_waiting = 0 then
    raise exception 'No waiting quantity available for ready';
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
    'ready',
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

create or replace function public.ops_list_ready_for_delivery(
  p_cafe_id uuid,
  p_shift_id uuid,
  p_service_session_id uuid default null
)
returns jsonb
language sql
security definer
set search_path = public, ops
as $$
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at asc), '[]'::jsonb)
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
      oi.qty_replacement_delivered,
      oi.qty_paid,
      oi.qty_deferred,
      greatest(least(oi.qty_ready, oi.qty_total - oi.qty_cancelled) - oi.qty_delivered, 0) as qty_ready_for_normal_delivery,
      greatest(oi.qty_ready - least(oi.qty_ready, oi.qty_total - oi.qty_cancelled) - oi.qty_replacement_delivered, 0) as qty_ready_for_replacement_delivery,
      greatest(least(oi.qty_ready, oi.qty_total - oi.qty_cancelled) - oi.qty_delivered, 0)
        + greatest(oi.qty_ready - least(oi.qty_ready, oi.qty_total - oi.qty_cancelled) - oi.qty_replacement_delivered, 0) as qty_ready_for_delivery,
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
      and (p_service_session_id is null or oi.service_session_id = p_service_session_id)
      and (
        greatest(least(oi.qty_ready, oi.qty_total - oi.qty_cancelled) - oi.qty_delivered, 0)
        + greatest(oi.qty_ready - least(oi.qty_ready, oi.qty_total - oi.qty_cancelled) - oi.qty_replacement_delivered, 0)
      ) > 0
    order by oi.created_at asc
  ) q;
$$;

create or replace function public.ops_deliver_selected_quantities(
  p_cafe_id uuid,
  p_order_item_id uuid,
  p_quantity integer,
  p_delivery_kind text default 'normal',
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
  v_event_code text;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'p_quantity must be greater than zero';
  end if;

  if p_delivery_kind not in ('normal', 'replacement') then
    raise exception 'p_delivery_kind must be normal or replacement';
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

  v_normal_ready := greatest(least(v_item.qty_ready, v_item.qty_total - v_item.qty_cancelled) - v_item.qty_delivered, 0);
  v_replacement_ready := greatest(v_item.qty_ready - least(v_item.qty_ready, v_item.qty_total - v_item.qty_cancelled) - v_item.qty_replacement_delivered, 0);

  if p_delivery_kind = 'normal' then
    if v_normal_ready = 0 then
      raise exception 'No normal ready quantity available for delivery';
    end if;
    if p_quantity > v_normal_ready then
      raise exception 'Requested quantity % exceeds normal ready quantity %', p_quantity, v_normal_ready;
    end if;

    update ops.order_items
    set qty_delivered = qty_delivered + p_quantity
    where cafe_id = p_cafe_id
      and id = p_order_item_id;

    v_event_code := 'delivered';
  else
    if v_replacement_ready = 0 then
      raise exception 'No replacement ready quantity available for delivery';
    end if;
    if p_quantity > v_replacement_ready then
      raise exception 'Requested quantity % exceeds replacement ready quantity %', p_quantity, v_replacement_ready;
    end if;

    update ops.order_items
    set qty_replacement_delivered = qty_replacement_delivered + p_quantity
    where cafe_id = p_cafe_id
      and id = p_order_item_id;

    v_event_code := 'remake_delivered';
  end if;

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
    v_event_code,
    p_quantity,
    p_notes,
    p_by_staff_id,
    p_by_owner_id
  );

  return jsonb_build_object(
    'ok', true,
    'order_item_id', v_item.id,
    'delivery_kind', p_delivery_kind,
    'quantity', p_quantity
  );
end;
$$;

create or replace function public.ops_request_remake(
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
  v_available integer;
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

  v_available := greatest((v_item.qty_delivered + v_item.qty_replacement_delivered) - v_item.qty_remade, 0);

  if v_available = 0 then
    raise exception 'No delivered quantity available to remake';
  end if;

  if p_quantity > v_available then
    raise exception 'Requested remake quantity % exceeds available quantity %', p_quantity, v_available;
  end if;

  update ops.order_items
  set qty_remade = qty_remade + p_quantity
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
  values
  (
    v_item.cafe_id,
    v_item.shift_id,
    v_item.service_session_id,
    v_item.id,
    v_item.station_code,
    'remake_requested',
    p_quantity,
    p_notes,
    p_by_staff_id,
    p_by_owner_id
  ),
  (
    v_item.cafe_id,
    v_item.shift_id,
    v_item.service_session_id,
    v_item.id,
    v_item.station_code,
    'remake_submitted',
    p_quantity,
    p_notes,
    p_by_staff_id,
    p_by_owner_id
  );

  return jsonb_build_object(
    'ok', true,
    'order_item_id', v_item.id,
    'qty_remake_requested', p_quantity
  );
end;
$$;

create or replace function public.ops_list_billable_quantities(
  p_cafe_id uuid,
  p_shift_id uuid,
  p_service_session_id uuid default null
)
returns jsonb
language sql
security definer
set search_path = public, ops
as $$
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at asc), '[]'::jsonb)
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
      oi.qty_delivered,
      oi.qty_paid,
      oi.qty_deferred,
      greatest(oi.qty_delivered - oi.qty_paid - oi.qty_deferred, 0) as qty_billable,
      (greatest(oi.qty_delivered - oi.qty_paid - oi.qty_deferred, 0) * oi.unit_price)::numeric(12,2) as amount_billable,
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
      and (p_service_session_id is null or oi.service_session_id = p_service_session_id)
      and greatest(oi.qty_delivered - oi.qty_paid - oi.qty_deferred, 0) > 0
    order by oi.created_at asc
  ) q;
$$;

create or replace function public.ops_settle_selected_quantities(
  p_cafe_id uuid,
  p_shift_id uuid,
  p_service_session_id uuid,
  p_lines jsonb,
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
  v_payment_id uuid;
  v_total_amount numeric(12,2) := 0;
  v_total_quantity integer := 0;
  v_line jsonb;
  v_item ops.order_items%rowtype;
  v_qty integer;
  v_available integer;
  v_amount numeric(12,2);
begin
  if p_service_session_id is null then
    raise exception 'p_service_session_id is required';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'p_lines must be a non-empty json array';
  end if;

  if (p_by_staff_id is null and p_by_owner_id is null)
     or (p_by_staff_id is not null and p_by_owner_id is not null) then
    raise exception 'Exactly one actor is required';
  end if;

  insert into ops.payments (
    cafe_id,
    shift_id,
    service_session_id,
    payment_kind,
    total_amount,
    notes,
    by_staff_id,
    by_owner_id
  )
  values (
    p_cafe_id,
    p_shift_id,
    p_service_session_id,
    'cash',
    0,
    p_notes,
    p_by_staff_id,
    p_by_owner_id
  )
  returning id into v_payment_id;

  for v_line in
    select value from jsonb_array_elements(p_lines)
  loop
    v_qty := coalesce((v_line ->> 'quantity')::integer, 0);

    if v_qty <= 0 then
      raise exception 'Each line quantity must be greater than zero';
    end if;

    select *
    into v_item
    from ops.order_items
    where cafe_id = p_cafe_id
      and shift_id = p_shift_id
      and service_session_id = p_service_session_id
      and id = (v_line ->> 'order_item_id')::uuid
    for update;

    if not found then
      raise exception 'order_item % not found in this session', v_line ->> 'order_item_id';
    end if;

    v_available := greatest(v_item.qty_delivered - v_item.qty_paid - v_item.qty_deferred, 0);

    if v_qty > v_available then
      raise exception 'Requested quantity % exceeds billable quantity % for order_item %', v_qty, v_available, v_item.id;
    end if;

    v_amount := (v_item.unit_price * v_qty)::numeric(12,2);

    update ops.order_items
    set qty_paid = qty_paid + v_qty
    where cafe_id = p_cafe_id
      and id = v_item.id;

    insert into ops.payment_allocations (
      cafe_id,
      payment_id,
      order_item_id,
      allocation_kind,
      quantity,
      amount
    )
    values (
      p_cafe_id,
      v_payment_id,
      v_item.id,
      'cash',
      v_qty,
      v_amount
    );

    v_total_quantity := v_total_quantity + v_qty;
    v_total_amount := v_total_amount + v_amount;
  end loop;

  update ops.payments
  set total_amount = v_total_amount
  where cafe_id = p_cafe_id
    and id = v_payment_id;

  return jsonb_build_object(
    'ok', true,
    'payment_id', v_payment_id,
    'total_quantity', v_total_quantity,
    'total_amount', v_total_amount
  );
end;
$$;

create or replace function public.ops_defer_selected_quantities(
  p_cafe_id uuid,
  p_shift_id uuid,
  p_service_session_id uuid,
  p_debtor_name text,
  p_lines jsonb,
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
  v_payment_id uuid;
  v_total_amount numeric(12,2) := 0;
  v_total_quantity integer := 0;
  v_line jsonb;
  v_item ops.order_items%rowtype;
  v_qty integer;
  v_available integer;
  v_amount numeric(12,2);
  v_name text;
begin
  v_name := nullif(btrim(p_debtor_name), '');

  if v_name is null then
    raise exception 'p_debtor_name is required';
  end if;

  if p_service_session_id is null then
    raise exception 'p_service_session_id is required';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'p_lines must be a non-empty json array';
  end if;

  if (p_by_staff_id is null and p_by_owner_id is null)
     or (p_by_staff_id is not null and p_by_owner_id is not null) then
    raise exception 'Exactly one actor is required';
  end if;

  insert into ops.payments (
    cafe_id,
    shift_id,
    service_session_id,
    payment_kind,
    total_amount,
    debtor_name,
    notes,
    by_staff_id,
    by_owner_id
  )
  values (
    p_cafe_id,
    p_shift_id,
    p_service_session_id,
    'deferred',
    0,
    v_name,
    p_notes,
    p_by_staff_id,
    p_by_owner_id
  )
  returning id into v_payment_id;

  for v_line in
    select value from jsonb_array_elements(p_lines)
  loop
    v_qty := coalesce((v_line ->> 'quantity')::integer, 0);

    if v_qty <= 0 then
      raise exception 'Each line quantity must be greater than zero';
    end if;

    select *
    into v_item
    from ops.order_items
    where cafe_id = p_cafe_id
      and shift_id = p_shift_id
      and service_session_id = p_service_session_id
      and id = (v_line ->> 'order_item_id')::uuid
    for update;

    if not found then
      raise exception 'order_item % not found in this session', v_line ->> 'order_item_id';
    end if;

    v_available := greatest(v_item.qty_delivered - v_item.qty_paid - v_item.qty_deferred, 0);

    if v_qty > v_available then
      raise exception 'Requested quantity % exceeds billable quantity % for order_item %', v_qty, v_available, v_item.id;
    end if;

    v_amount := (v_item.unit_price * v_qty)::numeric(12,2);

    update ops.order_items
    set qty_deferred = qty_deferred + v_qty
    where cafe_id = p_cafe_id
      and id = v_item.id;

    insert into ops.payment_allocations (
      cafe_id,
      payment_id,
      order_item_id,
      allocation_kind,
      quantity,
      amount
    )
    values (
      p_cafe_id,
      v_payment_id,
      v_item.id,
      'deferred',
      v_qty,
      v_amount
    );

    v_total_quantity := v_total_quantity + v_qty;
    v_total_amount := v_total_amount + v_amount;
  end loop;

  update ops.payments
  set total_amount = v_total_amount
  where cafe_id = p_cafe_id
    and id = v_payment_id;

  insert into ops.deferred_ledger_entries (
    cafe_id,
    service_session_id,
    payment_id,
    debtor_name,
    entry_kind,
    amount,
    notes,
    by_staff_id,
    by_owner_id
  )
  values (
    p_cafe_id,
    p_service_session_id,
    v_payment_id,
    v_name,
    'debt',
    v_total_amount,
    p_notes,
    p_by_staff_id,
    p_by_owner_id
  );

  return jsonb_build_object(
    'ok', true,
    'payment_id', v_payment_id,
    'debtor_name', v_name,
    'total_quantity', v_total_quantity,
    'total_amount', v_total_amount
  );
end;
$$;

create or replace function public.ops_record_repayment(
  p_cafe_id uuid,
  p_shift_id uuid,
  p_debtor_name text,
  p_amount numeric,
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
  v_payment_id uuid;
  v_name text;
  v_balance numeric(12,2);
begin
  v_name := nullif(btrim(p_debtor_name), '');

  if v_name is null then
    raise exception 'p_debtor_name is required';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'p_amount must be greater than zero';
  end if;

  if (p_by_staff_id is null and p_by_owner_id is null)
     or (p_by_staff_id is not null and p_by_owner_id is not null) then
    raise exception 'Exactly one actor is required';
  end if;

  insert into ops.payments (
    cafe_id,
    shift_id,
    service_session_id,
    payment_kind,
    total_amount,
    debtor_name,
    notes,
    by_staff_id,
    by_owner_id
  )
  values (
    p_cafe_id,
    p_shift_id,
    null,
    'repayment',
    p_amount,
    v_name,
    p_notes,
    p_by_staff_id,
    p_by_owner_id
  )
  returning id into v_payment_id;

  insert into ops.deferred_ledger_entries (
    cafe_id,
    service_session_id,
    payment_id,
    debtor_name,
    entry_kind,
    amount,
    notes,
    by_staff_id,
    by_owner_id
  )
  values (
    p_cafe_id,
    null,
    v_payment_id,
    v_name,
    'repayment',
    p_amount,
    p_notes,
    p_by_staff_id,
    p_by_owner_id
  );

  select coalesce(sum(
    case entry_kind
      when 'debt' then amount
      when 'repayment' then -amount
      else 0
    end
  ), 0)::numeric(12,2)
  into v_balance
  from ops.deferred_ledger_entries
  where cafe_id = p_cafe_id
    and debtor_name = v_name;

  return jsonb_build_object(
    'ok', true,
    'payment_id', v_payment_id,
    'debtor_name', v_name,
    'repayment_amount', p_amount,
    'balance_after', v_balance
  );
end;
$$;

create or replace function public.ops_read_deferred_balance(
  p_cafe_id uuid,
  p_debtor_name text
)
returns jsonb
language sql
security definer
set search_path = public, ops
as $$
  with ledger as (
    select
      debtor_name,
      coalesce(sum(case when entry_kind = 'debt' then amount else 0 end), 0)::numeric(12,2) as total_debt,
      coalesce(sum(case when entry_kind = 'repayment' then amount else 0 end), 0)::numeric(12,2) as total_repayment
    from ops.deferred_ledger_entries
    where cafe_id = p_cafe_id
      and debtor_name = p_debtor_name
    group by debtor_name
  )
  select coalesce(
    (
      select jsonb_build_object(
        'debtor_name', debtor_name,
        'total_debt', total_debt,
        'total_repayment', total_repayment,
        'balance', (total_debt - total_repayment)::numeric(12,2)
      )
      from ledger
    ),
    jsonb_build_object(
      'debtor_name', p_debtor_name,
      'total_debt', 0,
      'total_repayment', 0,
      'balance', 0
    )
  );
$$;

create or replace function public.ops_read_deferred_customer_ledger(
  p_cafe_id uuid,
  p_debtor_name text
)
returns jsonb
language sql
security definer
set search_path = public, ops
as $$
  with rows_cte as (
    select
      dle.id,
      dle.payment_id,
      dle.service_session_id,
      dle.debtor_name,
      dle.entry_kind,
      dle.amount,
      dle.notes,
      dle.created_at,
      sum(
        case dle.entry_kind
          when 'debt' then dle.amount
          when 'repayment' then -dle.amount
          else 0
        end
      ) over (order by dle.created_at asc, dle.id asc) as balance_after
    from ops.deferred_ledger_entries dle
    where dle.cafe_id = p_cafe_id
      and dle.debtor_name = p_debtor_name
  )
  select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at asc), '[]'::jsonb)
  from rows_cte r;
$$;

create or replace function public.ops_close_service_session(
  p_cafe_id uuid,
  p_service_session_id uuid,
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
  v_session ops.service_sessions%rowtype;
  v_waiting integer;
  v_ready_undelivered integer;
  v_billable integer;
begin
  if (p_by_staff_id is null and p_by_owner_id is null)
     or (p_by_staff_id is not null and p_by_owner_id is not null) then
    raise exception 'Exactly one actor is required';
  end if;

  select *
  into v_session
  from ops.service_sessions
  where cafe_id = p_cafe_id
    and id = p_service_session_id
  for update;

  if not found then
    raise exception 'service_session not found';
  end if;

  if v_session.status <> 'open' then
    raise exception 'service_session is already closed';
  end if;

  select
    coalesce(sum(
      greatest(qty_submitted - least(qty_ready, qty_submitted) - qty_cancelled, 0)
      + greatest(qty_remade - greatest(qty_ready - least(qty_ready, qty_submitted), 0), 0)
    ), 0),
    coalesce(sum(
      greatest(least(qty_ready, qty_total - qty_cancelled) - qty_delivered, 0)
      + greatest(qty_ready - least(qty_ready, qty_total - qty_cancelled) - qty_replacement_delivered, 0)
    ), 0),
    coalesce(sum(greatest(qty_delivered - qty_paid - qty_deferred, 0)), 0)
  into v_waiting, v_ready_undelivered, v_billable
  from ops.order_items
  where cafe_id = p_cafe_id
    and service_session_id = p_service_session_id;

  if v_waiting > 0 then
    raise exception 'Cannot close service session while station queue is still pending';
  end if;

  if v_ready_undelivered > 0 then
    raise exception 'Cannot close service session while ready quantities are not delivered';
  end if;

  if v_billable > 0 then
    raise exception 'Cannot close service session while delivered unpaid quantities exist';
  end if;

  update ops.service_sessions
  set status = 'closed',
      closed_at = now(),
      closed_by_staff_id = p_by_staff_id,
      closed_by_owner_id = p_by_owner_id,
      notes = coalesce(p_notes, notes)
  where cafe_id = p_cafe_id
    and id = p_service_session_id;

  update ops.orders
  set status = 'completed'
  where cafe_id = p_cafe_id
    and service_session_id = p_service_session_id
    and status <> 'cancelled';

  return jsonb_build_object(
    'ok', true,
    'service_session_id', p_service_session_id,
    'status', 'closed'
  );
end;
$$;

create or replace function public.ops_build_shift_snapshot(
  p_cafe_id uuid,
  p_shift_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_shift ops.shifts%rowtype;
  v_snapshot jsonb;
  v_totals jsonb;
  v_products jsonb;
  v_staff jsonb;
  v_sessions jsonb;
begin
  select *
  into v_shift
  from ops.shifts
  where cafe_id = p_cafe_id
    and id = p_shift_id;

  if not found then
    raise exception 'shift not found';
  end if;

  select jsonb_build_object(
    'submitted_qty', coalesce(sum(oi.qty_submitted), 0),
    'ready_qty', coalesce(sum(oi.qty_ready), 0),
    'delivered_qty', coalesce(sum(oi.qty_delivered), 0),
    'replacement_delivered_qty', coalesce(sum(oi.qty_replacement_delivered), 0),
    'paid_qty', coalesce(sum(oi.qty_paid), 0),
    'deferred_qty', coalesce(sum(oi.qty_deferred), 0),
    'remade_qty', coalesce(sum(oi.qty_remade), 0),
    'cancelled_qty', coalesce(sum(oi.qty_cancelled), 0),
    'cash_total', coalesce(sum(case when p.payment_kind = 'cash' then p.total_amount else 0 end), 0)::numeric(12,2),
    'deferred_total', coalesce(sum(case when p.payment_kind = 'deferred' then p.total_amount else 0 end), 0)::numeric(12,2),
    'repayment_total', coalesce(sum(case when p.payment_kind = 'repayment' then p.total_amount else 0 end), 0)::numeric(12,2)
  )
  into v_totals
  from ops.order_items oi
  left join ops.payments p
    on p.cafe_id = oi.cafe_id
   and p.shift_id = oi.shift_id
  where oi.cafe_id = p_cafe_id
    and oi.shift_id = p_shift_id;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.product_name), '[]'::jsonb)
  into v_products
  from (
    select
      mp.product_name,
      oi.station_code,
      sum(oi.qty_submitted) as qty_submitted,
      sum(oi.qty_delivered) as qty_delivered,
      sum(oi.qty_paid) as qty_paid,
      sum(oi.qty_deferred) as qty_deferred,
      sum(oi.qty_remade) as qty_remade,
      sum((oi.qty_paid + oi.qty_deferred) * oi.unit_price)::numeric(12,2) as billed_amount
    from ops.order_items oi
    join ops.menu_products mp
      on mp.id = oi.menu_product_id
     and mp.cafe_id = oi.cafe_id
    where oi.cafe_id = p_cafe_id
      and oi.shift_id = p_shift_id
    group by mp.product_name, oi.station_code
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.actor_label), '[]'::jsonb)
  into v_staff
  from (
    select
      actor_label,
      sum(submitted_qty) as submitted_qty,
      sum(ready_qty) as ready_qty,
      sum(delivered_qty) as delivered_qty,
      sum(payment_total)::numeric(12,2) as payment_total
    from (
      select
        sm.full_name as actor_label,
        0::bigint as submitted_qty,
        0::bigint as ready_qty,
        0::bigint as delivered_qty,
        coalesce(sum(p.total_amount), 0)::numeric(12,2) as payment_total
      from ops.payments p
      join ops.staff_members sm
        on sm.id = p.by_staff_id
       and sm.cafe_id = p.cafe_id
      where p.cafe_id = p_cafe_id
        and p.shift_id = p_shift_id
      group by sm.full_name

      union all

      select
        ou.full_name as actor_label,
        0::bigint,
        0::bigint,
        0::bigint,
        coalesce(sum(p.total_amount), 0)::numeric(12,2)
      from ops.payments p
      join ops.owner_users ou
        on ou.id = p.by_owner_id
       and ou.cafe_id = p.cafe_id
      where p.cafe_id = p_cafe_id
        and p.shift_id = p_shift_id
      group by ou.full_name

      union all

      select
        sm.full_name as actor_label,
        coalesce(sum(case when fe.event_code in ('submitted', 'remake_submitted') then fe.quantity else 0 end), 0)::bigint,
        coalesce(sum(case when fe.event_code in ('partial_ready', 'ready') then fe.quantity else 0 end), 0)::bigint,
        coalesce(sum(case when fe.event_code in ('delivered', 'remake_delivered') then fe.quantity else 0 end), 0)::bigint,
        0::numeric(12,2)
      from ops.fulfillment_events fe
      join ops.staff_members sm
        on sm.id = fe.by_staff_id
       and sm.cafe_id = fe.cafe_id
      where fe.cafe_id = p_cafe_id
        and fe.shift_id = p_shift_id
      group by sm.full_name

      union all

      select
        ou.full_name as actor_label,
        coalesce(sum(case when fe.event_code in ('submitted', 'remake_submitted') then fe.quantity else 0 end), 0)::bigint,
        coalesce(sum(case when fe.event_code in ('partial_ready', 'ready') then fe.quantity else 0 end), 0)::bigint,
        coalesce(sum(case when fe.event_code in ('delivered', 'remake_delivered') then fe.quantity else 0 end), 0)::bigint,
        0::numeric(12,2)
      from ops.fulfillment_events fe
      join ops.owner_users ou
        on ou.id = fe.by_owner_id
       and ou.cafe_id = fe.cafe_id
      where fe.cafe_id = p_cafe_id
        and fe.shift_id = p_shift_id
      group by ou.full_name
    ) raw
    group by actor_label
  ) x;

  select jsonb_build_object(
    'open_sessions', coalesce(sum(case when status = 'open' then 1 else 0 end), 0),
    'closed_sessions', coalesce(sum(case when status = 'closed' then 1 else 0 end), 0)
  )
  into v_sessions
  from ops.service_sessions
  where cafe_id = p_cafe_id
    and shift_id = p_shift_id;

  v_snapshot := jsonb_build_object(
    'shift', jsonb_build_object(
      'shift_id', v_shift.id,
      'shift_kind', v_shift.shift_kind,
      'business_date', v_shift.business_date,
      'status', v_shift.status,
      'opened_at', v_shift.opened_at,
      'closed_at', v_shift.closed_at
    ),
    'totals', coalesce(v_totals, '{}'::jsonb),
    'sessions', coalesce(v_sessions, '{}'::jsonb),
    'products', coalesce(v_products, '[]'::jsonb),
    'staff', coalesce(v_staff, '[]'::jsonb)
  );

  insert into ops.shift_snapshots (
    cafe_id,
    shift_id,
    snapshot_json
  )
  values (
    p_cafe_id,
    p_shift_id,
    v_snapshot
  )
  on conflict (cafe_id, shift_id)
  do update set snapshot_json = excluded.snapshot_json,
                created_at = now();

  return v_snapshot;
end;
$$;

create or replace function public.ops_close_shift(
  p_cafe_id uuid,
  p_shift_id uuid,
  p_by_owner_id uuid,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_open_sessions integer;
  v_snapshot jsonb;
begin
  if p_by_owner_id is null then
    raise exception 'p_by_owner_id is required';
  end if;

  select count(*)
  into v_open_sessions
  from ops.service_sessions
  where cafe_id = p_cafe_id
    and shift_id = p_shift_id
    and status = 'open';

  if v_open_sessions > 0 then
    raise exception 'Cannot close shift while open service sessions exist';
  end if;

  v_snapshot := public.ops_build_shift_snapshot(p_cafe_id, p_shift_id);

  update ops.shifts
  set status = 'closed',
      closed_at = now(),
      closed_by_owner_id = p_by_owner_id,
      notes = coalesce(p_notes, notes)
  where cafe_id = p_cafe_id
    and id = p_shift_id
    and status = 'open';

  if not found then
    raise exception 'shift not found or already closed';
  end if;

  return jsonb_build_object(
    'ok', true,
    'shift_id', p_shift_id,
    'status', 'closed',
    'snapshot', v_snapshot
  );
end;
$$;

create schema if not exists platform;

create table if not exists platform.super_admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text not null,
  password_hash text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists platform.support_access_grants (
  id uuid primary key default gen_random_uuid(),
  super_admin_user_id uuid not null references platform.super_admin_users(id) on delete cascade,
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  is_active boolean not null default true,
  notes text,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_platform_support_access_cafe
  on platform.support_access_grants(cafe_id, is_active, created_at desc);

create or replace function public.platform_create_super_admin_user(
  p_email text,
  p_display_name text,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, platform
as $$
declare
  v_email text;
  v_id uuid;
begin
  v_email := lower(nullif(btrim(p_email), ''));

  if v_email is null then
    raise exception 'p_email is required';
  end if;

  if nullif(btrim(p_display_name), '') is null then
    raise exception 'p_display_name is required';
  end if;

  if nullif(p_password, '') is null then
    raise exception 'p_password is required';
  end if;

  insert into platform.super_admin_users (
    email,
    display_name,
    password_hash
  )
  values (
    v_email,
    p_display_name,
    crypt(p_password, gen_salt('bf'))
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'super_admin_user_id', v_id,
    'email', v_email
  );
end;
$$;

create or replace function public.platform_create_cafe_with_owner(
  p_super_admin_user_id uuid,
  p_cafe_slug text,
  p_cafe_display_name text,
  p_owner_full_name text,
  p_owner_phone text,
  p_owner_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, platform
as $$
declare
  v_admin platform.super_admin_users%rowtype;
  v_cafe_id uuid;
  v_owner_id uuid;
  v_slug text;
begin
  select *
  into v_admin
  from platform.super_admin_users
  where id = p_super_admin_user_id
    and is_active = true;

  if not found then
    raise exception 'active super admin not found';
  end if;

  v_slug := lower(nullif(btrim(p_cafe_slug), ''));

  if v_slug is null then
    raise exception 'p_cafe_slug is required';
  end if;

  if nullif(btrim(p_cafe_display_name), '') is null then
    raise exception 'p_cafe_display_name is required';
  end if;

  if nullif(btrim(p_owner_full_name), '') is null then
    raise exception 'p_owner_full_name is required';
  end if;

  if nullif(btrim(p_owner_phone), '') is null then
    raise exception 'p_owner_phone is required';
  end if;

  if nullif(p_owner_password, '') is null then
    raise exception 'p_owner_password is required';
  end if;

  insert into ops.cafes (
    slug,
    display_name,
    is_active
  )
  values (
    v_slug,
    p_cafe_display_name,
    true
  )
  returning id into v_cafe_id;

  insert into ops.owner_users (
    cafe_id,
    full_name,
    phone,
    password_hash,
    is_active
  )
  values (
    v_cafe_id,
    p_owner_full_name,
    p_owner_phone,
    crypt(p_owner_password, gen_salt('bf')),
    true
  )
  returning id into v_owner_id;

  insert into ops.audit_events (
    cafe_id,
    actor_type,
    actor_label,
    event_code,
    entity_type,
    entity_id,
    payload
  )
  values (
    v_cafe_id,
    'super_admin',
    v_admin.email,
    'platform_create_cafe_with_owner',
    'cafe',
    v_cafe_id,
    jsonb_build_object(
      'owner_user_id', v_owner_id,
      'owner_phone', p_owner_phone
    )
  );

  return jsonb_build_object(
    'ok', true,
    'cafe_id', v_cafe_id,
    'owner_user_id', v_owner_id,
    'slug', v_slug
  );
end;
$$;

create or replace function public.platform_reset_owner_password(
  p_super_admin_user_id uuid,
  p_cafe_id uuid,
  p_owner_user_id uuid,
  p_new_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, platform
as $$
declare
  v_admin platform.super_admin_users%rowtype;
begin
  select *
  into v_admin
  from platform.super_admin_users
  where id = p_super_admin_user_id
    and is_active = true;

  if not found then
    raise exception 'active super admin not found';
  end if;

  if nullif(p_new_password, '') is null then
    raise exception 'p_new_password is required';
  end if;

  update ops.owner_users
  set password_hash = crypt(p_new_password, gen_salt('bf'))
  where cafe_id = p_cafe_id
    and id = p_owner_user_id;

  if not found then
    raise exception 'owner user not found';
  end if;

  insert into ops.audit_events (
    cafe_id,
    actor_type,
    actor_label,
    event_code,
    entity_type,
    entity_id,
    payload
  )
  values (
    p_cafe_id,
    'super_admin',
    v_admin.email,
    'platform_reset_owner_password',
    'owner_user',
    p_owner_user_id,
    '{}'::jsonb
  );

  return jsonb_build_object(
    'ok', true,
    'owner_user_id', p_owner_user_id
  );
end;
$$;

create or replace function public.platform_grant_support_access(
  p_super_admin_user_id uuid,
  p_cafe_id uuid,
  p_notes text default null,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, platform
as $$
declare
  v_admin platform.super_admin_users%rowtype;
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

  insert into platform.support_access_grants (
    super_admin_user_id,
    cafe_id,
    is_active,
    notes,
    expires_at
  )
  values (
    p_super_admin_user_id,
    p_cafe_id,
    true,
    p_notes,
    p_expires_at
  )
  returning id into v_grant_id;

  return jsonb_build_object(
    'ok', true,
    'support_access_grant_id', v_grant_id
  );
end;
$$;

create or replace function public.platform_list_cafes()
returns jsonb
language sql
security definer
set search_path = public, ops, platform
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
  from (
    select
      c.id,
      c.slug,
      c.display_name,
      c.is_active,
      c.created_at,
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', ou.id,
            'full_name', ou.full_name,
            'phone', ou.phone,
            'is_active', ou.is_active,
            'created_at', ou.created_at
          ) order by ou.created_at asc
        )
        from ops.owner_users ou
        where ou.cafe_id = c.id
      ) as owners
    from ops.cafes c
  ) x;
$$;

commit;
