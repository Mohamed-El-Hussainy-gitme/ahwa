begin;

update ops.menu_sections
set station_code = 'barista'
where station_code = 'service';

update ops.menu_products
set station_code = 'barista'
where station_code = 'service';

update ops.order_items
set station_code = 'barista'
where station_code = 'service';

update ops.fulfillment_events
set station_code = 'barista'
where station_code = 'service';

update ops.complaints
set station_code = 'barista'
where station_code = 'service';

update ops.order_item_issues
set station_code = 'barista'
where station_code = 'service';

alter table ops.menu_sections
  drop constraint if exists menu_sections_station_code_check;
alter table ops.menu_sections
  add constraint menu_sections_station_code_check
  check (station_code in ('barista', 'shisha'));

alter table ops.menu_products
  drop constraint if exists menu_products_station_code_check;
alter table ops.menu_products
  add constraint menu_products_station_code_check
  check (station_code in ('barista', 'shisha'));

alter table ops.order_items
  drop constraint if exists order_items_station_code_check;
alter table ops.order_items
  add constraint order_items_station_code_check
  check (station_code in ('barista', 'shisha'));

alter table ops.fulfillment_events
  drop constraint if exists fulfillment_events_station_code_check;
alter table ops.fulfillment_events
  add constraint fulfillment_events_station_code_check
  check (station_code in ('barista', 'shisha'));

alter table ops.complaints
  drop constraint if exists complaints_station_code_check;
alter table ops.complaints
  add constraint complaints_station_code_check
  check (station_code in ('barista', 'shisha'));

alter table ops.order_item_issues
  drop constraint if exists order_item_issues_station_code_check;
alter table ops.order_item_issues
  add constraint order_item_issues_station_code_check
  check (station_code in ('barista', 'shisha'));

create or replace function public.ops_create_menu_section(
  p_cafe_id uuid,
  p_title text,
  p_station_code text,
  p_sort_order integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_section_id uuid;
begin
  if p_cafe_id is null then
    raise exception 'cafe_id_required';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'title_required';
  end if;
  if p_station_code not in ('barista', 'shisha') then
    raise exception 'invalid_station_code';
  end if;

  insert into ops.menu_sections (cafe_id, title, station_code, sort_order)
  values (p_cafe_id, trim(p_title), p_station_code, coalesce(p_sort_order, 0))
  returning id into v_section_id;

  return jsonb_build_object('section_id', v_section_id);
end;
$$;

create or replace function public.ops_create_menu_product(
  p_cafe_id uuid,
  p_section_id uuid,
  p_product_name text,
  p_station_code text,
  p_unit_price numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_product_id uuid;
begin
  if p_cafe_id is null then
    raise exception 'cafe_id_required';
  end if;
  if p_section_id is null then
    raise exception 'section_id_required';
  end if;
  if coalesce(trim(p_product_name), '') = '' then
    raise exception 'product_name_required';
  end if;
  if p_station_code not in ('barista', 'shisha') then
    raise exception 'invalid_station_code';
  end if;
  if p_unit_price is null or p_unit_price < 0 then
    raise exception 'invalid_unit_price';
  end if;

  insert into ops.menu_products (cafe_id, section_id, product_name, station_code, unit_price)
  values (p_cafe_id, p_section_id, trim(p_product_name), p_station_code, p_unit_price)
  returning id into v_product_id;

  return jsonb_build_object('product_id', v_product_id);
end;
$$;

commit;
