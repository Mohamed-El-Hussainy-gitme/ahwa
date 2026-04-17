begin;

create table if not exists ops.public_menu_product_content (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  menu_product_id uuid not null,
  public_description text,
  image_path text,
  image_alt text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by_owner_id uuid,
  unique (cafe_id, id),
  unique (cafe_id, menu_product_id),
  constraint fk_public_menu_product_content_product
    foreign key (cafe_id, menu_product_id)
    references ops.menu_products(cafe_id, id)
    on delete cascade,
  constraint fk_public_menu_product_content_owner
    foreign key (cafe_id, updated_by_owner_id)
    references ops.owner_users(cafe_id, id)
    on delete set null,
  constraint ck_public_menu_product_content_description_len
    check (public_description is null or length(public_description) <= 320),
  constraint ck_public_menu_product_content_image_path_len
    check (image_path is null or length(image_path) <= 512),
  constraint ck_public_menu_product_content_image_alt_len
    check (image_alt is null or length(image_alt) <= 160),
  constraint ck_public_menu_product_content_has_payload
    check (
      public_description is not null
      or image_path is not null
      or image_alt is not null
    )
);

create index if not exists idx_public_menu_product_content_product
  on ops.public_menu_product_content (cafe_id, menu_product_id);

create index if not exists idx_public_menu_product_content_updated
  on ops.public_menu_product_content (cafe_id, updated_at desc);

commit;
