begin;

create table if not exists ops.cafe_billing_settings (
  cafe_id uuid primary key
    references ops.cafes(id)
    on delete cascade,
  tax_enabled boolean not null default false,
  tax_rate numeric(6,2) not null default 0 check (tax_rate >= 0 and tax_rate <= 100),
  service_enabled boolean not null default false,
  service_rate numeric(6,2) not null default 0 check (service_rate >= 0 and service_rate <= 100),
  updated_at timestamptz not null default now(),
  updated_by_owner_id uuid,
  constraint fk_cafe_billing_settings_owner
    foreign key (cafe_id, updated_by_owner_id)
    references ops.owner_users(cafe_id, id)
    on delete set null
);

alter table ops.payments
  add column if not exists subtotal_amount numeric(12,2) not null default 0,
  add column if not exists tax_rate numeric(6,2) not null default 0,
  add column if not exists tax_amount numeric(12,2) not null default 0,
  add column if not exists service_rate numeric(6,2) not null default 0,
  add column if not exists service_amount numeric(12,2) not null default 0;

update ops.payments
set subtotal_amount = coalesce(total_amount, 0),
    tax_rate = coalesce(tax_rate, 0),
    tax_amount = coalesce(tax_amount, 0),
    service_rate = coalesce(service_rate, 0),
    service_amount = coalesce(service_amount, 0)
where subtotal_amount = 0
  and tax_amount = 0
  and service_amount = 0;

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
  v_subtotal_amount numeric(12,2) := 0;
  v_tax_rate numeric(6,2) := 0;
  v_tax_amount numeric(12,2) := 0;
  v_service_rate numeric(6,2) := 0;
  v_service_amount numeric(12,2) := 0;
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

  select
    case when coalesce(cbs.tax_enabled, false) then coalesce(cbs.tax_rate, 0) else 0 end,
    case when coalesce(cbs.service_enabled, false) then coalesce(cbs.service_rate, 0) else 0 end
  into v_tax_rate, v_service_rate
  from ops.cafes c
  left join ops.cafe_billing_settings cbs
    on cbs.cafe_id = c.id
  where c.id = p_cafe_id;

  insert into ops.payments (
    cafe_id,
    shift_id,
    service_session_id,
    payment_kind,
    subtotal_amount,
    tax_rate,
    tax_amount,
    service_rate,
    service_amount,
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
    v_tax_rate,
    0,
    v_service_rate,
    0,
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
    v_subtotal_amount := v_subtotal_amount + v_amount;
  end loop;

  v_tax_amount := round((v_subtotal_amount * (coalesce(v_tax_rate, 0) / 100))::numeric, 2);
  v_service_amount := round((v_subtotal_amount * (coalesce(v_service_rate, 0) / 100))::numeric, 2);
  v_total_amount := v_subtotal_amount + v_tax_amount + v_service_amount;

  update ops.payments
  set subtotal_amount = v_subtotal_amount,
      tax_rate = coalesce(v_tax_rate, 0),
      tax_amount = coalesce(v_tax_amount, 0),
      service_rate = coalesce(v_service_rate, 0),
      service_amount = coalesce(v_service_amount, 0),
      total_amount = v_total_amount
  where cafe_id = p_cafe_id
    and id = v_payment_id;

  return jsonb_build_object(
    'ok', true,
    'payment_id', v_payment_id,
    'total_quantity', v_total_quantity,
    'subtotal_amount', v_subtotal_amount,
    'tax_amount', v_tax_amount,
    'service_amount', v_service_amount,
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
  v_subtotal_amount numeric(12,2) := 0;
  v_tax_rate numeric(6,2) := 0;
  v_tax_amount numeric(12,2) := 0;
  v_service_rate numeric(6,2) := 0;
  v_service_amount numeric(12,2) := 0;
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

  select
    case when coalesce(cbs.tax_enabled, false) then coalesce(cbs.tax_rate, 0) else 0 end,
    case when coalesce(cbs.service_enabled, false) then coalesce(cbs.service_rate, 0) else 0 end
  into v_tax_rate, v_service_rate
  from ops.cafes c
  left join ops.cafe_billing_settings cbs
    on cbs.cafe_id = c.id
  where c.id = p_cafe_id;

  insert into ops.payments (
    cafe_id,
    shift_id,
    service_session_id,
    payment_kind,
    subtotal_amount,
    tax_rate,
    tax_amount,
    service_rate,
    service_amount,
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
    v_tax_rate,
    0,
    v_service_rate,
    0,
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
    v_subtotal_amount := v_subtotal_amount + v_amount;
  end loop;

  v_tax_amount := round((v_subtotal_amount * (coalesce(v_tax_rate, 0) / 100))::numeric, 2);
  v_service_amount := round((v_subtotal_amount * (coalesce(v_service_rate, 0) / 100))::numeric, 2);
  v_total_amount := v_subtotal_amount + v_tax_amount + v_service_amount;

  update ops.payments
  set subtotal_amount = v_subtotal_amount,
      tax_rate = coalesce(v_tax_rate, 0),
      tax_amount = coalesce(v_tax_amount, 0),
      service_rate = coalesce(v_service_rate, 0),
      service_amount = coalesce(v_service_amount, 0),
      total_amount = v_total_amount
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
    'subtotal_amount', v_subtotal_amount,
    'tax_amount', v_tax_amount,
    'service_amount', v_service_amount,
    'total_amount', v_total_amount
  );
end;
$$;

commit;
