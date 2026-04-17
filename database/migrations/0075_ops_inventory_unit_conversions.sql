begin;

alter table ops.inventory_items
  add column if not exists purchase_unit_label text,
  add column if not exists purchase_to_stock_factor numeric(14,3) not null default 1;

update ops.inventory_items
set purchase_to_stock_factor = 1
where purchase_to_stock_factor is null or purchase_to_stock_factor <= 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ck_inventory_items_purchase_factor_positive'
  ) then
    alter table ops.inventory_items
      add constraint ck_inventory_items_purchase_factor_positive
      check (purchase_to_stock_factor > 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ck_inventory_items_purchase_unit_nonempty'
  ) then
    alter table ops.inventory_items
      add constraint ck_inventory_items_purchase_unit_nonempty
      check (purchase_unit_label is null or length(btrim(purchase_unit_label)) > 0);
  end if;
end $$;

alter table ops.inventory_movements
  add column if not exists input_quantity numeric(14,3),
  add column if not exists input_unit_label text,
  add column if not exists conversion_factor numeric(14,3);

update ops.inventory_movements
set input_quantity = abs(delta_quantity),
    input_unit_label = unit_label,
    conversion_factor = 1
where input_quantity is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ck_inventory_movements_input_quantity_positive'
  ) then
    alter table ops.inventory_movements
      add constraint ck_inventory_movements_input_quantity_positive
      check (input_quantity is null or input_quantity > 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ck_inventory_movements_input_unit_nonempty'
  ) then
    alter table ops.inventory_movements
      add constraint ck_inventory_movements_input_unit_nonempty
      check (input_unit_label is null or length(btrim(input_unit_label)) > 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ck_inventory_movements_conversion_factor_positive'
  ) then
    alter table ops.inventory_movements
      add constraint ck_inventory_movements_conversion_factor_positive
      check (conversion_factor is null or conversion_factor > 0);
  end if;
end $$;

drop function if exists public.ops_record_inventory_movement(uuid, uuid, text, numeric, uuid, text, timestamptz, uuid);

create or replace function public.ops_record_inventory_movement(
  p_cafe_id uuid,
  p_inventory_item_id uuid,
  p_movement_kind text,
  p_delta_quantity numeric,
  p_supplier_id uuid default null,
  p_notes text default null,
  p_occurred_at timestamptz default null,
  p_actor_owner_id uuid default null,
  p_input_quantity numeric default null,
  p_input_unit_label text default null,
  p_conversion_factor numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_item ops.inventory_items%rowtype;
  v_occurred_at timestamptz := coalesce(p_occurred_at, now());
  v_movement_id uuid;
  v_new_balance numeric(14,3);
  v_input_quantity numeric(14,3) := coalesce(p_input_quantity, abs(p_delta_quantity));
  v_input_unit_label text := nullif(btrim(coalesce(p_input_unit_label, '')), '');
  v_conversion_factor numeric(14,3) := coalesce(p_conversion_factor, 1);
begin
  if p_cafe_id is null then
    raise exception 'inventory_cafe_required';
  end if;

  if p_inventory_item_id is null then
    raise exception 'inventory_item_required';
  end if;

  if p_actor_owner_id is null then
    raise exception 'inventory_actor_owner_required';
  end if;

  if p_movement_kind not in ('inbound', 'outbound', 'waste', 'adjustment') then
    raise exception 'inventory_movement_kind_invalid';
  end if;

  if p_delta_quantity is null or p_delta_quantity = 0 then
    raise exception 'inventory_delta_required';
  end if;

  if p_movement_kind = 'inbound' and p_delta_quantity <= 0 then
    raise exception 'inventory_inbound_delta_invalid';
  end if;

  if p_movement_kind in ('outbound', 'waste') and p_delta_quantity >= 0 then
    raise exception 'inventory_outbound_delta_invalid';
  end if;

  if v_input_quantity is null or v_input_quantity <= 0 then
    raise exception 'inventory_input_quantity_invalid';
  end if;

  if v_conversion_factor is null or v_conversion_factor <= 0 then
    raise exception 'inventory_conversion_factor_invalid';
  end if;

  if not exists (
    select 1
    from ops.owner_users ou
    where ou.cafe_id = p_cafe_id
      and ou.id = p_actor_owner_id
      and ou.is_active = true
  ) then
    raise exception 'inventory_actor_owner_not_active';
  end if;

  select *
  into v_item
  from ops.inventory_items ii
  where ii.cafe_id = p_cafe_id
    and ii.id = p_inventory_item_id
  for update;

  if not found then
    raise exception 'inventory_item_not_found';
  end if;

  if not v_item.is_active then
    raise exception 'inventory_item_inactive';
  end if;

  if p_supplier_id is not null and not exists (
    select 1
    from ops.inventory_suppliers s
    where s.cafe_id = p_cafe_id
      and s.id = p_supplier_id
  ) then
    raise exception 'inventory_supplier_not_found';
  end if;

  if v_input_unit_label is null then
    v_input_unit_label := v_item.unit_label;
  end if;

  v_new_balance := coalesce(v_item.current_balance, 0) + p_delta_quantity;

  update ops.inventory_items
  set current_balance = v_new_balance,
      last_movement_at = v_occurred_at,
      updated_at = now(),
      updated_by_owner_id = p_actor_owner_id
  where cafe_id = p_cafe_id
    and id = p_inventory_item_id;

  insert into ops.inventory_movements (
    cafe_id,
    inventory_item_id,
    supplier_id,
    movement_kind,
    delta_quantity,
    unit_label,
    input_quantity,
    input_unit_label,
    conversion_factor,
    notes,
    occurred_at,
    created_by_owner_id
  ) values (
    p_cafe_id,
    p_inventory_item_id,
    p_supplier_id,
    p_movement_kind,
    p_delta_quantity,
    v_item.unit_label,
    v_input_quantity,
    v_input_unit_label,
    v_conversion_factor,
    nullif(btrim(p_notes), ''),
    v_occurred_at,
    p_actor_owner_id
  )
  returning id into v_movement_id;

  return jsonb_build_object(
    'movement_id', v_movement_id,
    'new_balance', v_new_balance,
    'unit_label', v_item.unit_label,
    'input_quantity', v_input_quantity,
    'input_unit_label', v_input_unit_label,
    'conversion_factor', v_conversion_factor
  );
end;
$$;

commit;
