begin;

do $$
declare
  v_table text;
begin
  for v_table in
    select unnest(array[
      'cafe_billing_settings',
      'order_note_presets',
      'menu_addons',
      'menu_product_addons',
      'order_item_addons'
    ])
  loop
    execute format('alter table ops.%I enable row level security', v_table);
    execute format('drop policy if exists cafe_access_policy on ops.%I', v_table);
    execute format(
      'create policy cafe_access_policy on ops.%I for all using (app.can_access_cafe(cafe_id)) with check (app.can_access_cafe(cafe_id))',
      v_table
    );
  end loop;
end;
$$;

commit;
