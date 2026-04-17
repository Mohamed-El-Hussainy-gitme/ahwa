begin;

create table if not exists ops.inventory_items (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  item_name text not null,
  normalized_name text not null,
  item_code text,
  category_label text,
  unit_label text not null,
  current_balance numeric(14,3) not null default 0,
  low_stock_threshold numeric(14,3) not null default 0,
  notes text,
  is_active boolean not null default true,
  last_movement_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by_owner_id uuid,
  unique (cafe_id, id),
  constraint fk_inventory_items_owner
    foreign key (cafe_id, updated_by_owner_id)
    references ops.owner_users(cafe_id, id)
    on delete set null,
  constraint ck_inventory_items_name_nonempty
    check (length(btrim(item_name)) > 0),
  constraint ck_inventory_items_normalized_name_nonempty
    check (length(btrim(normalized_name)) > 0),
  constraint ck_inventory_items_unit_nonempty
    check (length(btrim(unit_label)) > 0),
  constraint ck_inventory_items_threshold_nonnegative
    check (low_stock_threshold >= 0)
);

create unique index if not exists idx_inventory_items_code_unique
  on ops.inventory_items (cafe_id, item_code)
  where item_code is not null and length(btrim(item_code)) > 0;

create index if not exists idx_inventory_items_cafe_name
  on ops.inventory_items (cafe_id, normalized_name);

create index if not exists idx_inventory_items_cafe_active_updated
  on ops.inventory_items (cafe_id, is_active, updated_at desc);

create table if not exists ops.inventory_suppliers (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  supplier_name text not null,
  normalized_name text not null,
  phone text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by_owner_id uuid,
  unique (cafe_id, id),
  constraint fk_inventory_suppliers_owner
    foreign key (cafe_id, updated_by_owner_id)
    references ops.owner_users(cafe_id, id)
    on delete set null,
  constraint ck_inventory_suppliers_name_nonempty
    check (length(btrim(supplier_name)) > 0),
  constraint ck_inventory_suppliers_normalized_name_nonempty
    check (length(btrim(normalized_name)) > 0)
);

create index if not exists idx_inventory_suppliers_cafe_name
  on ops.inventory_suppliers (cafe_id, normalized_name);

create index if not exists idx_inventory_suppliers_cafe_active_updated
  on ops.inventory_suppliers (cafe_id, is_active, updated_at desc);

create table if not exists ops.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  inventory_item_id uuid not null,
  supplier_id uuid,
  movement_kind text not null,
  delta_quantity numeric(14,3) not null,
  unit_label text not null,
  notes text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by_owner_id uuid,
  unique (cafe_id, id),
  constraint fk_inventory_movements_item
    foreign key (cafe_id, inventory_item_id)
    references ops.inventory_items(cafe_id, id)
    on delete cascade,
  constraint fk_inventory_movements_supplier
    foreign key (cafe_id, supplier_id)
    references ops.inventory_suppliers(cafe_id, id)
    on delete set null,
  constraint fk_inventory_movements_owner
    foreign key (cafe_id, created_by_owner_id)
    references ops.owner_users(cafe_id, id)
    on delete set null,
  constraint ck_inventory_movements_kind
    check (movement_kind in ('inbound', 'outbound', 'waste', 'adjustment')),
  constraint ck_inventory_movements_delta_nonzero
    check (delta_quantity <> 0),
  constraint ck_inventory_movements_unit_nonempty
    check (length(btrim(unit_label)) > 0)
);

create index if not exists idx_inventory_movements_item_occurred
  on ops.inventory_movements (cafe_id, inventory_item_id, occurred_at desc, created_at desc);

create index if not exists idx_inventory_movements_cafe_occurred
  on ops.inventory_movements (cafe_id, occurred_at desc, created_at desc);

create or replace function public.ops_record_inventory_movement(
  p_cafe_id uuid,
  p_inventory_item_id uuid,
  p_movement_kind text,
  p_delta_quantity numeric,
  p_supplier_id uuid default null,
  p_notes text default null,
  p_occurred_at timestamptz default null,
  p_actor_owner_id uuid default null
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
    nullif(btrim(p_notes), ''),
    v_occurred_at,
    p_actor_owner_id
  )
  returning id into v_movement_id;

  return jsonb_build_object(
    'movement_id', v_movement_id,
    'new_balance', v_new_balance,
    'unit_label', v_item.unit_label
  );
end;
$$;

commit;
