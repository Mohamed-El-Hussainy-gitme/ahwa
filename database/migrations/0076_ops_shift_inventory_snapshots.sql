begin;

create table if not exists ops.shift_inventory_snapshots (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  shift_id uuid not null,
  business_date date null,
  shift_kind text null,
  shift_status text not null default 'open' check (shift_status in ('open', 'closed', 'closing', 'draft', 'cancelled')),
  snapshot_phase text not null default 'preview' check (snapshot_phase in ('preview', 'closed')),
  summary_json jsonb not null default '{}'::jsonb,
  snapshot_json jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  created_by_owner_id uuid null,
  unique (cafe_id, shift_id),
  constraint fk_shift_inventory_snapshots_shift
    foreign key (cafe_id, shift_id)
    references ops.shifts(cafe_id, id)
    on delete cascade,
  constraint fk_shift_inventory_snapshots_owner
    foreign key (cafe_id, created_by_owner_id)
    references ops.owner_users(cafe_id, id)
    on delete set null
);

create index if not exists idx_shift_inventory_snapshots_business_date
  on ops.shift_inventory_snapshots (cafe_id, business_date desc, generated_at desc);

create table if not exists ops.shift_inventory_snapshot_lines (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  shift_inventory_snapshot_id uuid not null references ops.shift_inventory_snapshots(id) on delete cascade,
  shift_id uuid not null,
  inventory_item_id uuid not null,
  item_name_snapshot text not null,
  unit_label_snapshot text not null,
  current_balance_snapshot numeric(12,3) not null default 0,
  low_stock_threshold_snapshot numeric(12,3) not null default 0,
  stock_status_snapshot text not null default 'ok' check (stock_status_snapshot in ('ok', 'low', 'empty', 'inactive')),
  from_products numeric(12,3) not null default 0,
  from_addons numeric(12,3) not null default 0,
  remake_waste_qty numeric(12,3) not null default 0,
  remake_replacement_qty numeric(12,3) not null default 0,
  total_consumption numeric(12,3) not null default 0,
  recipe_sources_count integer not null default 0,
  detail_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (cafe_id, shift_id, inventory_item_id),
  constraint fk_shift_inventory_snapshot_lines_snapshot
    foreign key (shift_inventory_snapshot_id)
    references ops.shift_inventory_snapshots(id)
    on delete cascade,
  constraint fk_shift_inventory_snapshot_lines_shift
    foreign key (cafe_id, shift_id)
    references ops.shifts(cafe_id, id)
    on delete cascade,
  constraint fk_shift_inventory_snapshot_lines_item
    foreign key (cafe_id, inventory_item_id)
    references ops.inventory_items(cafe_id, id)
    on delete cascade
);

create index if not exists idx_shift_inventory_snapshot_lines_snapshot
  on ops.shift_inventory_snapshot_lines (shift_inventory_snapshot_id, total_consumption desc);

create index if not exists idx_shift_inventory_snapshot_lines_item
  on ops.shift_inventory_snapshot_lines (cafe_id, inventory_item_id, created_at desc);

commit;
