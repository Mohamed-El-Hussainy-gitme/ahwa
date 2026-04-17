begin;

create table if not exists ops.inventory_product_recipes (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  menu_product_id uuid not null,
  inventory_item_id uuid not null,
  quantity_per_unit numeric(14,3) not null,
  wastage_percent numeric(8,3) not null default 0,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by_owner_id uuid,
  unique (cafe_id, id),
  unique (cafe_id, menu_product_id, inventory_item_id),
  constraint fk_inventory_product_recipes_product
    foreign key (cafe_id, menu_product_id)
    references ops.menu_products(cafe_id, id)
    on delete cascade,
  constraint fk_inventory_product_recipes_item
    foreign key (cafe_id, inventory_item_id)
    references ops.inventory_items(cafe_id, id)
    on delete cascade,
  constraint fk_inventory_product_recipes_owner
    foreign key (cafe_id, updated_by_owner_id)
    references ops.owner_users(cafe_id, id)
    on delete set null,
  constraint ck_inventory_product_recipes_quantity_positive
    check (quantity_per_unit > 0),
  constraint ck_inventory_product_recipes_wastage_nonnegative
    check (wastage_percent >= 0 and wastage_percent <= 500)
);

create index if not exists idx_inventory_product_recipes_product
  on ops.inventory_product_recipes (cafe_id, menu_product_id, is_active, updated_at desc);

create index if not exists idx_inventory_product_recipes_item
  on ops.inventory_product_recipes (cafe_id, inventory_item_id, is_active, updated_at desc);

create table if not exists ops.inventory_addon_recipes (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  menu_addon_id uuid not null,
  inventory_item_id uuid not null,
  quantity_per_unit numeric(14,3) not null,
  wastage_percent numeric(8,3) not null default 0,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by_owner_id uuid,
  unique (cafe_id, id),
  unique (cafe_id, menu_addon_id, inventory_item_id),
  constraint fk_inventory_addon_recipes_addon
    foreign key (cafe_id, menu_addon_id)
    references ops.menu_addons(cafe_id, id)
    on delete cascade,
  constraint fk_inventory_addon_recipes_item
    foreign key (cafe_id, inventory_item_id)
    references ops.inventory_items(cafe_id, id)
    on delete cascade,
  constraint fk_inventory_addon_recipes_owner
    foreign key (cafe_id, updated_by_owner_id)
    references ops.owner_users(cafe_id, id)
    on delete set null,
  constraint ck_inventory_addon_recipes_quantity_positive
    check (quantity_per_unit > 0),
  constraint ck_inventory_addon_recipes_wastage_nonnegative
    check (wastage_percent >= 0 and wastage_percent <= 500)
);

create index if not exists idx_inventory_addon_recipes_addon
  on ops.inventory_addon_recipes (cafe_id, menu_addon_id, is_active, updated_at desc);

create index if not exists idx_inventory_addon_recipes_item
  on ops.inventory_addon_recipes (cafe_id, inventory_item_id, is_active, updated_at desc);

commit;
