create table if not exists ops.menu_addons (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  addon_name text not null,
  station_code text not null check (station_code in ('barista', 'shisha')),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (cafe_id, id)
);

create unique index if not exists uq_menu_addons_active_name
  on ops.menu_addons (cafe_id, addon_name)
  where is_active = true;

create index if not exists idx_menu_addons_cafe_station_sort
  on ops.menu_addons (cafe_id, station_code, sort_order, created_at);

create table if not exists ops.menu_product_addons (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  menu_product_id uuid not null,
  menu_addon_id uuid not null,
  created_at timestamptz not null default now(),
  unique (cafe_id, id),
  unique (cafe_id, menu_product_id, menu_addon_id),
  constraint fk_menu_product_addons_product
    foreign key (cafe_id, menu_product_id)
    references ops.menu_products(cafe_id, id)
    on delete cascade,
  constraint fk_menu_product_addons_addon
    foreign key (cafe_id, menu_addon_id)
    references ops.menu_addons(cafe_id, id)
    on delete cascade
);

create index if not exists idx_menu_product_addons_product
  on ops.menu_product_addons (cafe_id, menu_product_id);

create index if not exists idx_menu_product_addons_addon
  on ops.menu_product_addons (cafe_id, menu_addon_id);

create table if not exists ops.order_item_addons (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  order_item_id uuid not null,
  menu_addon_id uuid not null,
  addon_name_snapshot text not null,
  station_code text not null check (station_code in ('barista', 'shisha')),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  quantity integer not null default 1 check (quantity > 0),
  line_total numeric(12,2) generated always as (unit_price * quantity) stored,
  created_at timestamptz not null default now(),
  unique (cafe_id, id),
  constraint fk_order_item_addons_item
    foreign key (cafe_id, order_item_id)
    references ops.order_items(cafe_id, id)
    on delete cascade,
  constraint fk_order_item_addons_addon
    foreign key (cafe_id, menu_addon_id)
    references ops.menu_addons(cafe_id, id)
    on delete restrict
);

create index if not exists idx_order_item_addons_item
  on ops.order_item_addons (cafe_id, order_item_id, created_at);
