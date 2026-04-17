begin;

alter table ops.shift_inventory_snapshots
  add column if not exists inventory_posted_at timestamptz null,
  add column if not exists inventory_posting_id uuid null,
  add column if not exists inventory_posted_by_owner_id uuid null,
  add column if not exists inventory_posting_summary_json jsonb not null default '{}'::jsonb;

create table if not exists ops.shift_inventory_postings (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  shift_id uuid not null,
  shift_inventory_snapshot_id uuid not null,
  business_date date null,
  shift_kind text null,
  posted_at timestamptz not null default now(),
  posted_by_owner_id uuid null,
  total_inventory_items integer not null default 0,
  total_consumption_qty numeric(12,3) not null default 0,
  notes text null,
  summary_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (cafe_id, shift_id),
  unique (shift_inventory_snapshot_id),
  constraint fk_shift_inventory_postings_shift
    foreign key (cafe_id, shift_id)
    references ops.shifts(cafe_id, id)
    on delete cascade,
  constraint fk_shift_inventory_postings_snapshot
    foreign key (shift_inventory_snapshot_id)
    references ops.shift_inventory_snapshots(id)
    on delete cascade,
  constraint fk_shift_inventory_postings_owner
    foreign key (cafe_id, posted_by_owner_id)
    references ops.owner_users(cafe_id, id)
    on delete set null
);

create index if not exists idx_shift_inventory_postings_business_date
  on ops.shift_inventory_postings (cafe_id, business_date desc, posted_at desc);

create table if not exists ops.shift_inventory_posting_lines (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  shift_inventory_posting_id uuid not null,
  shift_id uuid not null,
  inventory_item_id uuid not null,
  inventory_movement_id uuid null,
  item_name_snapshot text not null,
  unit_label_snapshot text not null,
  balance_before numeric(12,3) not null default 0,
  balance_after numeric(12,3) not null default 0,
  from_products numeric(12,3) not null default 0,
  from_addons numeric(12,3) not null default 0,
  remake_waste_qty numeric(12,3) not null default 0,
  remake_replacement_qty numeric(12,3) not null default 0,
  total_consumption numeric(12,3) not null default 0,
  detail_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (cafe_id, shift_inventory_posting_id, inventory_item_id),
  constraint fk_shift_inventory_posting_lines_posting
    foreign key (shift_inventory_posting_id)
    references ops.shift_inventory_postings(id)
    on delete cascade,
  constraint fk_shift_inventory_posting_lines_shift
    foreign key (cafe_id, shift_id)
    references ops.shifts(cafe_id, id)
    on delete cascade,
  constraint fk_shift_inventory_posting_lines_item
    foreign key (cafe_id, inventory_item_id)
    references ops.inventory_items(cafe_id, id)
    on delete cascade,
  constraint fk_shift_inventory_posting_lines_movement
    foreign key (inventory_movement_id)
    references ops.inventory_movements(id)
    on delete set null
);

create index if not exists idx_shift_inventory_posting_lines_posting
  on ops.shift_inventory_posting_lines (shift_inventory_posting_id, total_consumption desc);

alter table ops.inventory_movements
  add column if not exists source_kind text not null default 'manual',
  add column if not exists source_shift_id uuid null,
  add column if not exists source_snapshot_id uuid null,
  add column if not exists source_posting_id uuid null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ck_inventory_movements_source_kind'
  ) then
    alter table ops.inventory_movements
      add constraint ck_inventory_movements_source_kind
      check (source_kind in ('manual', 'shift_consumption'));
  end if;
end $$;

create index if not exists idx_inventory_movements_source_shift
  on ops.inventory_movements (cafe_id, source_kind, source_shift_id, occurred_at desc);

create index if not exists idx_inventory_movements_source_posting
  on ops.inventory_movements (source_posting_id);

alter table ops.shift_inventory_snapshots
  drop constraint if exists fk_shift_inventory_snapshots_inventory_posting;

alter table ops.shift_inventory_snapshots
  add constraint fk_shift_inventory_snapshots_inventory_posting
  foreign key (inventory_posting_id)
  references ops.shift_inventory_postings(id)
  on delete set null;

alter table ops.shift_inventory_snapshots
  drop constraint if exists fk_shift_inventory_snapshots_inventory_posted_by_owner;

alter table ops.shift_inventory_snapshots
  add constraint fk_shift_inventory_snapshots_inventory_posted_by_owner
  foreign key (cafe_id, inventory_posted_by_owner_id)
  references ops.owner_users(cafe_id, id)
  on delete set null;

create or replace function public.ops_post_shift_inventory_snapshot(
  p_cafe_id uuid,
  p_shift_id uuid,
  p_actor_owner_id uuid,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_snapshot ops.shift_inventory_snapshots%rowtype;
  v_posting ops.shift_inventory_postings%rowtype;
  v_shift ops.shifts%rowtype;
  v_line ops.shift_inventory_snapshot_lines%rowtype;
  v_item ops.inventory_items%rowtype;
  v_posting_id uuid;
  v_movement_id uuid;
  v_occured_at timestamptz;
  v_balance_before numeric(12,3);
  v_balance_after numeric(12,3);
  v_total_qty numeric(12,3) := 0;
  v_total_items integer := 0;
  v_posted_at timestamptz := now();
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_summary jsonb;
begin
  if p_cafe_id is null then
    raise exception 'inventory_cafe_required';
  end if;

  if p_shift_id is null then
    raise exception 'shift_id_required';
  end if;

  if p_actor_owner_id is null then
    raise exception 'inventory_actor_owner_required';
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
  into v_snapshot
  from ops.shift_inventory_snapshots sis
  where sis.cafe_id = p_cafe_id
    and sis.shift_id = p_shift_id
  for update;

  if not found then
    raise exception 'shift_inventory_snapshot_not_found';
  end if;

  if v_snapshot.snapshot_phase <> 'closed' then
    raise exception 'shift_inventory_snapshot_not_closed';
  end if;

  select *
  into v_shift
  from ops.shifts s
  where s.cafe_id = p_cafe_id
    and s.id = p_shift_id;

  if not found then
    raise exception 'shift_not_found';
  end if;

  select *
  into v_posting
  from ops.shift_inventory_postings sip
  where sip.cafe_id = p_cafe_id
    and sip.shift_id = p_shift_id;

  if found then
    return jsonb_build_object(
      'posting_id', v_posting.id,
      'already_posted', true,
      'posted_at', v_posting.posted_at,
      'total_inventory_items', v_posting.total_inventory_items,
      'total_consumption_qty', v_posting.total_consumption_qty,
      'shift_id', p_shift_id,
      'snapshot_id', v_snapshot.id
    );
  end if;

  v_occured_at := coalesce(v_shift.closed_at, v_snapshot.generated_at, v_posted_at);

  insert into ops.shift_inventory_postings (
    cafe_id,
    shift_id,
    shift_inventory_snapshot_id,
    business_date,
    shift_kind,
    posted_at,
    posted_by_owner_id,
    notes,
    summary_json
  ) values (
    p_cafe_id,
    p_shift_id,
    v_snapshot.id,
    v_snapshot.business_date,
    v_snapshot.shift_kind,
    v_posted_at,
    p_actor_owner_id,
    v_notes,
    coalesce(v_snapshot.summary_json, '{}'::jsonb)
  )
  returning id into v_posting_id;

  for v_line in
    select *
    from ops.shift_inventory_snapshot_lines sil
    where sil.cafe_id = p_cafe_id
      and sil.shift_id = p_shift_id
      and sil.total_consumption > 0
    order by sil.total_consumption desc, sil.created_at asc, sil.id asc
  loop
    select *
    into v_item
    from ops.inventory_items ii
    where ii.cafe_id = p_cafe_id
      and ii.id = v_line.inventory_item_id
    for update;

    if not found then
      raise exception 'inventory_item_not_found';
    end if;

    v_balance_before := coalesce(v_item.current_balance, 0);
    v_balance_after := v_balance_before - coalesce(v_line.total_consumption, 0);

    update ops.inventory_items
    set current_balance = v_balance_after,
        last_movement_at = v_occured_at,
        updated_at = now(),
        updated_by_owner_id = p_actor_owner_id
    where cafe_id = p_cafe_id
      and id = v_line.inventory_item_id;

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
      created_by_owner_id,
      source_kind,
      source_shift_id,
      source_snapshot_id,
      source_posting_id
    ) values (
      p_cafe_id,
      v_line.inventory_item_id,
      null,
      'outbound',
      -1 * coalesce(v_line.total_consumption, 0),
      v_item.unit_label,
      coalesce(v_line.total_consumption, 0),
      v_item.unit_label,
      1,
      coalesce(v_notes, format('ترحيل استهلاك الوردية %s %s إلى المخزن', coalesce(v_snapshot.shift_kind, '—'), coalesce(v_snapshot.business_date::text, ''))),
      v_occured_at,
      p_actor_owner_id,
      'shift_consumption',
      p_shift_id,
      v_snapshot.id,
      v_posting_id
    )
    returning id into v_movement_id;

    insert into ops.shift_inventory_posting_lines (
      cafe_id,
      shift_inventory_posting_id,
      shift_id,
      inventory_item_id,
      inventory_movement_id,
      item_name_snapshot,
      unit_label_snapshot,
      balance_before,
      balance_after,
      from_products,
      from_addons,
      remake_waste_qty,
      remake_replacement_qty,
      total_consumption,
      detail_json
    ) values (
      p_cafe_id,
      v_posting_id,
      p_shift_id,
      v_line.inventory_item_id,
      v_movement_id,
      v_line.item_name_snapshot,
      v_line.unit_label_snapshot,
      v_balance_before,
      v_balance_after,
      v_line.from_products,
      v_line.from_addons,
      v_line.remake_waste_qty,
      v_line.remake_replacement_qty,
      v_line.total_consumption,
      coalesce(v_line.detail_json, '{}'::jsonb)
    );

    v_total_qty := v_total_qty + coalesce(v_line.total_consumption, 0);
    v_total_items := v_total_items + 1;
  end loop;

  v_summary := jsonb_build_object(
    'postingId', v_posting_id,
    'postedAt', v_posted_at,
    'totalInventoryItems', v_total_items,
    'totalConsumptionQty', round(v_total_qty, 3),
    'movementCount', v_total_items,
    'alreadyPosted', false
  );

  update ops.shift_inventory_postings
  set total_inventory_items = v_total_items,
      total_consumption_qty = round(v_total_qty, 3),
      summary_json = coalesce(summary_json, '{}'::jsonb) || v_summary
  where id = v_posting_id;

  update ops.shift_inventory_snapshots
  set inventory_posted_at = v_posted_at,
      inventory_posting_id = v_posting_id,
      inventory_posted_by_owner_id = p_actor_owner_id,
      inventory_posting_summary_json = v_summary
  where id = v_snapshot.id;

  return jsonb_build_object(
    'posting_id', v_posting_id,
    'already_posted', false,
    'posted_at', v_posted_at,
    'total_inventory_items', v_total_items,
    'total_consumption_qty', round(v_total_qty, 3),
    'movement_count', v_total_items,
    'shift_id', p_shift_id,
    'snapshot_id', v_snapshot.id
  );
end;
$$;

commit;
