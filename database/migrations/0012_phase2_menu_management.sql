alter table ops.menu_products
  add column if not exists sort_order integer not null default 0;

with ranked as (
  select
    id,
    row_number() over (
      partition by cafe_id, section_id
      order by sort_order asc, lower(product_name) asc, created_at asc, id asc
    ) - 1 as next_sort_order
  from ops.menu_products
)
update ops.menu_products p
set sort_order = ranked.next_sort_order
from ranked
where ranked.id = p.id;

alter table ops.menu_sections
  drop constraint if exists menu_sections_cafe_id_title_key;

alter table ops.menu_products
  drop constraint if exists menu_products_cafe_id_product_name_key;

create unique index if not exists uq_menu_sections_active_title
  on ops.menu_sections (cafe_id, title)
  where is_active = true;

create unique index if not exists uq_menu_products_active_name
  on ops.menu_products (cafe_id, product_name)
  where is_active = true;

create index if not exists idx_menu_products_cafe_section_sort
  on ops.menu_products (cafe_id, section_id, sort_order, created_at);
