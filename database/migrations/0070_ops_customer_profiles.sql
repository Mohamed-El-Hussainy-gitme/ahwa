begin;

create table if not exists ops.customers (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  full_name text not null,
  normalized_name text not null,
  phone_raw text not null,
  phone_normalized text not null,
  address text,
  favorite_drink_label text,
  notes text,
  is_active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by_owner_id uuid,
  unique (cafe_id, id),
  constraint fk_customers_updated_by_owner
    foreign key (cafe_id, updated_by_owner_id)
    references ops.owner_users(cafe_id, id)
    on delete set null,
  constraint ck_customers_full_name_nonempty
    check (length(btrim(full_name)) > 0),
  constraint ck_customers_phone_raw_nonempty
    check (length(btrim(phone_raw)) > 0),
  constraint ck_customers_normalized_name_nonempty
    check (length(btrim(normalized_name)) > 0),
  constraint ck_customers_phone_normalized_nonempty
    check (length(btrim(phone_normalized)) > 0)
);

create unique index if not exists idx_customers_cafe_phone_unique
  on ops.customers (cafe_id, phone_normalized);

create index if not exists idx_customers_cafe_name
  on ops.customers (cafe_id, normalized_name);

create index if not exists idx_customers_cafe_active_updated
  on ops.customers (cafe_id, is_active, updated_at desc);

commit;
