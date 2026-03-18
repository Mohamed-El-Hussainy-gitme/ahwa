-- AUTO-GENERATED FILE. DO NOT EDIT DIRECTLY.
-- Regenerate with: npm run build:db-baselines

-- OPERATIONAL-ONLY BASELINE.
-- Intended for new operational databases (db02/db03/...).
-- Excludes control-plane/platform/super-admin objects by design.
-- Owner activation/reset code issuance stays in control-plane db0001.

-- >>> 0001_replace_old_with_runtime_v3.sql
begin;

create extension if not exists pgcrypto;

drop schema if exists app cascade;
drop schema if exists ops cascade;

create schema ops;

create or replace function ops.generate_session_label()
returns text
language sql
as $$
  select 'S-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
$$;

create table ops.cafes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  display_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table ops.owner_users (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  full_name text not null,
  phone text not null,
  password_hash text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (cafe_id, phone),
  unique (cafe_id, id)
);

create table ops.staff_members (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  full_name text not null,
  pin_hash text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (cafe_id, full_name),
  unique (cafe_id, id)
);

create table ops.menu_sections (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  title text not null,
  station_code text not null check (station_code in ('barista', 'shisha')),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (cafe_id, title),
  unique (cafe_id, id)
);

create table ops.menu_products (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  section_id uuid not null,
  product_name text not null,
  station_code text not null check (station_code in ('barista', 'shisha')),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (cafe_id, product_name),
  unique (cafe_id, id),
  constraint fk_menu_products_section
    foreign key (cafe_id, section_id)
    references ops.menu_sections(cafe_id, id)
    on delete cascade
);

create table ops.shifts (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  shift_kind text not null check (shift_kind in ('morning', 'evening')),
  business_date date not null,
  status text not null check (status in ('open', 'closed')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opened_by_owner_id uuid,
  closed_by_owner_id uuid,
  notes text,
  unique (cafe_id, shift_kind, business_date, status) deferrable initially immediate,
  unique (cafe_id, id),
  constraint fk_shifts_opened_by_owner
    foreign key (cafe_id, opened_by_owner_id)
    references ops.owner_users(cafe_id, id)
    on delete set null,
  constraint fk_shifts_closed_by_owner
    foreign key (cafe_id, closed_by_owner_id)
    references ops.owner_users(cafe_id, id)
    on delete set null,
  constraint ck_shift_closed
    check (
      (status = 'open' and closed_at is null)
      or
      (status = 'closed' and closed_at is not null)
    )
);

create table ops.shift_role_assignments (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  shift_id uuid not null,
  role_code text not null check (role_code in ('supervisor', 'waiter', 'barista', 'shisha')),
  staff_member_id uuid,
  owner_user_id uuid,
  is_active boolean not null default true,
  assigned_at timestamptz not null default now(),
  unique (cafe_id, id),
  constraint fk_assignments_shift
    foreign key (cafe_id, shift_id)
    references ops.shifts(cafe_id, id)
    on delete cascade,
  constraint fk_assignments_staff
    foreign key (cafe_id, staff_member_id)
    references ops.staff_members(cafe_id, id)
    on delete cascade,
  constraint fk_assignments_owner
    foreign key (cafe_id, owner_user_id)
    references ops.owner_users(cafe_id, id)
    on delete cascade,
  constraint ck_assignment_actor
    check (
      (staff_member_id is not null and owner_user_id is null)
      or
      (staff_member_id is null and owner_user_id is not null)
    )
);

create table ops.service_sessions (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  shift_id uuid not null,
  session_label text not null default ops.generate_session_label(),
  status text not null check (status in ('open', 'closed')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opened_by_staff_id uuid,
  opened_by_owner_id uuid,
  closed_by_staff_id uuid,
  closed_by_owner_id uuid,
  notes text,
  unique (cafe_id, id),
  constraint fk_sessions_shift
    foreign key (cafe_id, shift_id)
    references ops.shifts(cafe_id, id)
    on delete cascade,
  constraint fk_sessions_opened_staff
    foreign key (cafe_id, opened_by_staff_id)
    references ops.staff_members(cafe_id, id)
    on delete set null,
  constraint fk_sessions_opened_owner
    foreign key (cafe_id, opened_by_owner_id)
    references ops.owner_users(cafe_id, id)
    on delete set null,
  constraint fk_sessions_closed_staff
    foreign key (cafe_id, closed_by_staff_id)
    references ops.staff_members(cafe_id, id)
    on delete set null,
  constraint fk_sessions_closed_owner
    foreign key (cafe_id, closed_by_owner_id)
    references ops.owner_users(cafe_id, id)
    on delete set null,
  constraint ck_session_open_close_actor
    check (
      (opened_by_staff_id is not null and opened_by_owner_id is null)
      or
      (opened_by_staff_id is null and opened_by_owner_id is not null)
    ),
  constraint ck_session_closed_actor
    check (
      (closed_at is null and closed_by_staff_id is null and closed_by_owner_id is null)
      or
      (closed_at is not null and (
        (closed_by_staff_id is not null and closed_by_owner_id is null)
        or
        (closed_by_staff_id is null and closed_by_owner_id is not null)
      ))
    )
);

create table ops.orders (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  shift_id uuid not null,
  service_session_id uuid not null,
  status text not null check (status in ('draft', 'submitted', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  created_by_staff_id uuid,
  created_by_owner_id uuid,
  notes text,
  unique (cafe_id, id),
  constraint fk_orders_shift
    foreign key (cafe_id, shift_id)
    references ops.shifts(cafe_id, id)
    on delete cascade,
  constraint fk_orders_session
    foreign key (cafe_id, service_session_id)
    references ops.service_sessions(cafe_id, id)
    on delete cascade,
  constraint fk_orders_staff
    foreign key (cafe_id, created_by_staff_id)
    references ops.staff_members(cafe_id, id)
    on delete set null,
  constraint fk_orders_owner
    foreign key (cafe_id, created_by_owner_id)
    references ops.owner_users(cafe_id, id)
    on delete set null,
  constraint ck_orders_actor
    check (
      (created_by_staff_id is not null and created_by_owner_id is null)
      or
      (created_by_staff_id is null and created_by_owner_id is not null)
    )
);

create table ops.order_items (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  shift_id uuid not null,
  service_session_id uuid not null,
  order_id uuid not null,
  menu_product_id uuid not null,
  station_code text not null check (station_code in ('barista', 'shisha')),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  qty_total integer not null check (qty_total > 0),
  qty_submitted integer not null default 0 check (qty_submitted >= 0),
  qty_ready integer not null default 0 check (qty_ready >= 0),
  qty_delivered integer not null default 0 check (qty_delivered >= 0),
  qty_paid integer not null default 0 check (qty_paid >= 0),
  qty_deferred integer not null default 0 check (qty_deferred >= 0),
  qty_remade integer not null default 0 check (qty_remade >= 0),
  qty_cancelled integer not null default 0 check (qty_cancelled >= 0),
  notes text,
  created_at timestamptz not null default now(),
  unique (cafe_id, id),
  constraint fk_order_items_shift
    foreign key (cafe_id, shift_id)
    references ops.shifts(cafe_id, id)
    on delete cascade,
  constraint fk_order_items_session
    foreign key (cafe_id, service_session_id)
    references ops.service_sessions(cafe_id, id)
    on delete cascade,
  constraint fk_order_items_order
    foreign key (cafe_id, order_id)
    references ops.orders(cafe_id, id)
    on delete cascade,
  constraint fk_order_items_product
    foreign key (cafe_id, menu_product_id)
    references ops.menu_products(cafe_id, id)
    on delete restrict,
  constraint ck_order_items_progress
    check (
      qty_submitted <= qty_total
      and qty_ready <= qty_submitted + qty_remade
      and qty_delivered <= qty_ready
      and qty_paid + qty_deferred <= qty_delivered
      and qty_cancelled <= qty_total
    )
);

create table ops.fulfillment_events (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  shift_id uuid not null,
  service_session_id uuid not null,
  order_item_id uuid not null,
  station_code text not null check (station_code in ('barista', 'shisha')),
  event_code text not null check (
    event_code in (
      'submitted',
      'partial_ready',
      'ready',
      'delivered',
      'remake_requested',
      'remake_submitted',
      'cancelled'
    )
  ),
  quantity integer not null check (quantity > 0),
  notes text,
  created_at timestamptz not null default now(),
  by_staff_id uuid,
  by_owner_id uuid,
  unique (cafe_id, id),
  constraint fk_fulfillment_shift
    foreign key (cafe_id, shift_id)
    references ops.shifts(cafe_id, id)
    on delete cascade,
  constraint fk_fulfillment_session
    foreign key (cafe_id, service_session_id)
    references ops.service_sessions(cafe_id, id)
    on delete cascade,
  constraint fk_fulfillment_item
    foreign key (cafe_id, order_item_id)
    references ops.order_items(cafe_id, id)
    on delete cascade,
  constraint fk_fulfillment_staff
    foreign key (cafe_id, by_staff_id)
    references ops.staff_members(cafe_id, id)
    on delete set null,
  constraint fk_fulfillment_owner
    foreign key (cafe_id, by_owner_id)
    references ops.owner_users(cafe_id, id)
    on delete set null,
  constraint ck_fulfillment_actor
    check (
      (by_staff_id is not null and by_owner_id is null)
      or
      (by_staff_id is null and by_owner_id is not null)
    )
);

create table ops.payments (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  shift_id uuid not null,
  service_session_id uuid not null,
  payment_kind text not null check (payment_kind in ('cash', 'deferred', 'mixed', 'repayment', 'adjustment')),
  total_amount numeric(12,2) not null default 0 check (total_amount >= 0),
  debtor_name text,
  notes text,
  created_at timestamptz not null default now(),
  by_staff_id uuid,
  by_owner_id uuid,
  unique (cafe_id, id),
  constraint fk_payments_shift
    foreign key (cafe_id, shift_id)
    references ops.shifts(cafe_id, id)
    on delete cascade,
  constraint fk_payments_session
    foreign key (cafe_id, service_session_id)
    references ops.service_sessions(cafe_id, id)
    on delete cascade,
  constraint fk_payments_staff
    foreign key (cafe_id, by_staff_id)
    references ops.staff_members(cafe_id, id)
    on delete set null,
  constraint fk_payments_owner
    foreign key (cafe_id, by_owner_id)
    references ops.owner_users(cafe_id, id)
    on delete set null,
  constraint ck_payments_actor
    check (
      (by_staff_id is not null and by_owner_id is null)
      or
      (by_staff_id is null and by_owner_id is not null)
    )
);

create table ops.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  payment_id uuid not null,
  order_item_id uuid not null,
  allocation_kind text not null check (allocation_kind in ('cash', 'deferred', 'repayment', 'adjustment')),
  quantity integer not null check (quantity > 0),
  amount numeric(12,2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  unique (cafe_id, id),
  constraint fk_allocations_payment
    foreign key (cafe_id, payment_id)
    references ops.payments(cafe_id, id)
    on delete cascade,
  constraint fk_allocations_item
    foreign key (cafe_id, order_item_id)
    references ops.order_items(cafe_id, id)
    on delete cascade
);

create table ops.deferred_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  service_session_id uuid,
  payment_id uuid,
  debtor_name text not null,
  entry_kind text not null check (entry_kind in ('debt', 'repayment', 'adjustment')),
  amount numeric(12,2) not null check (amount > 0),
  notes text,
  created_at timestamptz not null default now(),
  by_staff_id uuid,
  by_owner_id uuid,
  unique (cafe_id, id),
  constraint fk_deferred_session
    foreign key (cafe_id, service_session_id)
    references ops.service_sessions(cafe_id, id)
    on delete set null,
  constraint fk_deferred_payment
    foreign key (cafe_id, payment_id)
    references ops.payments(cafe_id, id)
    on delete set null,
  constraint fk_deferred_staff
    foreign key (cafe_id, by_staff_id)
    references ops.staff_members(cafe_id, id)
    on delete set null,
  constraint fk_deferred_owner
    foreign key (cafe_id, by_owner_id)
    references ops.owner_users(cafe_id, id)
    on delete set null,
  constraint ck_deferred_actor
    check (
      (by_staff_id is not null and by_owner_id is null)
      or
      (by_staff_id is null and by_owner_id is not null)
    )
);

create table ops.shift_snapshots (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  shift_id uuid not null,
  snapshot_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (cafe_id, shift_id),
  unique (cafe_id, id),
  constraint fk_shift_snapshots_shift
    foreign key (cafe_id, shift_id)
    references ops.shifts(cafe_id, id)
    on delete cascade
);

create table ops.audit_events (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  actor_type text not null check (actor_type in ('owner', 'staff', 'system', 'super_admin')),
  actor_label text,
  event_code text not null,
  entity_type text not null,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (cafe_id, id)
);

create index idx_owner_users_cafe on ops.owner_users(cafe_id);
create index idx_staff_members_cafe on ops.staff_members(cafe_id);
create index idx_menu_sections_cafe on ops.menu_sections(cafe_id);
create index idx_menu_products_cafe on ops.menu_products(cafe_id);
create index idx_shifts_cafe_status on ops.shifts(cafe_id, status, business_date desc);
create index idx_shift_roles_shift on ops.shift_role_assignments(cafe_id, shift_id, role_code);
create index idx_sessions_shift_status on ops.service_sessions(cafe_id, shift_id, status);
create index idx_orders_session on ops.orders(cafe_id, service_session_id, status);
create index idx_order_items_session on ops.order_items(cafe_id, service_session_id);
create index idx_order_items_station on ops.order_items(cafe_id, station_code, created_at desc);
create index idx_fulfillment_item on ops.fulfillment_events(cafe_id, order_item_id, created_at desc);
create index idx_payments_session on ops.payments(cafe_id, service_session_id, created_at desc);
create index idx_allocations_payment on ops.payment_allocations(cafe_id, payment_id);
create index idx_deferred_name on ops.deferred_ledger_entries(cafe_id, debtor_name, created_at desc);
create index idx_shift_snapshots_shift on ops.shift_snapshots(cafe_id, shift_id);
create index idx_audit_events_cafe on ops.audit_events(cafe_id, created_at desc);

commit;
-- <<< 0001_replace_old_with_runtime_v3.sql

-- >>> 0002_phase2_bootstrap_and_ops.sql

create or replace function public.ops_create_staff_member(
  p_cafe_id uuid,
  p_full_name text,
  p_pin text
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_staff_id uuid;
begin
  if p_cafe_id is null then
    raise exception 'cafe_id_required';
  end if;
  if coalesce(trim(p_full_name), '') = '' then
    raise exception 'full_name_required';
  end if;
  if coalesce(trim(p_pin), '') = '' then
    raise exception 'pin_required';
  end if;

  insert into ops.staff_members (cafe_id, full_name, pin_hash)
  values (
    p_cafe_id,
    trim(p_full_name),
    crypt(p_pin, gen_salt('bf'))
  )
  returning id into v_staff_id;

  return jsonb_build_object('staff_member_id', v_staff_id);
end;
$$;

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

create or replace function public.ops_open_shift(
  p_cafe_id uuid,
  p_shift_kind text,
  p_business_date date,
  p_opened_by_owner_id uuid,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_shift_id uuid;
  v_existing_open uuid;
begin
  if p_cafe_id is null then
    raise exception 'cafe_id_required';
  end if;
  if p_shift_kind not in ('morning', 'evening') then
    raise exception 'invalid_shift_kind';
  end if;
  if p_business_date is null then
    raise exception 'business_date_required';
  end if;
  if p_opened_by_owner_id is null then
    raise exception 'opened_by_owner_id_required';
  end if;

  select s.id into v_existing_open
  from ops.shifts s
  where s.cafe_id = p_cafe_id
    and s.status = 'open'
  limit 1;

  if v_existing_open is not null then
    return jsonb_build_object('shift_id', v_existing_open, 'reused', true);
  end if;

  insert into ops.shifts (
    cafe_id,
    shift_kind,
    business_date,
    status,
    opened_by_owner_id,
    notes
  ) values (
    p_cafe_id,
    p_shift_kind,
    p_business_date,
    'open',
    p_opened_by_owner_id,
    p_notes
  ) returning id into v_shift_id;

  return jsonb_build_object('shift_id', v_shift_id, 'reused', false);
end;
$$;

create or replace function public.ops_assign_shift_role(
  p_cafe_id uuid,
  p_shift_id uuid,
  p_role_code text,
  p_staff_member_id uuid default null,
  p_owner_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_assignment_id uuid;
begin
  if p_cafe_id is null then
    raise exception 'cafe_id_required';
  end if;
  if p_shift_id is null then
    raise exception 'shift_id_required';
  end if;
  if p_role_code not in ('supervisor', 'waiter', 'barista', 'shisha') then
    raise exception 'invalid_role_code';
  end if;
  if (p_staff_member_id is null and p_owner_user_id is null) or (p_staff_member_id is not null and p_owner_user_id is not null) then
    raise exception 'exactly_one_actor_required';
  end if;

  update ops.shift_role_assignments
  set is_active = false
  where cafe_id = p_cafe_id
    and shift_id = p_shift_id
    and role_code = p_role_code
    and is_active = true;

  insert into ops.shift_role_assignments (
    cafe_id,
    shift_id,
    role_code,
    staff_member_id,
    owner_user_id,
    is_active
  ) values (
    p_cafe_id,
    p_shift_id,
    p_role_code,
    p_staff_member_id,
    p_owner_user_id,
    true
  ) returning id into v_assignment_id;

  return jsonb_build_object('assignment_id', v_assignment_id);
end;
$$;

create or replace function public.ops_open_or_resume_service_session(
  p_cafe_id uuid,
  p_shift_id uuid,
  p_session_label text default null,
  p_staff_member_id uuid default null,
  p_owner_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_session_id uuid;
  v_effective_label text;
  v_norm_label text;
begin
  if p_cafe_id is null then
    raise exception 'cafe_id_required';
  end if;
  if p_shift_id is null then
    raise exception 'shift_id_required';
  end if;
  if (p_staff_member_id is null and p_owner_user_id is null) or (p_staff_member_id is not null and p_owner_user_id is not null) then
    raise exception 'exactly_one_actor_required';
  end if;

  v_effective_label := nullif(trim(coalesce(p_session_label, '')), '');

  if v_effective_label is not null then
    v_norm_label := lower(v_effective_label);

    select s.id, s.session_label into v_session_id, v_effective_label
    from ops.service_sessions s
    where s.cafe_id = p_cafe_id
      and s.shift_id = p_shift_id
      and s.status = 'open'
      and lower(s.session_label) = v_norm_label
    order by s.opened_at desc
    limit 1;
  end if;

  if v_session_id is null then
    insert into ops.service_sessions (
      cafe_id,
      shift_id,
      session_label,
      status,
      opened_by_staff_id,
      opened_by_owner_id
    ) values (
      p_cafe_id,
      p_shift_id,
      coalesce(v_effective_label, ops.generate_session_label()),
      'open',
      p_staff_member_id,
      p_owner_user_id
    )
    returning id, session_label into v_session_id, v_effective_label;

    return jsonb_build_object(
      'service_session_id', v_session_id,
      'session_label', v_effective_label,
      'reused', false
    );
  end if;

  return jsonb_build_object(
    'service_session_id', v_session_id,
    'session_label', v_effective_label,
    'reused', true
  );
end;
$$;

create or replace function public.ops_create_order_with_items(
  p_cafe_id uuid,
  p_shift_id uuid,
  p_service_session_id uuid default null,
  p_session_label text default null,
  p_created_by_staff_id uuid default null,
  p_created_by_owner_id uuid default null,
  p_items jsonb default '[]'::jsonb,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_session_id uuid;
  v_session_label text;
  v_order_id uuid;
  v_item jsonb;
  v_product record;
  v_order_item_id uuid;
  v_item_count integer := 0;
  v_qty integer;
  v_notes text;
  v_open_check uuid;
  v_result jsonb;
begin
  if p_cafe_id is null then
    raise exception 'cafe_id_required';
  end if;
  if p_shift_id is null then
    raise exception 'shift_id_required';
  end if;
  if (p_created_by_staff_id is null and p_created_by_owner_id is null) or (p_created_by_staff_id is not null and p_created_by_owner_id is not null) then
    raise exception 'exactly_one_actor_required';
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'items_required';
  end if;

  if p_service_session_id is not null then
    select s.id, s.session_label into v_session_id, v_session_label
    from ops.service_sessions s
    where s.cafe_id = p_cafe_id
      and s.shift_id = p_shift_id
      and s.id = p_service_session_id
      and s.status = 'open'
    limit 1;

    if v_session_id is null then
      raise exception 'service_session_not_found';
    end if;
  else
    select (x->>'service_session_id')::uuid, x->>'session_label'
    into v_session_id, v_session_label
    from (
      select public.ops_open_or_resume_service_session(
        p_cafe_id,
        p_shift_id,
        p_session_label,
        p_created_by_staff_id,
        p_created_by_owner_id
      ) as x
    ) q;
  end if;

  select s.id into v_open_check
  from ops.shifts s
  where s.cafe_id = p_cafe_id
    and s.id = p_shift_id
    and s.status = 'open'
  limit 1;

  if v_open_check is null then
    raise exception 'shift_not_open';
  end if;

  insert into ops.orders (
    cafe_id,
    shift_id,
    service_session_id,
    status,
    submitted_at,
    created_by_staff_id,
    created_by_owner_id,
    notes
  ) values (
    p_cafe_id,
    p_shift_id,
    v_session_id,
    'submitted',
    now(),
    p_created_by_staff_id,
    p_created_by_owner_id,
    p_notes
  ) returning id into v_order_id;

  for v_item in
    select value from jsonb_array_elements(p_items)
  loop
    if coalesce(v_item->>'menu_product_id', '') = '' then
      raise exception 'menu_product_id_required';
    end if;

    v_qty := coalesce((v_item->>'qty')::integer, 0);
    if v_qty <= 0 then
      raise exception 'invalid_qty';
    end if;

    v_notes := nullif(trim(coalesce(v_item->>'notes', '')), '');

    select p.id, p.station_code, p.unit_price
    into v_product
    from ops.menu_products p
    where p.cafe_id = p_cafe_id
      and p.id = (v_item->>'menu_product_id')::uuid
      and p.is_active = true
    limit 1;

    if v_product.id is null then
      raise exception 'menu_product_not_found';
    end if;

    insert into ops.order_items (
      cafe_id,
      shift_id,
      service_session_id,
      order_id,
      menu_product_id,
      station_code,
      unit_price,
      qty_total,
      qty_submitted,
      notes
    ) values (
      p_cafe_id,
      p_shift_id,
      v_session_id,
      v_order_id,
      v_product.id,
      v_product.station_code,
      v_product.unit_price,
      v_qty,
      v_qty,
      v_notes
    ) returning id into v_order_item_id;

    insert into ops.fulfillment_events (
      cafe_id,
      shift_id,
      service_session_id,
      order_item_id,
      station_code,
      event_code,
      quantity,
      notes,
      by_staff_id,
      by_owner_id
    ) values (
      p_cafe_id,
      p_shift_id,
      v_session_id,
      v_order_item_id,
      v_product.station_code,
      'submitted',
      v_qty,
      v_notes,
      p_created_by_staff_id,
      p_created_by_owner_id
    );

    v_item_count := v_item_count + 1;
  end loop;

  v_result := jsonb_build_object(
    'order_id', v_order_id,
    'service_session_id', v_session_id,
    'session_label', v_session_label,
    'items_count', v_item_count,
    'status', 'submitted'
  );

  return v_result;
end;
$$;
-- <<< 0002_phase2_bootstrap_and_ops.sql

-- >>> 0003_phase2_station_delivery_ops.sql
create or replace function public.ops_list_station_queue(
  p_cafe_id uuid,
  p_shift_id uuid,
  p_station_code text
)
returns jsonb
language sql
security definer
set search_path = public, ops
as $$
  select coalesce(jsonb_agg(row_to_json(q) order by q.created_at asc), '[]'::jsonb)
  from (
    select
      oi.id as order_item_id,
      oi.order_id,
      oi.service_session_id,
      ss.session_label,
      oi.menu_product_id,
      mp.product_name,
      oi.station_code,
      oi.unit_price,
      oi.qty_total,
      oi.qty_submitted,
      oi.qty_ready,
      oi.qty_delivered,
      oi.qty_paid,
      oi.qty_deferred,
      oi.qty_remade,
      oi.qty_cancelled,
      greatest(oi.qty_submitted - oi.qty_ready - oi.qty_cancelled, 0) as qty_waiting,
      oi.created_at
    from ops.order_items oi
    join ops.service_sessions ss
      on ss.id = oi.service_session_id
     and ss.cafe_id = oi.cafe_id
    join ops.menu_products mp
      on mp.id = oi.menu_product_id
     and mp.cafe_id = oi.cafe_id
    where oi.cafe_id = p_cafe_id
      and oi.shift_id = p_shift_id
      and oi.station_code = p_station_code
      and greatest(oi.qty_submitted - oi.qty_ready - oi.qty_cancelled, 0) > 0
    order by oi.created_at asc
  ) q;
$$;

create or replace function public.ops_mark_partial_ready(
  p_cafe_id uuid,
  p_order_item_id uuid,
  p_quantity integer,
  p_by_staff_id uuid default null,
  p_by_owner_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_item ops.order_items%rowtype;
  v_waiting integer;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'p_quantity must be greater than zero';
  end if;

  if (p_by_staff_id is null and p_by_owner_id is null)
     or (p_by_staff_id is not null and p_by_owner_id is not null) then
    raise exception 'Exactly one actor is required';
  end if;

  select *
  into v_item
  from ops.order_items
  where cafe_id = p_cafe_id
    and id = p_order_item_id
  for update;

  if not found then
    raise exception 'order_item not found';
  end if;

  v_waiting := greatest(v_item.qty_submitted - v_item.qty_ready - v_item.qty_cancelled, 0);

  if v_waiting = 0 then
    raise exception 'No waiting quantity available for partial ready';
  end if;

  if p_quantity > v_waiting then
    raise exception 'Requested quantity % exceeds waiting quantity %', p_quantity, v_waiting;
  end if;

  update ops.order_items
  set qty_ready = qty_ready + p_quantity
  where cafe_id = p_cafe_id
    and id = p_order_item_id;

  insert into ops.fulfillment_events (
    cafe_id,
    shift_id,
    service_session_id,
    order_item_id,
    station_code,
    event_code,
    quantity,
    notes,
    by_staff_id,
    by_owner_id
  )
  values (
    v_item.cafe_id,
    v_item.shift_id,
    v_item.service_session_id,
    v_item.id,
    v_item.station_code,
    'partial_ready',
    p_quantity,
    p_notes,
    p_by_staff_id,
    p_by_owner_id
  );

  return jsonb_build_object(
    'ok', true,
    'order_item_id', v_item.id,
    'qty_marked_ready', p_quantity
  );
end;
$$;

create or replace function public.ops_mark_ready(
  p_cafe_id uuid,
  p_order_item_id uuid,
  p_quantity integer default null,
  p_by_staff_id uuid default null,
  p_by_owner_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_item ops.order_items%rowtype;
  v_waiting integer;
  v_quantity integer;
begin
  if (p_by_staff_id is null and p_by_owner_id is null)
     or (p_by_staff_id is not null and p_by_owner_id is not null) then
    raise exception 'Exactly one actor is required';
  end if;

  select *
  into v_item
  from ops.order_items
  where cafe_id = p_cafe_id
    and id = p_order_item_id
  for update;

  if not found then
    raise exception 'order_item not found';
  end if;

  v_waiting := greatest(v_item.qty_submitted - v_item.qty_ready - v_item.qty_cancelled, 0);

  if v_waiting = 0 then
    raise exception 'No waiting quantity available for ready';
  end if;

  v_quantity := coalesce(p_quantity, v_waiting);
  if v_quantity <= 0 or v_quantity > v_waiting then
    raise exception 'invalid_quantity';
  end if;

  update ops.order_items
  set qty_ready = qty_ready + v_quantity
  where cafe_id = p_cafe_id
    and id = p_order_item_id;

  insert into ops.fulfillment_events (
    cafe_id,
    shift_id,
    service_session_id,
    order_item_id,
    station_code,
    event_code,
    quantity,
    notes,
    by_staff_id,
    by_owner_id
  )
  values (
    v_item.cafe_id,
    v_item.shift_id,
    v_item.service_session_id,
    v_item.id,
    v_item.station_code,
    'ready',
    v_quantity,
    p_notes,
    p_by_staff_id,
    p_by_owner_id
  );

  return jsonb_build_object(
    'ok', true,
    'order_item_id', v_item.id,
    'qty_marked_ready', v_quantity
  );
end;
$$;

create or replace function public.ops_list_ready_for_delivery(
  p_cafe_id uuid,
  p_shift_id uuid
)
returns jsonb
language sql
security definer
set search_path = public, ops
as $$
  select coalesce(jsonb_agg(row_to_json(q) order by q.created_at asc), '[]'::jsonb)
  from (
    select
      oi.id as order_item_id,
      oi.order_id,
      oi.service_session_id,
      ss.session_label,
      oi.menu_product_id,
      mp.product_name,
      oi.station_code,
      oi.unit_price,
      oi.qty_total,
      oi.qty_ready,
      oi.qty_delivered,
      oi.qty_paid,
      oi.qty_deferred,
      greatest(oi.qty_ready - oi.qty_delivered, 0) as qty_ready_for_delivery,
      oi.created_at
    from ops.order_items oi
    join ops.service_sessions ss
      on ss.id = oi.service_session_id
     and ss.cafe_id = oi.cafe_id
    join ops.menu_products mp
      on mp.id = oi.menu_product_id
     and mp.cafe_id = oi.cafe_id
    where oi.cafe_id = p_cafe_id
      and oi.shift_id = p_shift_id
      and greatest(oi.qty_ready - oi.qty_delivered, 0) > 0
    order by oi.created_at asc
  ) q;
$$;

create or replace function public.ops_deliver_selected_quantities(
  p_cafe_id uuid,
  p_order_item_id uuid,
  p_quantity integer,
  p_by_staff_id uuid default null,
  p_by_owner_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_item ops.order_items%rowtype;
  v_remaining integer;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'p_quantity must be greater than zero';
  end if;

  if (p_by_staff_id is null and p_by_owner_id is null)
     or (p_by_staff_id is not null and p_by_owner_id is not null) then
    raise exception 'Exactly one actor is required';
  end if;

  select *
  into v_item
  from ops.order_items
  where cafe_id = p_cafe_id
    and id = p_order_item_id
  for update;

  if not found then
    raise exception 'order_item not found';
  end if;

  v_remaining := greatest(v_item.qty_ready - v_item.qty_delivered, 0);

  if v_remaining = 0 then
    raise exception 'No ready quantity available for delivery';
  end if;

  if p_quantity > v_remaining then
    raise exception 'Requested quantity % exceeds ready-for-delivery quantity %', p_quantity, v_remaining;
  end if;

  update ops.order_items
  set qty_delivered = qty_delivered + p_quantity
  where cafe_id = p_cafe_id
    and id = p_order_item_id;

  insert into ops.fulfillment_events (
    cafe_id,
    shift_id,
    service_session_id,
    order_item_id,
    station_code,
    event_code,
    quantity,
    notes,
    by_staff_id,
    by_owner_id
  )
  values (
    v_item.cafe_id,
    v_item.shift_id,
    v_item.service_session_id,
    v_item.id,
    v_item.station_code,
    'delivered',
    p_quantity,
    p_notes,
    p_by_staff_id,
    p_by_owner_id
  );

  return jsonb_build_object(
    'ok', true,
    'order_item_id', v_item.id,
    'qty_delivered_now', p_quantity
  );
end;
$$;
-- <<< 0003_phase2_station_delivery_ops.sql

-- >>> 0004_complete_remaining_database.sql
begin;

alter table ops.payments
  alter column service_session_id drop not null;

alter table ops.order_items
  add column if not exists qty_replacement_delivered integer not null default 0;

alter table ops.order_items
  drop constraint if exists ck_order_items_progress;

alter table ops.order_items
  add constraint ck_order_items_progress
  check (
    qty_submitted <= qty_total
    and qty_ready <= qty_submitted + qty_remade
    and qty_delivered <= qty_ready
    and qty_replacement_delivered <= qty_ready
    and qty_replacement_delivered <= qty_remade
    and qty_paid + qty_deferred <= qty_delivered
    and qty_cancelled <= qty_total
  );

alter table ops.fulfillment_events
  drop constraint if exists fulfillment_events_event_code_check;

alter table ops.fulfillment_events
  add constraint fulfillment_events_event_code_check
  check (
    event_code in (
      'submitted',
      'partial_ready',
      'ready',
      'delivered',
      'remake_requested',
      'remake_submitted',
      'remake_delivered',
      'cancelled'
    )
  );

create index if not exists idx_order_items_session_label_lookup
  on ops.service_sessions(cafe_id, shift_id, session_label);

create or replace function public.ops_list_station_queue(
  p_cafe_id uuid,
  p_shift_id uuid,
  p_station_code text
)
returns jsonb
language sql
security definer
set search_path = public, ops
as $$
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at asc), '[]'::jsonb)
  from (
    select
      oi.id as order_item_id,
      oi.order_id,
      oi.service_session_id,
      ss.session_label,
      oi.menu_product_id,
      mp.product_name,
      oi.station_code,
      oi.unit_price,
      oi.qty_total,
      oi.qty_submitted,
      oi.qty_ready,
      oi.qty_delivered,
      oi.qty_replacement_delivered,
      oi.qty_paid,
      oi.qty_deferred,
      oi.qty_remade,
      oi.qty_cancelled,
      greatest(oi.qty_submitted - least(oi.qty_ready, oi.qty_submitted) - oi.qty_cancelled, 0) as qty_waiting_original,
      greatest(oi.qty_remade - greatest(oi.qty_ready - least(oi.qty_ready, oi.qty_submitted), 0), 0) as qty_waiting_replacement,
      greatest(oi.qty_submitted - least(oi.qty_ready, oi.qty_submitted) - oi.qty_cancelled, 0)
        + greatest(oi.qty_remade - greatest(oi.qty_ready - least(oi.qty_ready, oi.qty_submitted), 0), 0) as qty_waiting,
      oi.created_at
    from ops.order_items oi
    join ops.service_sessions ss
      on ss.id = oi.service_session_id
     and ss.cafe_id = oi.cafe_id
    join ops.menu_products mp
      on mp.id = oi.menu_product_id
     and mp.cafe_id = oi.cafe_id
    where oi.cafe_id = p_cafe_id
      and oi.shift_id = p_shift_id
      and oi.station_code = p_station_code
      and (
        greatest(oi.qty_submitted - least(oi.qty_ready, oi.qty_submitted) - oi.qty_cancelled, 0)
        + greatest(oi.qty_remade - greatest(oi.qty_ready - least(oi.qty_ready, oi.qty_submitted), 0), 0)
      ) > 0
    order by oi.created_at asc
  ) q;
$$;

create or replace function public.ops_mark_partial_ready(
  p_cafe_id uuid,
  p_order_item_id uuid,
  p_quantity integer,
  p_by_staff_id uuid default null,
  p_by_owner_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_item ops.order_items%rowtype;
  v_waiting integer;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'p_quantity must be greater than zero';
  end if;

  if (p_by_staff_id is null and p_by_owner_id is null)
     or (p_by_staff_id is not null and p_by_owner_id is not null) then
    raise exception 'Exactly one actor is required';
  end if;

  select *
  into v_item
  from ops.order_items
  where cafe_id = p_cafe_id
    and id = p_order_item_id
  for update;

  if not found then
    raise exception 'order_item not found';
  end if;

  v_waiting :=
      greatest(v_item.qty_submitted - least(v_item.qty_ready, v_item.qty_submitted) - v_item.qty_cancelled, 0)
    + greatest(v_item.qty_remade - greatest(v_item.qty_ready - least(v_item.qty_ready, v_item.qty_submitted), 0), 0);

  if v_waiting = 0 then
    raise exception 'No waiting quantity available for partial ready';
  end if;

  if p_quantity > v_waiting then
    raise exception 'Requested quantity % exceeds waiting quantity %', p_quantity, v_waiting;
  end if;

  update ops.order_items
  set qty_ready = qty_ready + p_quantity
  where cafe_id = p_cafe_id
    and id = p_order_item_id;

  insert into ops.fulfillment_events (
    cafe_id,
    shift_id,
    service_session_id,
    order_item_id,
    station_code,
    event_code,
    quantity,
    notes,
    by_staff_id,
    by_owner_id
  )
  values (
    v_item.cafe_id,
    v_item.shift_id,
    v_item.service_session_id,
    v_item.id,
    v_item.station_code,
    'partial_ready',
    p_quantity,
    p_notes,
    p_by_staff_id,
    p_by_owner_id
  );

  return jsonb_build_object(
    'ok', true,
    'order_item_id', v_item.id,
    'qty_marked_ready', p_quantity
  );
end;
$$;

drop function if exists public.ops_mark_ready(uuid, uuid, integer, uuid, uuid, text);

create or replace function public.ops_mark_ready(
  p_cafe_id uuid,
  p_order_item_id uuid,
  p_quantity integer,
  p_by_staff_id uuid default null,
  p_by_owner_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_item ops.order_items%rowtype;
  v_waiting integer;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'p_quantity must be greater than zero';
  end if;

  if (p_by_staff_id is null and p_by_owner_id is null)
     or (p_by_staff_id is not null and p_by_owner_id is not null) then
    raise exception 'Exactly one actor is required';
  end if;

  select *
  into v_item
  from ops.order_items
  where cafe_id = p_cafe_id
    and id = p_order_item_id
  for update;

  if not found then
    raise exception 'order_item not found';
  end if;

  v_waiting :=
      greatest(v_item.qty_submitted - least(v_item.qty_ready, v_item.qty_submitted) - v_item.qty_cancelled, 0)
    + greatest(v_item.qty_remade - greatest(v_item.qty_ready - least(v_item.qty_ready, v_item.qty_submitted), 0), 0);

  if v_waiting = 0 then
    raise exception 'No waiting quantity available for ready';
  end if;

  if p_quantity > v_waiting then
    raise exception 'Requested quantity % exceeds waiting quantity %', p_quantity, v_waiting;
  end if;

  update ops.order_items
  set qty_ready = qty_ready + p_quantity
  where cafe_id = p_cafe_id
    and id = p_order_item_id;

  insert into ops.fulfillment_events (
    cafe_id,
    shift_id,
    service_session_id,
    order_item_id,
    station_code,
    event_code,
    quantity,
    notes,
    by_staff_id,
    by_owner_id
  )
  values (
    v_item.cafe_id,
    v_item.shift_id,
    v_item.service_session_id,
    v_item.id,
    v_item.station_code,
    'ready',
    p_quantity,
    p_notes,
    p_by_staff_id,
    p_by_owner_id
  );

  return jsonb_build_object(
    'ok', true,
    'order_item_id', v_item.id,
    'qty_marked_ready', p_quantity
  );
end;
$$;

create or replace function public.ops_list_ready_for_delivery(
  p_cafe_id uuid,
  p_shift_id uuid,
  p_service_session_id uuid default null
)
returns jsonb
language sql
security definer
set search_path = public, ops
as $$
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at asc), '[]'::jsonb)
  from (
    select
      oi.id as order_item_id,
      oi.order_id,
      oi.service_session_id,
      ss.session_label,
      oi.menu_product_id,
      mp.product_name,
      oi.station_code,
      oi.unit_price,
      oi.qty_total,
      oi.qty_ready,
      oi.qty_delivered,
      oi.qty_replacement_delivered,
      oi.qty_paid,
      oi.qty_deferred,
      greatest(least(oi.qty_ready, oi.qty_total - oi.qty_cancelled) - oi.qty_delivered, 0) as qty_ready_for_normal_delivery,
      greatest(oi.qty_ready - least(oi.qty_ready, oi.qty_total - oi.qty_cancelled) - oi.qty_replacement_delivered, 0) as qty_ready_for_replacement_delivery,
      greatest(least(oi.qty_ready, oi.qty_total - oi.qty_cancelled) - oi.qty_delivered, 0)
        + greatest(oi.qty_ready - least(oi.qty_ready, oi.qty_total - oi.qty_cancelled) - oi.qty_replacement_delivered, 0) as qty_ready_for_delivery,
      oi.created_at
    from ops.order_items oi
    join ops.service_sessions ss
      on ss.id = oi.service_session_id
     and ss.cafe_id = oi.cafe_id
    join ops.menu_products mp
      on mp.id = oi.menu_product_id
     and mp.cafe_id = oi.cafe_id
    where oi.cafe_id = p_cafe_id
      and oi.shift_id = p_shift_id
      and (p_service_session_id is null or oi.service_session_id = p_service_session_id)
      and (
        greatest(least(oi.qty_ready, oi.qty_total - oi.qty_cancelled) - oi.qty_delivered, 0)
        + greatest(oi.qty_ready - least(oi.qty_ready, oi.qty_total - oi.qty_cancelled) - oi.qty_replacement_delivered, 0)
      ) > 0
    order by oi.created_at asc
  ) q;
$$;

create or replace function public.ops_deliver_selected_quantities(
  p_cafe_id uuid,
  p_order_item_id uuid,
  p_quantity integer,
  p_delivery_kind text default 'normal',
  p_by_staff_id uuid default null,
  p_by_owner_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_item ops.order_items%rowtype;
  v_normal_ready integer;
  v_replacement_ready integer;
  v_event_code text;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'p_quantity must be greater than zero';
  end if;

  if p_delivery_kind not in ('normal', 'replacement') then
    raise exception 'p_delivery_kind must be normal or replacement';
  end if;

  if (p_by_staff_id is null and p_by_owner_id is null)
     or (p_by_staff_id is not null and p_by_owner_id is not null) then
    raise exception 'Exactly one actor is required';
  end if;

  select *
  into v_item
  from ops.order_items
  where cafe_id = p_cafe_id
    and id = p_order_item_id
  for update;

  if not found then
    raise exception 'order_item not found';
  end if;

  v_normal_ready := greatest(least(v_item.qty_ready, v_item.qty_total - v_item.qty_cancelled) - v_item.qty_delivered, 0);
  v_replacement_ready := greatest(v_item.qty_ready - least(v_item.qty_ready, v_item.qty_total - v_item.qty_cancelled) - v_item.qty_replacement_delivered, 0);

  if p_delivery_kind = 'normal' then
    if v_normal_ready = 0 then
      raise exception 'No normal ready quantity available for delivery';
    end if;
    if p_quantity > v_normal_ready then
      raise exception 'Requested quantity % exceeds normal ready quantity %', p_quantity, v_normal_ready;
    end if;

    update ops.order_items
    set qty_delivered = qty_delivered + p_quantity
    where cafe_id = p_cafe_id
      and id = p_order_item_id;

    v_event_code := 'delivered';
  else
    if v_replacement_ready = 0 then
      raise exception 'No replacement ready quantity available for delivery';
    end if;
    if p_quantity > v_replacement_ready then
      raise exception 'Requested quantity % exceeds replacement ready quantity %', p_quantity, v_replacement_ready;
    end if;

    update ops.order_items
    set qty_replacement_delivered = qty_replacement_delivered + p_quantity
    where cafe_id = p_cafe_id
      and id = p_order_item_id;

    v_event_code := 'remake_delivered';
  end if;

  insert into ops.fulfillment_events (
    cafe_id,
    shift_id,
    service_session_id,
    order_item_id,
    station_code,
    event_code,
    quantity,
    notes,
    by_staff_id,
    by_owner_id
  )
  values (
    v_item.cafe_id,
    v_item.shift_id,
    v_item.service_session_id,
    v_item.id,
    v_item.station_code,
    v_event_code,
    p_quantity,
    p_notes,
    p_by_staff_id,
    p_by_owner_id
  );

  return jsonb_build_object(
    'ok', true,
    'order_item_id', v_item.id,
    'delivery_kind', p_delivery_kind,
    'quantity', p_quantity
  );
end;
$$;

create or replace function public.ops_request_remake(
  p_cafe_id uuid,
  p_order_item_id uuid,
  p_quantity integer,
  p_by_staff_id uuid default null,
  p_by_owner_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_item ops.order_items%rowtype;
  v_available integer;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'p_quantity must be greater than zero';
  end if;

  if (p_by_staff_id is null and p_by_owner_id is null)
     or (p_by_staff_id is not null and p_by_owner_id is not null) then
    raise exception 'Exactly one actor is required';
  end if;

  select *
  into v_item
  from ops.order_items
  where cafe_id = p_cafe_id
    and id = p_order_item_id
  for update;

  if not found then
    raise exception 'order_item not found';
  end if;

  v_available := greatest((v_item.qty_delivered + v_item.qty_replacement_delivered) - v_item.qty_remade, 0);

  if v_available = 0 then
    raise exception 'No delivered quantity available to remake';
  end if;

  if p_quantity > v_available then
    raise exception 'Requested remake quantity % exceeds available quantity %', p_quantity, v_available;
  end if;

  update ops.order_items
  set qty_remade = qty_remade + p_quantity
  where cafe_id = p_cafe_id
    and id = p_order_item_id;

  insert into ops.fulfillment_events (
    cafe_id,
    shift_id,
    service_session_id,
    order_item_id,
    station_code,
    event_code,
    quantity,
    notes,
    by_staff_id,
    by_owner_id
  )
  values
  (
    v_item.cafe_id,
    v_item.shift_id,
    v_item.service_session_id,
    v_item.id,
    v_item.station_code,
    'remake_requested',
    p_quantity,
    p_notes,
    p_by_staff_id,
    p_by_owner_id
  ),
  (
    v_item.cafe_id,
    v_item.shift_id,
    v_item.service_session_id,
    v_item.id,
    v_item.station_code,
    'remake_submitted',
    p_quantity,
    p_notes,
    p_by_staff_id,
    p_by_owner_id
  );

  return jsonb_build_object(
    'ok', true,
    'order_item_id', v_item.id,
    'qty_remake_requested', p_quantity
  );
end;
$$;

create or replace function public.ops_list_billable_quantities(
  p_cafe_id uuid,
  p_shift_id uuid,
  p_service_session_id uuid default null
)
returns jsonb
language sql
security definer
set search_path = public, ops
as $$
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at asc), '[]'::jsonb)
  from (
    select
      oi.id as order_item_id,
      oi.order_id,
      oi.service_session_id,
      ss.session_label,
      oi.menu_product_id,
      mp.product_name,
      oi.station_code,
      oi.unit_price,
      oi.qty_total,
      oi.qty_delivered,
      oi.qty_paid,
      oi.qty_deferred,
      greatest(oi.qty_delivered - oi.qty_paid - oi.qty_deferred, 0) as qty_billable,
      (greatest(oi.qty_delivered - oi.qty_paid - oi.qty_deferred, 0) * oi.unit_price)::numeric(12,2) as amount_billable,
      oi.created_at
    from ops.order_items oi
    join ops.service_sessions ss
      on ss.id = oi.service_session_id
     and ss.cafe_id = oi.cafe_id
    join ops.menu_products mp
      on mp.id = oi.menu_product_id
     and mp.cafe_id = oi.cafe_id
    where oi.cafe_id = p_cafe_id
      and oi.shift_id = p_shift_id
      and (p_service_session_id is null or oi.service_session_id = p_service_session_id)
      and greatest(oi.qty_delivered - oi.qty_paid - oi.qty_deferred, 0) > 0
    order by oi.created_at asc
  ) q;
$$;

create or replace function public.ops_settle_selected_quantities(
  p_cafe_id uuid,
  p_shift_id uuid,
  p_service_session_id uuid,
  p_lines jsonb,
  p_by_staff_id uuid default null,
  p_by_owner_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_payment_id uuid;
  v_total_amount numeric(12,2) := 0;
  v_total_quantity integer := 0;
  v_line jsonb;
  v_item ops.order_items%rowtype;
  v_qty integer;
  v_available integer;
  v_amount numeric(12,2);
begin
  if p_service_session_id is null then
    raise exception 'p_service_session_id is required';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'p_lines must be a non-empty json array';
  end if;

  if (p_by_staff_id is null and p_by_owner_id is null)
     or (p_by_staff_id is not null and p_by_owner_id is not null) then
    raise exception 'Exactly one actor is required';
  end if;

  insert into ops.payments (
    cafe_id,
    shift_id,
    service_session_id,
    payment_kind,
    total_amount,
    notes,
    by_staff_id,
    by_owner_id
  )
  values (
    p_cafe_id,
    p_shift_id,
    p_service_session_id,
    'cash',
    0,
    p_notes,
    p_by_staff_id,
    p_by_owner_id
  )
  returning id into v_payment_id;

  for v_line in
    select value from jsonb_array_elements(p_lines)
  loop
    v_qty := coalesce((v_line ->> 'quantity')::integer, 0);

    if v_qty <= 0 then
      raise exception 'Each line quantity must be greater than zero';
    end if;

    select *
    into v_item
    from ops.order_items
    where cafe_id = p_cafe_id
      and shift_id = p_shift_id
      and service_session_id = p_service_session_id
      and id = (v_line ->> 'order_item_id')::uuid
    for update;

    if not found then
      raise exception 'order_item % not found in this session', v_line ->> 'order_item_id';
    end if;

    v_available := greatest(v_item.qty_delivered - v_item.qty_paid - v_item.qty_deferred, 0);

    if v_qty > v_available then
      raise exception 'Requested quantity % exceeds billable quantity % for order_item %', v_qty, v_available, v_item.id;
    end if;

    v_amount := (v_item.unit_price * v_qty)::numeric(12,2);

    update ops.order_items
    set qty_paid = qty_paid + v_qty
    where cafe_id = p_cafe_id
      and id = v_item.id;

    insert into ops.payment_allocations (
      cafe_id,
      payment_id,
      order_item_id,
      allocation_kind,
      quantity,
      amount
    )
    values (
      p_cafe_id,
      v_payment_id,
      v_item.id,
      'cash',
      v_qty,
      v_amount
    );

    v_total_quantity := v_total_quantity + v_qty;
    v_total_amount := v_total_amount + v_amount;
  end loop;

  update ops.payments
  set total_amount = v_total_amount
  where cafe_id = p_cafe_id
    and id = v_payment_id;

  return jsonb_build_object(
    'ok', true,
    'payment_id', v_payment_id,
    'total_quantity', v_total_quantity,
    'total_amount', v_total_amount
  );
end;
$$;

create or replace function public.ops_defer_selected_quantities(
  p_cafe_id uuid,
  p_shift_id uuid,
  p_service_session_id uuid,
  p_debtor_name text,
  p_lines jsonb,
  p_by_staff_id uuid default null,
  p_by_owner_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_payment_id uuid;
  v_total_amount numeric(12,2) := 0;
  v_total_quantity integer := 0;
  v_line jsonb;
  v_item ops.order_items%rowtype;
  v_qty integer;
  v_available integer;
  v_amount numeric(12,2);
  v_name text;
begin
  v_name := nullif(btrim(p_debtor_name), '');

  if v_name is null then
    raise exception 'p_debtor_name is required';
  end if;

  if p_service_session_id is null then
    raise exception 'p_service_session_id is required';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'p_lines must be a non-empty json array';
  end if;

  if (p_by_staff_id is null and p_by_owner_id is null)
     or (p_by_staff_id is not null and p_by_owner_id is not null) then
    raise exception 'Exactly one actor is required';
  end if;

  insert into ops.payments (
    cafe_id,
    shift_id,
    service_session_id,
    payment_kind,
    total_amount,
    debtor_name,
    notes,
    by_staff_id,
    by_owner_id
  )
  values (
    p_cafe_id,
    p_shift_id,
    p_service_session_id,
    'deferred',
    0,
    v_name,
    p_notes,
    p_by_staff_id,
    p_by_owner_id
  )
  returning id into v_payment_id;

  for v_line in
    select value from jsonb_array_elements(p_lines)
  loop
    v_qty := coalesce((v_line ->> 'quantity')::integer, 0);

    if v_qty <= 0 then
      raise exception 'Each line quantity must be greater than zero';
    end if;

    select *
    into v_item
    from ops.order_items
    where cafe_id = p_cafe_id
      and shift_id = p_shift_id
      and service_session_id = p_service_session_id
      and id = (v_line ->> 'order_item_id')::uuid
    for update;

    if not found then
      raise exception 'order_item % not found in this session', v_line ->> 'order_item_id';
    end if;

    v_available := greatest(v_item.qty_delivered - v_item.qty_paid - v_item.qty_deferred, 0);

    if v_qty > v_available then
      raise exception 'Requested quantity % exceeds billable quantity % for order_item %', v_qty, v_available, v_item.id;
    end if;

    v_amount := (v_item.unit_price * v_qty)::numeric(12,2);

    update ops.order_items
    set qty_deferred = qty_deferred + v_qty
    where cafe_id = p_cafe_id
      and id = v_item.id;

    insert into ops.payment_allocations (
      cafe_id,
      payment_id,
      order_item_id,
      allocation_kind,
      quantity,
      amount
    )
    values (
      p_cafe_id,
      v_payment_id,
      v_item.id,
      'deferred',
      v_qty,
      v_amount
    );

    v_total_quantity := v_total_quantity + v_qty;
    v_total_amount := v_total_amount + v_amount;
  end loop;

  update ops.payments
  set total_amount = v_total_amount
  where cafe_id = p_cafe_id
    and id = v_payment_id;

  insert into ops.deferred_ledger_entries (
    cafe_id,
    service_session_id,
    payment_id,
    debtor_name,
    entry_kind,
    amount,
    notes,
    by_staff_id,
    by_owner_id
  )
  values (
    p_cafe_id,
    p_service_session_id,
    v_payment_id,
    v_name,
    'debt',
    v_total_amount,
    p_notes,
    p_by_staff_id,
    p_by_owner_id
  );

  return jsonb_build_object(
    'ok', true,
    'payment_id', v_payment_id,
    'debtor_name', v_name,
    'total_quantity', v_total_quantity,
    'total_amount', v_total_amount
  );
end;
$$;

create or replace function public.ops_record_repayment(
  p_cafe_id uuid,
  p_shift_id uuid,
  p_debtor_name text,
  p_amount numeric,
  p_by_staff_id uuid default null,
  p_by_owner_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_payment_id uuid;
  v_name text;
  v_balance numeric(12,2);
begin
  v_name := nullif(btrim(p_debtor_name), '');

  if v_name is null then
    raise exception 'p_debtor_name is required';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'p_amount must be greater than zero';
  end if;

  if (p_by_staff_id is null and p_by_owner_id is null)
     or (p_by_staff_id is not null and p_by_owner_id is not null) then
    raise exception 'Exactly one actor is required';
  end if;

  insert into ops.payments (
    cafe_id,
    shift_id,
    service_session_id,
    payment_kind,
    total_amount,
    debtor_name,
    notes,
    by_staff_id,
    by_owner_id
  )
  values (
    p_cafe_id,
    p_shift_id,
    null,
    'repayment',
    p_amount,
    v_name,
    p_notes,
    p_by_staff_id,
    p_by_owner_id
  )
  returning id into v_payment_id;

  insert into ops.deferred_ledger_entries (
    cafe_id,
    service_session_id,
    payment_id,
    debtor_name,
    entry_kind,
    amount,
    notes,
    by_staff_id,
    by_owner_id
  )
  values (
    p_cafe_id,
    null,
    v_payment_id,
    v_name,
    'repayment',
    p_amount,
    p_notes,
    p_by_staff_id,
    p_by_owner_id
  );

  select coalesce(sum(
    case entry_kind
      when 'debt' then amount
      when 'repayment' then -amount
      else 0
    end
  ), 0)::numeric(12,2)
  into v_balance
  from ops.deferred_ledger_entries
  where cafe_id = p_cafe_id
    and debtor_name = v_name;

  return jsonb_build_object(
    'ok', true,
    'payment_id', v_payment_id,
    'debtor_name', v_name,
    'repayment_amount', p_amount,
    'balance_after', v_balance
  );
end;
$$;

create or replace function public.ops_read_deferred_balance(
  p_cafe_id uuid,
  p_debtor_name text
)
returns jsonb
language sql
security definer
set search_path = public, ops
as $$
  with ledger as (
    select
      debtor_name,
      coalesce(sum(case when entry_kind = 'debt' then amount else 0 end), 0)::numeric(12,2) as total_debt,
      coalesce(sum(case when entry_kind = 'repayment' then amount else 0 end), 0)::numeric(12,2) as total_repayment
    from ops.deferred_ledger_entries
    where cafe_id = p_cafe_id
      and debtor_name = p_debtor_name
    group by debtor_name
  )
  select coalesce(
    (
      select jsonb_build_object(
        'debtor_name', debtor_name,
        'total_debt', total_debt,
        'total_repayment', total_repayment,
        'balance', (total_debt - total_repayment)::numeric(12,2)
      )
      from ledger
    ),
    jsonb_build_object(
      'debtor_name', p_debtor_name,
      'total_debt', 0,
      'total_repayment', 0,
      'balance', 0
    )
  );
$$;

create or replace function public.ops_read_deferred_customer_ledger(
  p_cafe_id uuid,
  p_debtor_name text
)
returns jsonb
language sql
security definer
set search_path = public, ops
as $$
  with rows_cte as (
    select
      dle.id,
      dle.payment_id,
      dle.service_session_id,
      dle.debtor_name,
      dle.entry_kind,
      dle.amount,
      dle.notes,
      dle.created_at,
      sum(
        case dle.entry_kind
          when 'debt' then dle.amount
          when 'repayment' then -dle.amount
          else 0
        end
      ) over (order by dle.created_at asc, dle.id asc) as balance_after
    from ops.deferred_ledger_entries dle
    where dle.cafe_id = p_cafe_id
      and dle.debtor_name = p_debtor_name
  )
  select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at asc), '[]'::jsonb)
  from rows_cte r;
$$;

create or replace function public.ops_close_service_session(
  p_cafe_id uuid,
  p_service_session_id uuid,
  p_by_staff_id uuid default null,
  p_by_owner_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_session ops.service_sessions%rowtype;
  v_waiting integer;
  v_ready_undelivered integer;
  v_billable integer;
begin
  if (p_by_staff_id is null and p_by_owner_id is null)
     or (p_by_staff_id is not null and p_by_owner_id is not null) then
    raise exception 'Exactly one actor is required';
  end if;

  select *
  into v_session
  from ops.service_sessions
  where cafe_id = p_cafe_id
    and id = p_service_session_id
  for update;

  if not found then
    raise exception 'service_session not found';
  end if;

  if v_session.status <> 'open' then
    raise exception 'service_session is already closed';
  end if;

  select
    coalesce(sum(
      greatest(qty_submitted - least(qty_ready, qty_submitted) - qty_cancelled, 0)
      + greatest(qty_remade - greatest(qty_ready - least(qty_ready, qty_submitted), 0), 0)
    ), 0),
    coalesce(sum(
      greatest(least(qty_ready, qty_total - qty_cancelled) - qty_delivered, 0)
      + greatest(qty_ready - least(qty_ready, qty_total - qty_cancelled) - qty_replacement_delivered, 0)
    ), 0),
    coalesce(sum(greatest(qty_delivered - qty_paid - qty_deferred, 0)), 0)
  into v_waiting, v_ready_undelivered, v_billable
  from ops.order_items
  where cafe_id = p_cafe_id
    and service_session_id = p_service_session_id;

  if v_waiting > 0 then
    raise exception 'Cannot close service session while station queue is still pending';
  end if;

  if v_ready_undelivered > 0 then
    raise exception 'Cannot close service session while ready quantities are not delivered';
  end if;

  if v_billable > 0 then
    raise exception 'Cannot close service session while delivered unpaid quantities exist';
  end if;

  update ops.service_sessions
  set status = 'closed',
      closed_at = now(),
      closed_by_staff_id = p_by_staff_id,
      closed_by_owner_id = p_by_owner_id,
      notes = coalesce(p_notes, notes)
  where cafe_id = p_cafe_id
    and id = p_service_session_id;

  update ops.orders
  set status = 'completed'
  where cafe_id = p_cafe_id
    and service_session_id = p_service_session_id
    and status <> 'cancelled';

  return jsonb_build_object(
    'ok', true,
    'service_session_id', p_service_session_id,
    'status', 'closed'
  );
end;
$$;

create or replace function public.ops_build_shift_snapshot(
  p_cafe_id uuid,
  p_shift_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_shift ops.shifts%rowtype;
  v_snapshot jsonb;
  v_totals jsonb;
  v_products jsonb;
  v_staff jsonb;
  v_sessions jsonb;
begin
  select *
  into v_shift
  from ops.shifts
  where cafe_id = p_cafe_id
    and id = p_shift_id;

  if not found then
    raise exception 'shift not found';
  end if;

  select jsonb_build_object(
    'submitted_qty', coalesce(sum(oi.qty_submitted), 0),
    'ready_qty', coalesce(sum(oi.qty_ready), 0),
    'delivered_qty', coalesce(sum(oi.qty_delivered), 0),
    'replacement_delivered_qty', coalesce(sum(oi.qty_replacement_delivered), 0),
    'paid_qty', coalesce(sum(oi.qty_paid), 0),
    'deferred_qty', coalesce(sum(oi.qty_deferred), 0),
    'remade_qty', coalesce(sum(oi.qty_remade), 0),
    'cancelled_qty', coalesce(sum(oi.qty_cancelled), 0),
    'cash_total', coalesce(sum(case when p.payment_kind = 'cash' then p.total_amount else 0 end), 0)::numeric(12,2),
    'deferred_total', coalesce(sum(case when p.payment_kind = 'deferred' then p.total_amount else 0 end), 0)::numeric(12,2),
    'repayment_total', coalesce(sum(case when p.payment_kind = 'repayment' then p.total_amount else 0 end), 0)::numeric(12,2)
  )
  into v_totals
  from ops.order_items oi
  left join ops.payments p
    on p.cafe_id = oi.cafe_id
   and p.shift_id = oi.shift_id
  where oi.cafe_id = p_cafe_id
    and oi.shift_id = p_shift_id;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.product_name), '[]'::jsonb)
  into v_products
  from (
    select
      mp.product_name,
      oi.station_code,
      sum(oi.qty_submitted) as qty_submitted,
      sum(oi.qty_delivered) as qty_delivered,
      sum(oi.qty_paid) as qty_paid,
      sum(oi.qty_deferred) as qty_deferred,
      sum(oi.qty_remade) as qty_remade,
      sum((oi.qty_paid + oi.qty_deferred) * oi.unit_price)::numeric(12,2) as billed_amount
    from ops.order_items oi
    join ops.menu_products mp
      on mp.id = oi.menu_product_id
     and mp.cafe_id = oi.cafe_id
    where oi.cafe_id = p_cafe_id
      and oi.shift_id = p_shift_id
    group by mp.product_name, oi.station_code
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.actor_label), '[]'::jsonb)
  into v_staff
  from (
    select
      actor_label,
      sum(submitted_qty) as submitted_qty,
      sum(ready_qty) as ready_qty,
      sum(delivered_qty) as delivered_qty,
      sum(payment_total)::numeric(12,2) as payment_total
    from (
      select
        sm.full_name as actor_label,
        0::bigint as submitted_qty,
        0::bigint as ready_qty,
        0::bigint as delivered_qty,
        coalesce(sum(p.total_amount), 0)::numeric(12,2) as payment_total
      from ops.payments p
      join ops.staff_members sm
        on sm.id = p.by_staff_id
       and sm.cafe_id = p.cafe_id
      where p.cafe_id = p_cafe_id
        and p.shift_id = p_shift_id
      group by sm.full_name

      union all

      select
        ou.full_name as actor_label,
        0::bigint,
        0::bigint,
        0::bigint,
        coalesce(sum(p.total_amount), 0)::numeric(12,2)
      from ops.payments p
      join ops.owner_users ou
        on ou.id = p.by_owner_id
       and ou.cafe_id = p.cafe_id
      where p.cafe_id = p_cafe_id
        and p.shift_id = p_shift_id
      group by ou.full_name

      union all

      select
        sm.full_name as actor_label,
        coalesce(sum(case when fe.event_code in ('submitted', 'remake_submitted') then fe.quantity else 0 end), 0)::bigint,
        coalesce(sum(case when fe.event_code in ('partial_ready', 'ready') then fe.quantity else 0 end), 0)::bigint,
        coalesce(sum(case when fe.event_code in ('delivered', 'remake_delivered') then fe.quantity else 0 end), 0)::bigint,
        0::numeric(12,2)
      from ops.fulfillment_events fe
      join ops.staff_members sm
        on sm.id = fe.by_staff_id
       and sm.cafe_id = fe.cafe_id
      where fe.cafe_id = p_cafe_id
        and fe.shift_id = p_shift_id
      group by sm.full_name

      union all

      select
        ou.full_name as actor_label,
        coalesce(sum(case when fe.event_code in ('submitted', 'remake_submitted') then fe.quantity else 0 end), 0)::bigint,
        coalesce(sum(case when fe.event_code in ('partial_ready', 'ready') then fe.quantity else 0 end), 0)::bigint,
        coalesce(sum(case when fe.event_code in ('delivered', 'remake_delivered') then fe.quantity else 0 end), 0)::bigint,
        0::numeric(12,2)
      from ops.fulfillment_events fe
      join ops.owner_users ou
        on ou.id = fe.by_owner_id
       and ou.cafe_id = fe.cafe_id
      where fe.cafe_id = p_cafe_id
        and fe.shift_id = p_shift_id
      group by ou.full_name
    ) raw
    group by actor_label
  ) x;

  select jsonb_build_object(
    'open_sessions', coalesce(sum(case when status = 'open' then 1 else 0 end), 0),
    'closed_sessions', coalesce(sum(case when status = 'closed' then 1 else 0 end), 0)
  )
  into v_sessions
  from ops.service_sessions
  where cafe_id = p_cafe_id
    and shift_id = p_shift_id;

  v_snapshot := jsonb_build_object(
    'shift', jsonb_build_object(
      'shift_id', v_shift.id,
      'shift_kind', v_shift.shift_kind,
      'business_date', v_shift.business_date,
      'status', v_shift.status,
      'opened_at', v_shift.opened_at,
      'closed_at', v_shift.closed_at
    ),
    'totals', coalesce(v_totals, '{}'::jsonb),
    'sessions', coalesce(v_sessions, '{}'::jsonb),
    'products', coalesce(v_products, '[]'::jsonb),
    'staff', coalesce(v_staff, '[]'::jsonb)
  );

  insert into ops.shift_snapshots (
    cafe_id,
    shift_id,
    snapshot_json
  )
  values (
    p_cafe_id,
    p_shift_id,
    v_snapshot
  )
  on conflict (cafe_id, shift_id)
  do update set snapshot_json = excluded.snapshot_json,
                created_at = now();

  return v_snapshot;
end;
$$;

create or replace function public.ops_close_shift(
  p_cafe_id uuid,
  p_shift_id uuid,
  p_by_owner_id uuid,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_open_sessions integer;
  v_snapshot jsonb;
begin
  if p_by_owner_id is null then
    raise exception 'p_by_owner_id is required';
  end if;

  select count(*)
  into v_open_sessions
  from ops.service_sessions
  where cafe_id = p_cafe_id
    and shift_id = p_shift_id
    and status = 'open';

  if v_open_sessions > 0 then
    raise exception 'Cannot close shift while open service sessions exist';
  end if;

  v_snapshot := public.ops_build_shift_snapshot(p_cafe_id, p_shift_id);

  update ops.shifts
  set status = 'closed',
      closed_at = now(),
      closed_by_owner_id = p_by_owner_id,
      notes = coalesce(p_notes, notes)
  where cafe_id = p_cafe_id
    and id = p_shift_id
    and status = 'open';

  if not found then
    raise exception 'shift not found or already closed';
  end if;

  return jsonb_build_object(
    'ok', true,
    'shift_id', p_shift_id,
    'status', 'closed',
    'snapshot', v_snapshot
  );
end;
$$;

commit;
-- <<< 0004_complete_remaining_database.sql

-- >>> 0006_ops_hardening_and_rls.sql
begin;

create schema if not exists app;

create or replace function app.current_cafe_id()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      current_setting('app.current_cafe_id', true),
      current_setting('app.current_tenant_id', true)
    ),
    ''
  )::uuid
$$;

create or replace function app.can_access_cafe(
  p_cafe_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, ops, app
as $$
  select p_cafe_id is not null
    and app.current_cafe_id() = p_cafe_id
$$;

do $$
declare
  v_table text;
begin
  execute 'alter table ops.cafes enable row level security';
  execute 'drop policy if exists cafe_access_policy on ops.cafes';
  execute 'create policy cafe_access_policy on ops.cafes for all using (app.can_access_cafe(id)) with check (app.can_access_cafe(id))';

  for v_table in
    select unnest(array[
      'owner_users',
      'staff_members',
      'menu_sections',
      'menu_products',
      'shifts',
      'shift_role_assignments',
      'service_sessions',
      'orders',
      'order_items',
      'fulfillment_events',
      'payments',
      'payment_allocations',
      'deferred_ledger_entries',
      'shift_snapshots',
      'audit_events'
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

create unique index if not exists uq_shift_role_active_singleton
  on ops.shift_role_assignments(cafe_id, shift_id, role_code)
  where is_active = true
    and role_code in ('supervisor', 'barista', 'shisha');

create unique index if not exists uq_shift_role_active_staff_actor
  on ops.shift_role_assignments(cafe_id, shift_id, role_code, staff_member_id)
  where is_active = true
    and staff_member_id is not null;

create unique index if not exists uq_shift_role_active_owner_actor
  on ops.shift_role_assignments(cafe_id, shift_id, role_code, owner_user_id)
  where is_active = true
    and owner_user_id is not null;

create or replace function public.ops_assign_shift_role(
  p_cafe_id uuid,
  p_shift_id uuid,
  p_role_code text,
  p_staff_member_id uuid default null,
  p_owner_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_assignment_id uuid;
  v_existing_id uuid;
begin
  if p_cafe_id is null then
    raise exception 'cafe_id_required';
  end if;

  if p_shift_id is null then
    raise exception 'shift_id_required';
  end if;

  if p_role_code not in ('supervisor', 'waiter', 'barista', 'shisha') then
    raise exception 'invalid_role_code';
  end if;

  if (p_staff_member_id is null and p_owner_user_id is null)
     or (p_staff_member_id is not null and p_owner_user_id is not null) then
    raise exception 'exactly_one_actor_required';
  end if;

  select sra.id
  into v_existing_id
  from ops.shift_role_assignments sra
  where sra.cafe_id = p_cafe_id
    and sra.shift_id = p_shift_id
    and sra.role_code = p_role_code
    and sra.is_active = true
    and sra.staff_member_id is not distinct from p_staff_member_id
    and sra.owner_user_id is not distinct from p_owner_user_id
  limit 1;

  if v_existing_id is not null then
    return jsonb_build_object(
      'assignment_id', v_existing_id,
      'role_code', p_role_code,
      'reused', true
    );
  end if;

  if p_role_code in ('supervisor', 'barista', 'shisha') then
    update ops.shift_role_assignments
    set is_active = false
    where cafe_id = p_cafe_id
      and shift_id = p_shift_id
      and role_code = p_role_code
      and is_active = true;
  end if;

  insert into ops.shift_role_assignments (
    cafe_id,
    shift_id,
    role_code,
    staff_member_id,
    owner_user_id,
    is_active
  )
  values (
    p_cafe_id,
    p_shift_id,
    p_role_code,
    p_staff_member_id,
    p_owner_user_id,
    true
  )
  returning id into v_assignment_id;

  return jsonb_build_object(
    'assignment_id', v_assignment_id,
    'role_code', p_role_code,
    'reused', false
  );
end;
$$;

alter table ops.service_sessions
  drop constraint if exists ck_service_sessions_session_label_nonempty;

alter table ops.service_sessions
  add constraint ck_service_sessions_session_label_nonempty
  check (nullif(btrim(session_label), '') is not null);

create unique index if not exists uq_service_sessions_open_label
  on ops.service_sessions(cafe_id, shift_id, lower(btrim(session_label)))
  where status = 'open';

create or replace function public.ops_open_or_resume_service_session(
  p_cafe_id uuid,
  p_shift_id uuid,
  p_session_label text default null,
  p_staff_member_id uuid default null,
  p_owner_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_session_id uuid;
  v_effective_label text;
  v_norm_label text;
begin
  if p_cafe_id is null then
    raise exception 'cafe_id_required';
  end if;

  if p_shift_id is null then
    raise exception 'shift_id_required';
  end if;

  if (p_staff_member_id is null and p_owner_user_id is null)
     or (p_staff_member_id is not null and p_owner_user_id is not null) then
    raise exception 'exactly_one_actor_required';
  end if;

  v_effective_label := nullif(btrim(coalesce(p_session_label, '')), '');

  if v_effective_label is not null then
    v_norm_label := lower(v_effective_label);

    select s.id, s.session_label
    into v_session_id, v_effective_label
    from ops.service_sessions s
    where s.cafe_id = p_cafe_id
      and s.shift_id = p_shift_id
      and s.status = 'open'
      and lower(btrim(s.session_label)) = v_norm_label
    order by s.opened_at desc
    limit 1;

    if v_session_id is not null then
      return jsonb_build_object(
        'service_session_id', v_session_id,
        'session_label', v_effective_label,
        'reused', true
      );
    end if;
  end if;

  begin
    insert into ops.service_sessions (
      cafe_id,
      shift_id,
      session_label,
      status,
      opened_by_staff_id,
      opened_by_owner_id
    )
    values (
      p_cafe_id,
      p_shift_id,
      coalesce(v_effective_label, ops.generate_session_label()),
      'open',
      p_staff_member_id,
      p_owner_user_id
    )
    returning id, session_label into v_session_id, v_effective_label;
  exception
    when unique_violation then
      if v_effective_label is null then
        raise;
      end if;

      select s.id, s.session_label
      into v_session_id, v_effective_label
      from ops.service_sessions s
      where s.cafe_id = p_cafe_id
        and s.shift_id = p_shift_id
        and s.status = 'open'
        and lower(btrim(s.session_label)) = lower(v_effective_label)
      order by s.opened_at desc
      limit 1;

      if v_session_id is null then
        raise;
      end if;

      return jsonb_build_object(
        'service_session_id', v_session_id,
        'session_label', v_effective_label,
        'reused', true
      );
  end;

  return jsonb_build_object(
    'service_session_id', v_session_id,
    'session_label', v_effective_label,
    'reused', false
  );
end;
$$;

create or replace function public.ops_record_repayment(
  p_cafe_id uuid,
  p_shift_id uuid,
  p_debtor_name text,
  p_amount numeric,
  p_by_staff_id uuid default null,
  p_by_owner_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_payment_id uuid;
  v_name text;
  v_balance_before numeric(12,2);
  v_balance_after numeric(12,2);
begin
  if p_cafe_id is null then
    raise exception 'p_cafe_id is required';
  end if;

  if p_shift_id is null then
    raise exception 'p_shift_id is required';
  end if;

  v_name := nullif(btrim(p_debtor_name), '');

  if v_name is null then
    raise exception 'p_debtor_name is required';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'p_amount must be greater than zero';
  end if;

  if (p_by_staff_id is null and p_by_owner_id is null)
     or (p_by_staff_id is not null and p_by_owner_id is not null) then
    raise exception 'Exactly one actor is required';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_cafe_id::text), hashtext(lower(v_name)));

  select coalesce(sum(
    case entry_kind
      when 'debt' then amount
      when 'repayment' then -amount
      else 0
    end
  ), 0)::numeric(12,2)
  into v_balance_before
  from ops.deferred_ledger_entries
  where cafe_id = p_cafe_id
    and debtor_name = v_name;

  if v_balance_before <= 0 then
    raise exception 'no_outstanding_deferred_balance';
  end if;

  if p_amount > v_balance_before then
    raise exception 'repayment_exceeds_deferred_balance';
  end if;

  insert into ops.payments (
    cafe_id,
    shift_id,
    service_session_id,
    payment_kind,
    total_amount,
    debtor_name,
    notes,
    by_staff_id,
    by_owner_id
  )
  values (
    p_cafe_id,
    p_shift_id,
    null,
    'repayment',
    p_amount,
    v_name,
    p_notes,
    p_by_staff_id,
    p_by_owner_id
  )
  returning id into v_payment_id;

  insert into ops.deferred_ledger_entries (
    cafe_id,
    service_session_id,
    payment_id,
    debtor_name,
    entry_kind,
    amount,
    notes,
    by_staff_id,
    by_owner_id
  )
  values (
    p_cafe_id,
    null,
    v_payment_id,
    v_name,
    'repayment',
    p_amount,
    p_notes,
    p_by_staff_id,
    p_by_owner_id
  );

  v_balance_after := (v_balance_before - p_amount)::numeric(12,2);

  return jsonb_build_object(
    'ok', true,
    'payment_id', v_payment_id,
    'debtor_name', v_name,
    'repayment_amount', p_amount,
    'balance_before', v_balance_before,
    'balance_after', v_balance_after
  );
end;
$$;

create or replace function public.ops_build_shift_snapshot(
  p_cafe_id uuid,
  p_shift_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_shift ops.shifts%rowtype;
  v_snapshot jsonb;
  v_totals jsonb;
  v_products jsonb;
  v_staff jsonb;
  v_sessions jsonb;
begin
  select *
  into v_shift
  from ops.shifts
  where cafe_id = p_cafe_id
    and id = p_shift_id;

  if not found then
    raise exception 'shift not found';
  end if;

  with item_totals as (
    select
      coalesce(sum(oi.qty_submitted), 0) as submitted_qty,
      coalesce(sum(oi.qty_ready), 0) as ready_qty,
      coalesce(sum(oi.qty_delivered), 0) as delivered_qty,
      coalesce(sum(oi.qty_replacement_delivered), 0) as replacement_delivered_qty,
      coalesce(sum(oi.qty_paid), 0) as paid_qty,
      coalesce(sum(oi.qty_deferred), 0) as deferred_qty,
      coalesce(sum(oi.qty_remade), 0) as remade_qty,
      coalesce(sum(oi.qty_cancelled), 0) as cancelled_qty
    from ops.order_items oi
    where oi.cafe_id = p_cafe_id
      and oi.shift_id = p_shift_id
  ),
  payment_totals as (
    select
      coalesce(sum(case when p.payment_kind = 'cash' then p.total_amount else 0 end), 0)::numeric(12,2) as cash_total,
      coalesce(sum(case when p.payment_kind = 'deferred' then p.total_amount else 0 end), 0)::numeric(12,2) as deferred_total,
      coalesce(sum(case when p.payment_kind = 'repayment' then p.total_amount else 0 end), 0)::numeric(12,2) as repayment_total
    from ops.payments p
    where p.cafe_id = p_cafe_id
      and p.shift_id = p_shift_id
  )
  select jsonb_build_object(
    'submitted_qty', it.submitted_qty,
    'ready_qty', it.ready_qty,
    'delivered_qty', it.delivered_qty,
    'replacement_delivered_qty', it.replacement_delivered_qty,
    'paid_qty', it.paid_qty,
    'deferred_qty', it.deferred_qty,
    'remade_qty', it.remade_qty,
    'cancelled_qty', it.cancelled_qty,
    'cash_total', pt.cash_total,
    'deferred_total', pt.deferred_total,
    'repayment_total', pt.repayment_total
  )
  into v_totals
  from item_totals it
  cross join payment_totals pt;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.product_name), '[]'::jsonb)
  into v_products
  from (
    select
      mp.product_name,
      oi.station_code,
      sum(oi.qty_submitted) as qty_submitted,
      sum(oi.qty_delivered) as qty_delivered,
      sum(oi.qty_paid) as qty_paid,
      sum(oi.qty_deferred) as qty_deferred,
      sum(oi.qty_remade) as qty_remade,
      sum((oi.qty_paid + oi.qty_deferred) * oi.unit_price)::numeric(12,2) as billed_amount
    from ops.order_items oi
    join ops.menu_products mp
      on mp.id = oi.menu_product_id
     and mp.cafe_id = oi.cafe_id
    where oi.cafe_id = p_cafe_id
      and oi.shift_id = p_shift_id
    group by mp.product_name, oi.station_code
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.actor_label), '[]'::jsonb)
  into v_staff
  from (
    select
      actor_label,
      sum(submitted_qty) as submitted_qty,
      sum(ready_qty) as ready_qty,
      sum(delivered_qty) as delivered_qty,
      sum(payment_total)::numeric(12,2) as payment_total
    from (
      select
        sm.full_name as actor_label,
        0::bigint as submitted_qty,
        0::bigint as ready_qty,
        0::bigint as delivered_qty,
        coalesce(sum(p.total_amount), 0)::numeric(12,2) as payment_total
      from ops.payments p
      join ops.staff_members sm
        on sm.id = p.by_staff_id
       and sm.cafe_id = p.cafe_id
      where p.cafe_id = p_cafe_id
        and p.shift_id = p_shift_id
      group by sm.full_name

      union all

      select
        ou.full_name as actor_label,
        0::bigint,
        0::bigint,
        0::bigint,
        coalesce(sum(p.total_amount), 0)::numeric(12,2)
      from ops.payments p
      join ops.owner_users ou
        on ou.id = p.by_owner_id
       and ou.cafe_id = p.cafe_id
      where p.cafe_id = p_cafe_id
        and p.shift_id = p_shift_id
      group by ou.full_name

      union all

      select
        sm.full_name as actor_label,
        coalesce(sum(case when fe.event_code in ('submitted', 'remake_submitted') then fe.quantity else 0 end), 0)::bigint,
        coalesce(sum(case when fe.event_code in ('partial_ready', 'ready') then fe.quantity else 0 end), 0)::bigint,
        coalesce(sum(case when fe.event_code in ('delivered', 'remake_delivered') then fe.quantity else 0 end), 0)::bigint,
        0::numeric(12,2)
      from ops.fulfillment_events fe
      join ops.staff_members sm
        on sm.id = fe.by_staff_id
       and sm.cafe_id = fe.cafe_id
      where fe.cafe_id = p_cafe_id
        and fe.shift_id = p_shift_id
      group by sm.full_name

      union all

      select
        ou.full_name as actor_label,
        coalesce(sum(case when fe.event_code in ('submitted', 'remake_submitted') then fe.quantity else 0 end), 0)::bigint,
        coalesce(sum(case when fe.event_code in ('partial_ready', 'ready') then fe.quantity else 0 end), 0)::bigint,
        coalesce(sum(case when fe.event_code in ('delivered', 'remake_delivered') then fe.quantity else 0 end), 0)::bigint,
        0::numeric(12,2)
      from ops.fulfillment_events fe
      join ops.owner_users ou
        on ou.id = fe.by_owner_id
       and ou.cafe_id = fe.cafe_id
      where fe.cafe_id = p_cafe_id
        and fe.shift_id = p_shift_id
      group by ou.full_name
    ) raw
    group by actor_label
  ) x;

  select jsonb_build_object(
    'open_sessions', coalesce(sum(case when status = 'open' then 1 else 0 end), 0),
    'closed_sessions', coalesce(sum(case when status = 'closed' then 1 else 0 end), 0)
  )
  into v_sessions
  from ops.service_sessions
  where cafe_id = p_cafe_id
    and shift_id = p_shift_id;

  v_snapshot := jsonb_build_object(
    'shift', jsonb_build_object(
      'shift_id', v_shift.id,
      'shift_kind', v_shift.shift_kind,
      'business_date', v_shift.business_date,
      'status', v_shift.status,
      'opened_at', v_shift.opened_at,
      'closed_at', v_shift.closed_at
    ),
    'totals', coalesce(v_totals, '{}'::jsonb),
    'sessions', coalesce(v_sessions, '{}'::jsonb),
    'products', coalesce(v_products, '[]'::jsonb),
    'staff', coalesce(v_staff, '[]'::jsonb)
  );

  insert into ops.shift_snapshots (
    cafe_id,
    shift_id,
    snapshot_json
  )
  values (
    p_cafe_id,
    p_shift_id,
    v_snapshot
  )
  on conflict (cafe_id, shift_id)
  do update set snapshot_json = excluded.snapshot_json,
                created_at = now();

  return v_snapshot;
end;
$$;

create or replace function public.ops_close_shift(
  p_cafe_id uuid,
  p_shift_id uuid,
  p_by_owner_id uuid,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_open_sessions integer;
  v_snapshot jsonb;
begin
  if p_by_owner_id is null then
    raise exception 'p_by_owner_id is required';
  end if;

  select count(*)
  into v_open_sessions
  from ops.service_sessions
  where cafe_id = p_cafe_id
    and shift_id = p_shift_id
    and status = 'open';

  if v_open_sessions > 0 then
    raise exception 'Cannot close shift while open service sessions exist';
  end if;

  update ops.shifts
  set status = 'closed',
      closed_at = now(),
      closed_by_owner_id = p_by_owner_id,
      notes = coalesce(p_notes, notes)
  where cafe_id = p_cafe_id
    and id = p_shift_id
    and status = 'open';

  if not found then
    raise exception 'shift not found or already closed';
  end if;

  v_snapshot := public.ops_build_shift_snapshot(p_cafe_id, p_shift_id);

  return jsonb_build_object(
    'ok', true,
    'shift_id', p_shift_id,
    'status', 'closed',
    'snapshot', v_snapshot
  );
end;
$$;

commit;
-- <<< 0006_ops_hardening_and_rls.sql

-- >>> 0007_runtime_actor_identity_bindings.sql
alter table ops.owner_users
  add column if not exists legacy_app_user_id uuid;

create unique index if not exists uq_ops_owner_users_legacy_app_user_id
  on ops.owner_users(legacy_app_user_id)
  where legacy_app_user_id is not null;

alter table ops.staff_members
  add column if not exists legacy_app_user_id uuid;

create unique index if not exists uq_ops_staff_members_legacy_app_user_id
  on ops.staff_members(legacy_app_user_id)
  where legacy_app_user_id is not null;
-- <<< 0007_runtime_actor_identity_bindings.sql

-- >>> 0008_runtime_local_auth_and_staff_codes.sql
begin;

alter table ops.staff_members
  add column if not exists employee_code text;

alter table ops.staff_members
  drop constraint if exists ck_staff_members_employee_code_nonempty;

alter table ops.staff_members
  add constraint ck_staff_members_employee_code_nonempty
  check (employee_code is null or nullif(btrim(employee_code), '') is not null);

create unique index if not exists uq_ops_staff_members_employee_code
  on ops.staff_members(cafe_id, lower(btrim(employee_code)))
  where employee_code is not null;

create or replace function public.ops_create_staff_member_v2(
  p_cafe_id uuid,
  p_full_name text,
  p_pin text,
  p_employee_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_staff_id uuid;
  v_employee_code text;
begin
  if p_cafe_id is null then
    raise exception 'cafe_id_required';
  end if;

  if coalesce(trim(p_full_name), '') = '' then
    raise exception 'full_name_required';
  end if;

  if coalesce(trim(p_pin), '') = '' then
    raise exception 'pin_required';
  end if;

  v_employee_code := nullif(lower(btrim(p_employee_code)), '');

  insert into ops.staff_members (cafe_id, full_name, pin_hash, employee_code)
  values (
    p_cafe_id,
    trim(p_full_name),
    crypt(p_pin, gen_salt('bf')),
    v_employee_code
  )
  returning id into v_staff_id;

  return jsonb_build_object(
    'staff_member_id', v_staff_id,
    'employee_code', v_employee_code
  );
end;
$$;

create or replace function public.ops_set_staff_member_pin(
  p_cafe_id uuid,
  p_staff_member_id uuid,
  p_pin text
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
begin
  if p_cafe_id is null then
    raise exception 'cafe_id_required';
  end if;

  if p_staff_member_id is null then
    raise exception 'staff_member_id_required';
  end if;

  if coalesce(trim(p_pin), '') = '' then
    raise exception 'pin_required';
  end if;

  update ops.staff_members
  set pin_hash = crypt(p_pin, gen_salt('bf'))
  where cafe_id = p_cafe_id
    and id = p_staff_member_id;

  if not found then
    raise exception 'staff_member_not_found';
  end if;

  return jsonb_build_object(
    'staff_member_id', p_staff_member_id,
    'ok', true
  );
end;
$$;

create or replace function public.ops_set_staff_member_active(
  p_cafe_id uuid,
  p_staff_member_id uuid,
  p_is_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
begin
  if p_cafe_id is null then
    raise exception 'cafe_id_required';
  end if;

  if p_staff_member_id is null then
    raise exception 'staff_member_id_required';
  end if;

  update ops.staff_members
  set is_active = coalesce(p_is_active, false)
  where cafe_id = p_cafe_id
    and id = p_staff_member_id;

  if not found then
    raise exception 'staff_member_not_found';
  end if;

  return jsonb_build_object(
    'staff_member_id', p_staff_member_id,
    'is_active', coalesce(p_is_active, false)
  );
end;
$$;

create or replace function public.ops_verify_owner_login(
  p_slug text,
  p_phone text,
  p_password text
)
returns table (
  cafe_id uuid,
  cafe_slug text,
  owner_user_id uuid,
  full_name text,
  owner_label text
)
language plpgsql
security definer
set search_path = public, ops
as $$
begin
  return query
  select
    c.id,
    c.slug,
    o.id,
    o.full_name,
    'owner'::text
  from ops.cafes c
  join ops.owner_users o
    on o.cafe_id = c.id
  where lower(btrim(c.slug)) = lower(btrim(p_slug))
    and c.is_active = true
    and o.is_active = true
    and btrim(o.phone) = btrim(p_phone)
    and crypt(p_password, o.password_hash) = o.password_hash
  limit 1;
end;
$$;

create or replace function public.ops_verify_staff_pin_login(
  p_slug text,
  p_identifier text,
  p_pin text
)
returns table (
  cafe_id uuid,
  cafe_slug text,
  staff_member_id uuid,
  full_name text,
  employee_code text,
  shift_id uuid,
  shift_role text,
  login_state text
)
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_cafe_id uuid;
  v_cafe_slug text;
  v_staff ops.staff_members%rowtype;
  v_shift_id uuid;
  v_shift_role text;
begin
  select c.id, c.slug
  into v_cafe_id, v_cafe_slug
  from ops.cafes c
  where lower(btrim(c.slug)) = lower(btrim(p_slug))
    and c.is_active = true
  limit 1;

  if v_cafe_id is null then
    return;
  end if;

  select sm.*
  into v_staff
  from ops.staff_members sm
  where sm.cafe_id = v_cafe_id
    and sm.is_active = true
    and (
      lower(btrim(sm.full_name)) = lower(btrim(p_identifier))
      or lower(btrim(coalesce(sm.employee_code, ''))) = lower(btrim(p_identifier))
    )
    and crypt(p_pin, sm.pin_hash) = sm.pin_hash
  limit 1;

  if v_staff.id is null then
    return;
  end if;

  select s.id
  into v_shift_id
  from ops.shifts s
  where s.cafe_id = v_cafe_id
    and s.status = 'open'
  order by s.opened_at desc
  limit 1;

  if v_shift_id is null then
    return query
    select v_cafe_id, v_cafe_slug, v_staff.id, v_staff.full_name, v_staff.employee_code, null::uuid, null::text, 'no_shift'::text;
    return;
  end if;

  select sra.role_code
  into v_shift_role
  from ops.shift_role_assignments sra
  where sra.cafe_id = v_cafe_id
    and sra.shift_id = v_shift_id
    and sra.staff_member_id = v_staff.id
    and sra.is_active = true
  order by sra.assigned_at desc
  limit 1;

  if v_shift_role is null then
    return query
    select v_cafe_id, v_cafe_slug, v_staff.id, v_staff.full_name, v_staff.employee_code, v_shift_id, null::text, 'not_assigned'::text;
    return;
  end if;

  return query
  select v_cafe_id, v_cafe_slug, v_staff.id, v_staff.full_name, v_staff.employee_code, v_shift_id, v_shift_role, 'ok'::text;
end;
$$;

commit;
-- <<< 0008_runtime_local_auth_and_staff_codes.sql

-- >>> 0009_pgcrypto_schema_qualification.sql
begin;

create or replace function public.ops_create_staff_member(
  p_cafe_id uuid,
  p_full_name text,
  p_pin text
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_staff_id uuid;
begin
  if p_cafe_id is null then
    raise exception 'cafe_id_required';
  end if;
  if coalesce(trim(p_full_name), '') = '' then
    raise exception 'full_name_required';
  end if;
  if coalesce(trim(p_pin), '') = '' then
    raise exception 'pin_required';
  end if;

  insert into ops.staff_members (cafe_id, full_name, pin_hash)
  values (
    p_cafe_id,
    trim(p_full_name),
    extensions.crypt(p_pin, extensions.gen_salt('bf'))
  )
  returning id into v_staff_id;

  return jsonb_build_object('staff_member_id', v_staff_id);
end;
$$;

create or replace function public.ops_create_staff_member_v2(
  p_cafe_id uuid,
  p_full_name text,
  p_pin text,
  p_employee_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_staff_id uuid;
  v_employee_code text;
begin
  if p_cafe_id is null then
    raise exception 'cafe_id_required';
  end if;

  if coalesce(trim(p_full_name), '') = '' then
    raise exception 'full_name_required';
  end if;

  if coalesce(trim(p_pin), '') = '' then
    raise exception 'pin_required';
  end if;

  v_employee_code := nullif(lower(btrim(p_employee_code)), '');

  insert into ops.staff_members (cafe_id, full_name, pin_hash, employee_code)
  values (
    p_cafe_id,
    trim(p_full_name),
    extensions.crypt(p_pin, extensions.gen_salt('bf')),
    v_employee_code
  )
  returning id into v_staff_id;

  return jsonb_build_object(
    'staff_member_id', v_staff_id,
    'employee_code', v_employee_code
  );
end;
$$;

create or replace function public.ops_set_staff_member_pin(
  p_cafe_id uuid,
  p_staff_member_id uuid,
  p_pin text
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
begin
  if p_cafe_id is null then
    raise exception 'cafe_id_required';
  end if;

  if p_staff_member_id is null then
    raise exception 'staff_member_id_required';
  end if;

  if coalesce(trim(p_pin), '') = '' then
    raise exception 'pin_required';
  end if;

  update ops.staff_members
  set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf'))
  where cafe_id = p_cafe_id
    and id = p_staff_member_id;

  if not found then
    raise exception 'staff_member_not_found';
  end if;

  return jsonb_build_object(
    'staff_member_id', p_staff_member_id,
    'ok', true
  );
end;
$$;

create or replace function public.ops_verify_owner_login(
  p_slug text,
  p_phone text,
  p_password text
)
returns table (
  cafe_id uuid,
  cafe_slug text,
  owner_user_id uuid,
  full_name text,
  owner_label text
)
language plpgsql
security definer
set search_path = public, ops
as $$
begin
  return query
  select
    c.id,
    c.slug,
    o.id,
    o.full_name,
    'owner'::text
  from ops.cafes c
  join ops.owner_users o
    on o.cafe_id = c.id
  where lower(btrim(c.slug)) = lower(btrim(p_slug))
    and c.is_active = true
    and o.is_active = true
    and btrim(o.phone) = btrim(p_phone)
    and extensions.crypt(p_password, o.password_hash) = o.password_hash
  limit 1;
end;
$$;

create or replace function public.ops_verify_staff_pin_login(
  p_slug text,
  p_identifier text,
  p_pin text
)
returns table (
  cafe_id uuid,
  cafe_slug text,
  staff_member_id uuid,
  full_name text,
  employee_code text,
  shift_id uuid,
  shift_role text,
  login_state text
)
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_cafe_id uuid;
  v_cafe_slug text;
  v_staff ops.staff_members%rowtype;
  v_shift_id uuid;
  v_shift_role text;
begin
  select c.id, c.slug
  into v_cafe_id, v_cafe_slug
  from ops.cafes c
  where lower(btrim(c.slug)) = lower(btrim(p_slug))
    and c.is_active = true
  limit 1;

  if v_cafe_id is null then
    return;
  end if;

  select sm.*
  into v_staff
  from ops.staff_members sm
  where sm.cafe_id = v_cafe_id
    and sm.is_active = true
    and (
      lower(btrim(sm.full_name)) = lower(btrim(p_identifier))
      or lower(btrim(coalesce(sm.employee_code, ''))) = lower(btrim(p_identifier))
    )
    and extensions.crypt(p_pin, sm.pin_hash) = sm.pin_hash
  limit 1;

  if v_staff.id is null then
    return;
  end if;

  select s.id
  into v_shift_id
  from ops.shifts s
  where s.cafe_id = v_cafe_id
    and s.status = 'open'
  order by s.opened_at desc
  limit 1;

  if v_shift_id is null then
    return query
    select v_cafe_id, v_cafe_slug, v_staff.id, v_staff.full_name, v_staff.employee_code, null::uuid, null::text, 'no_shift'::text;
    return;
  end if;

  select sra.role_code
  into v_shift_role
  from ops.shift_role_assignments sra
  where sra.cafe_id = v_cafe_id
    and sra.shift_id = v_shift_id
    and sra.staff_member_id = v_staff.id
    and sra.is_active = true
  order by sra.assigned_at desc
  limit 1;

  if v_shift_role is null then
    return query
    select v_cafe_id, v_cafe_slug, v_staff.id, v_staff.full_name, v_staff.employee_code, v_shift_id, null::text, 'not_assigned'::text;
    return;
  end if;

  return query
  select v_cafe_id, v_cafe_slug, v_staff.id, v_staff.full_name, v_staff.employee_code, v_shift_id, v_shift_role, 'ok'::text;
end;
$$;

commit;
-- <<< 0009_pgcrypto_schema_qualification.sql

-- >>> 0010_phase3_complaints_cancel_and_waive.sql
begin;

alter table ops.order_items
  add column if not exists qty_waived integer not null default 0;

alter table ops.order_items
  drop constraint if exists ck_order_items_progress;

alter table ops.order_items
  add constraint ck_order_items_progress
  check (
    qty_submitted <= qty_total
    and qty_ready <= qty_submitted + qty_remade
    and qty_delivered <= qty_ready
    and qty_replacement_delivered <= qty_ready
    and qty_replacement_delivered <= qty_remade
    and qty_paid + qty_deferred + qty_waived <= qty_delivered
    and qty_cancelled <= qty_total
  );

alter table ops.fulfillment_events
  drop constraint if exists fulfillment_events_event_code_check;

alter table ops.fulfillment_events
  add constraint fulfillment_events_event_code_check
  check (
    event_code in (
      'submitted',
      'partial_ready',
      'ready',
      'delivered',
      'remake_requested',
      'remake_submitted',
      'remake_delivered',
      'cancelled',
      'waived'
    )
  );

create table if not exists ops.complaints (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  shift_id uuid not null,
  service_session_id uuid not null,
  order_item_id uuid,
  station_code text check (station_code in ('barista', 'shisha')),
  complaint_kind text not null check (complaint_kind in ('quality_issue', 'wrong_item', 'delay', 'billing_issue', 'other')),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolution_kind text check (resolution_kind in ('remake', 'cancel_undelivered', 'waive_delivered', 'dismissed')),
  requested_quantity integer check (requested_quantity is null or requested_quantity > 0),
  resolved_quantity integer check (resolved_quantity is null or resolved_quantity > 0),
  notes text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_by_staff_id uuid,
  created_by_owner_id uuid,
  resolved_by_staff_id uuid,
  resolved_by_owner_id uuid,
  unique (cafe_id, id),
  constraint fk_complaints_shift
    foreign key (cafe_id, shift_id)
    references ops.shifts(cafe_id, id)
    on delete cascade,
  constraint fk_complaints_session
    foreign key (cafe_id, service_session_id)
    references ops.service_sessions(cafe_id, id)
    on delete cascade,
  constraint fk_complaints_item
    foreign key (cafe_id, order_item_id)
    references ops.order_items(cafe_id, id)
    on delete set null,
  constraint fk_complaints_created_staff
    foreign key (cafe_id, created_by_staff_id)
    references ops.staff_members(cafe_id, id)
    on delete set null,
  constraint fk_complaints_created_owner
    foreign key (cafe_id, created_by_owner_id)
    references ops.owner_users(cafe_id, id)
    on delete set null,
  constraint fk_complaints_resolved_staff
    foreign key (cafe_id, resolved_by_staff_id)
    references ops.staff_members(cafe_id, id)
    on delete set null,
  constraint fk_complaints_resolved_owner
    foreign key (cafe_id, resolved_by_owner_id)
    references ops.owner_users(cafe_id, id)
    on delete set null,
  constraint ck_complaints_created_actor
    check (
      (created_by_staff_id is not null and created_by_owner_id is null)
      or
      (created_by_staff_id is null and created_by_owner_id is not null)
    ),
  constraint ck_complaints_resolved_actor
    check (
      (resolved_by_staff_id is null and resolved_by_owner_id is null)
      or
      (resolved_by_staff_id is not null and resolved_by_owner_id is null)
      or
      (resolved_by_staff_id is null and resolved_by_owner_id is not null)
    )
);

create index if not exists idx_complaints_shift_created_at
  on ops.complaints(cafe_id, shift_id, created_at desc);

create index if not exists idx_complaints_order_item
  on ops.complaints(cafe_id, order_item_id, created_at desc);

alter table ops.complaints enable row level security;
drop policy if exists cafe_access_policy on ops.complaints;
create policy cafe_access_policy on ops.complaints for all
  using (app.can_access_cafe(cafe_id))
  with check (app.can_access_cafe(cafe_id));

create or replace function public.ops_list_billable_quantities(
  p_cafe_id uuid,
  p_shift_id uuid,
  p_service_session_id uuid default null
)
returns jsonb
language sql
security definer
set search_path = public, ops
as $$
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at asc), '[]'::jsonb)
  from (
    select
      oi.id as order_item_id,
      oi.order_id,
      oi.service_session_id,
      ss.session_label,
      oi.menu_product_id,
      mp.product_name,
      oi.station_code,
      oi.unit_price,
      oi.qty_total,
      oi.qty_delivered,
      oi.qty_paid,
      oi.qty_deferred,
      oi.qty_waived,
      greatest(oi.qty_delivered - oi.qty_paid - oi.qty_deferred - oi.qty_waived, 0) as qty_billable,
      (greatest(oi.qty_delivered - oi.qty_paid - oi.qty_deferred - oi.qty_waived, 0) * oi.unit_price)::numeric(12,2) as amount_billable,
      oi.created_at
    from ops.order_items oi
    join ops.service_sessions ss
      on ss.id = oi.service_session_id
     and ss.cafe_id = oi.cafe_id
    join ops.menu_products mp
      on mp.id = oi.menu_product_id
     and mp.cafe_id = oi.cafe_id
    where oi.cafe_id = p_cafe_id
      and oi.shift_id = p_shift_id
      and (p_service_session_id is null or oi.service_session_id = p_service_session_id)
      and greatest(oi.qty_delivered - oi.qty_paid - oi.qty_deferred - oi.qty_waived, 0) > 0
    order by oi.created_at asc
  ) q;
$$;

create or replace function public.ops_settle_selected_quantities(
  p_cafe_id uuid,
  p_shift_id uuid,
  p_service_session_id uuid,
  p_lines jsonb,
  p_by_staff_id uuid default null,
  p_by_owner_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_payment_id uuid;
  v_total_amount numeric(12,2) := 0;
  v_total_quantity integer := 0;
  v_line jsonb;
  v_item ops.order_items%rowtype;
  v_qty integer;
  v_available integer;
  v_amount numeric(12,2);
begin
  if p_service_session_id is null then
    raise exception 'p_service_session_id is required';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'p_lines must be a non-empty json array';
  end if;

  if (p_by_staff_id is null and p_by_owner_id is null)
     or (p_by_staff_id is not null and p_by_owner_id is not null) then
    raise exception 'Exactly one actor is required';
  end if;

  insert into ops.payments (
    cafe_id,
    shift_id,
    service_session_id,
    payment_kind,
    total_amount,
    notes,
    by_staff_id,
    by_owner_id
  )
  values (
    p_cafe_id,
    p_shift_id,
    p_service_session_id,
    'cash',
    0,
    p_notes,
    p_by_staff_id,
    p_by_owner_id
  )
  returning id into v_payment_id;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_qty := coalesce((v_line ->> 'quantity')::integer, 0);

    if v_qty <= 0 then
      raise exception 'Each line quantity must be greater than zero';
    end if;

    select *
    into v_item
    from ops.order_items
    where cafe_id = p_cafe_id
      and shift_id = p_shift_id
      and service_session_id = p_service_session_id
      and id = (v_line ->> 'order_item_id')::uuid
    for update;

    if not found then
      raise exception 'order_item % not found in this session', v_line ->> 'order_item_id';
    end if;

    v_available := greatest(v_item.qty_delivered - v_item.qty_paid - v_item.qty_deferred - v_item.qty_waived, 0);

    if v_qty > v_available then
      raise exception 'Requested quantity % exceeds billable quantity % for order_item %', v_qty, v_available, v_item.id;
    end if;

    v_amount := (v_item.unit_price * v_qty)::numeric(12,2);

    update ops.order_items
    set qty_paid = qty_paid + v_qty
    where cafe_id = p_cafe_id
      and id = v_item.id;

    insert into ops.payment_allocations (
      cafe_id,
      payment_id,
      order_item_id,
      allocation_kind,
      quantity,
      amount
    )
    values (
      p_cafe_id,
      v_payment_id,
      v_item.id,
      'cash',
      v_qty,
      v_amount
    );

    v_total_quantity := v_total_quantity + v_qty;
    v_total_amount := v_total_amount + v_amount;
  end loop;

  update ops.payments
  set total_amount = v_total_amount
  where cafe_id = p_cafe_id
    and id = v_payment_id;

  return jsonb_build_object(
    'ok', true,
    'payment_id', v_payment_id,
    'total_quantity', v_total_quantity,
    'total_amount', v_total_amount
  );
end;
$$;

create or replace function public.ops_defer_selected_quantities(
  p_cafe_id uuid,
  p_shift_id uuid,
  p_service_session_id uuid,
  p_debtor_name text,
  p_lines jsonb,
  p_by_staff_id uuid default null,
  p_by_owner_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_payment_id uuid;
  v_total_amount numeric(12,2) := 0;
  v_total_quantity integer := 0;
  v_line jsonb;
  v_item ops.order_items%rowtype;
  v_qty integer;
  v_available integer;
  v_amount numeric(12,2);
  v_name text;
begin
  v_name := nullif(btrim(p_debtor_name), '');

  if v_name is null then
    raise exception 'p_debtor_name is required';
  end if;

  if p_service_session_id is null then
    raise exception 'p_service_session_id is required';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'p_lines must be a non-empty json array';
  end if;

  if (p_by_staff_id is null and p_by_owner_id is null)
     or (p_by_staff_id is not null and p_by_owner_id is not null) then
    raise exception 'Exactly one actor is required';
  end if;

  insert into ops.payments (
    cafe_id,
    shift_id,
    service_session_id,
    payment_kind,
    total_amount,
    debtor_name,
    notes,
    by_staff_id,
    by_owner_id
  )
  values (
    p_cafe_id,
    p_shift_id,
    p_service_session_id,
    'deferred',
    0,
    v_name,
    p_notes,
    p_by_staff_id,
    p_by_owner_id
  )
  returning id into v_payment_id;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_qty := coalesce((v_line ->> 'quantity')::integer, 0);

    if v_qty <= 0 then
      raise exception 'Each line quantity must be greater than zero';
    end if;

    select *
    into v_item
    from ops.order_items
    where cafe_id = p_cafe_id
      and shift_id = p_shift_id
      and service_session_id = p_service_session_id
      and id = (v_line ->> 'order_item_id')::uuid
    for update;

    if not found then
      raise exception 'order_item % not found in this session', v_line ->> 'order_item_id';
    end if;

    v_available := greatest(v_item.qty_delivered - v_item.qty_paid - v_item.qty_deferred - v_item.qty_waived, 0);

    if v_qty > v_available then
      raise exception 'Requested quantity % exceeds billable quantity % for order_item %', v_qty, v_available, v_item.id;
    end if;

    v_amount := (v_item.unit_price * v_qty)::numeric(12,2);

    update ops.order_items
    set qty_deferred = qty_deferred + v_qty
    where cafe_id = p_cafe_id
      and id = v_item.id;

    insert into ops.payment_allocations (
      cafe_id,
      payment_id,
      order_item_id,
      allocation_kind,
      quantity,
      amount
    )
    values (
      p_cafe_id,
      v_payment_id,
      v_item.id,
      'deferred',
      v_qty,
      v_amount
    );

    v_total_quantity := v_total_quantity + v_qty;
    v_total_amount := v_total_amount + v_amount;
  end loop;

  update ops.payments
  set total_amount = v_total_amount
  where cafe_id = p_cafe_id
    and id = v_payment_id;

  insert into ops.deferred_ledger_entries (
    cafe_id,
    service_session_id,
    payment_id,
    debtor_name,
    entry_kind,
    amount,
    notes,
    by_staff_id,
    by_owner_id
  )
  values (
    p_cafe_id,
    p_service_session_id,
    v_payment_id,
    v_name,
    'debt',
    v_total_amount,
    p_notes,
    p_by_staff_id,
    p_by_owner_id
  );

  return jsonb_build_object(
    'ok', true,
    'payment_id', v_payment_id,
    'debtor_name', v_name,
    'total_quantity', v_total_quantity,
    'total_amount', v_total_amount
  );
end;
$$;

create or replace function public.ops_close_service_session(
  p_cafe_id uuid,
  p_service_session_id uuid,
  p_by_staff_id uuid default null,
  p_by_owner_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_session ops.service_sessions%rowtype;
  v_waiting integer;
  v_ready_undelivered integer;
  v_billable integer;
begin
  if (p_by_staff_id is null and p_by_owner_id is null)
     or (p_by_staff_id is not null and p_by_owner_id is not null) then
    raise exception 'Exactly one actor is required';
  end if;

  select *
  into v_session
  from ops.service_sessions
  where cafe_id = p_cafe_id
    and id = p_service_session_id
  for update;

  if not found then
    raise exception 'service_session not found';
  end if;

  if v_session.status <> 'open' then
    raise exception 'service_session is already closed';
  end if;

  select
    coalesce(sum(
      greatest(qty_submitted - least(qty_ready, qty_submitted) - qty_cancelled, 0)
      + greatest(qty_remade - greatest(qty_ready - least(qty_ready, qty_submitted), 0), 0)
    ), 0),
    coalesce(sum(
      greatest(least(qty_ready, qty_total - qty_cancelled) - qty_delivered, 0)
      + greatest(qty_ready - least(qty_ready, qty_total - qty_cancelled) - qty_replacement_delivered, 0)
    ), 0),
    coalesce(sum(greatest(qty_delivered - qty_paid - qty_deferred - qty_waived, 0)), 0)
  into v_waiting, v_ready_undelivered, v_billable
  from ops.order_items
  where cafe_id = p_cafe_id
    and service_session_id = p_service_session_id;

  if v_waiting > 0 then
    raise exception 'Cannot close service session while station queue is still pending';
  end if;

  if v_ready_undelivered > 0 then
    raise exception 'Cannot close service session while ready quantities are not delivered';
  end if;

  if v_billable > 0 then
    raise exception 'Cannot close service session while delivered unpaid quantities exist';
  end if;

  update ops.service_sessions
  set status = 'closed',
      closed_at = now(),
      closed_by_staff_id = p_by_staff_id,
      closed_by_owner_id = p_by_owner_id,
      notes = coalesce(p_notes, notes)
  where cafe_id = p_cafe_id
    and id = p_service_session_id;

  update ops.orders
  set status = 'completed'
  where cafe_id = p_cafe_id
    and service_session_id = p_service_session_id
    and status <> 'cancelled';

  return jsonb_build_object(
    'ok', true,
    'service_session_id', p_service_session_id,
    'status', 'closed'
  );
end;
$$;

create or replace function public.ops_cancel_undelivered_quantities(
  p_cafe_id uuid,
  p_order_item_id uuid,
  p_quantity integer,
  p_by_staff_id uuid default null,
  p_by_owner_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_item ops.order_items%rowtype;
  v_available integer;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'p_quantity must be greater than zero';
  end if;

  if (p_by_staff_id is null and p_by_owner_id is null)
     or (p_by_staff_id is not null and p_by_owner_id is not null) then
    raise exception 'Exactly one actor is required';
  end if;

  select *
  into v_item
  from ops.order_items
  where cafe_id = p_cafe_id
    and id = p_order_item_id
  for update;

  if not found then
    raise exception 'order_item not found';
  end if;

  v_available := greatest(v_item.qty_total - v_item.qty_cancelled - v_item.qty_delivered, 0);

  if v_available = 0 then
    raise exception 'No undelivered original quantity available for cancellation';
  end if;

  if p_quantity > v_available then
    raise exception 'Requested cancel quantity % exceeds available quantity %', p_quantity, v_available;
  end if;

  update ops.order_items
  set qty_cancelled = qty_cancelled + p_quantity
  where cafe_id = p_cafe_id
    and id = p_order_item_id;

  insert into ops.fulfillment_events (
    cafe_id,
    shift_id,
    service_session_id,
    order_item_id,
    station_code,
    event_code,
    quantity,
    notes,
    by_staff_id,
    by_owner_id
  )
  values (
    v_item.cafe_id,
    v_item.shift_id,
    v_item.service_session_id,
    v_item.id,
    v_item.station_code,
    'cancelled',
    p_quantity,
    p_notes,
    p_by_staff_id,
    p_by_owner_id
  );

  return jsonb_build_object(
    'ok', true,
    'order_item_id', v_item.id,
    'qty_cancelled', p_quantity
  );
end;
$$;

create or replace function public.ops_waive_delivered_quantities(
  p_cafe_id uuid,
  p_order_item_id uuid,
  p_quantity integer,
  p_by_staff_id uuid default null,
  p_by_owner_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_item ops.order_items%rowtype;
  v_available integer;
  v_amount numeric(12,2);
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'p_quantity must be greater than zero';
  end if;

  if (p_by_staff_id is null and p_by_owner_id is null)
     or (p_by_staff_id is not null and p_by_owner_id is not null) then
    raise exception 'Exactly one actor is required';
  end if;

  select *
  into v_item
  from ops.order_items
  where cafe_id = p_cafe_id
    and id = p_order_item_id
  for update;

  if not found then
    raise exception 'order_item not found';
  end if;

  v_available := greatest(v_item.qty_delivered - v_item.qty_paid - v_item.qty_deferred - v_item.qty_waived, 0);

  if v_available = 0 then
    raise exception 'No delivered unpaid quantity available for waive';
  end if;

  if p_quantity > v_available then
    raise exception 'Requested waive quantity % exceeds available quantity %', p_quantity, v_available;
  end if;

  update ops.order_items
  set qty_waived = qty_waived + p_quantity
  where cafe_id = p_cafe_id
    and id = p_order_item_id;

  insert into ops.fulfillment_events (
    cafe_id,
    shift_id,
    service_session_id,
    order_item_id,
    station_code,
    event_code,
    quantity,
    notes,
    by_staff_id,
    by_owner_id
  )
  values (
    v_item.cafe_id,
    v_item.shift_id,
    v_item.service_session_id,
    v_item.id,
    v_item.station_code,
    'waived',
    p_quantity,
    p_notes,
    p_by_staff_id,
    p_by_owner_id
  );

  v_amount := (v_item.unit_price * p_quantity)::numeric(12,2);

  return jsonb_build_object(
    'ok', true,
    'order_item_id', v_item.id,
    'qty_waived', p_quantity,
    'amount_waived', v_amount
  );
end;
$$;

create or replace function public.ops_create_complaint(
  p_cafe_id uuid,
  p_service_session_id uuid default null,
  p_order_item_id uuid default null,
  p_complaint_kind text default 'other',
  p_requested_quantity integer default null,
  p_notes text default null,
  p_by_staff_id uuid default null,
  p_by_owner_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_session ops.service_sessions%rowtype;
  v_item ops.order_items%rowtype;
  v_complaint_id uuid;
  v_kind text;
  v_quantity integer;
begin
  v_kind := case
    when p_complaint_kind in ('quality_issue', 'wrong_item', 'delay', 'billing_issue', 'other') then p_complaint_kind
    else 'other'
  end;
  v_quantity := case when p_requested_quantity is null or p_requested_quantity <= 0 then null else p_requested_quantity end;

  if (p_by_staff_id is null and p_by_owner_id is null)
     or (p_by_staff_id is not null and p_by_owner_id is not null) then
    raise exception 'Exactly one actor is required';
  end if;

  if p_order_item_id is not null then
    select *
    into v_item
    from ops.order_items
    where cafe_id = p_cafe_id
      and id = p_order_item_id;

    if not found then
      raise exception 'order_item not found';
    end if;

    if p_service_session_id is not null and v_item.service_session_id <> p_service_session_id then
      raise exception 'order_item does not belong to service_session';
    end if;

    p_service_session_id := v_item.service_session_id;
  end if;

  if p_service_session_id is null then
    raise exception 'service_session_id is required';
  end if;

  select *
  into v_session
  from ops.service_sessions
  where cafe_id = p_cafe_id
    and id = p_service_session_id;

  if not found then
    raise exception 'service_session not found';
  end if;

  insert into ops.complaints (
    cafe_id,
    shift_id,
    service_session_id,
    order_item_id,
    station_code,
    complaint_kind,
    status,
    requested_quantity,
    notes,
    created_by_staff_id,
    created_by_owner_id
  )
  values (
    p_cafe_id,
    v_session.shift_id,
    p_service_session_id,
    p_order_item_id,
    coalesce(v_item.station_code, null),
    v_kind,
    'open',
    v_quantity,
    nullif(btrim(p_notes), ''),
    p_by_staff_id,
    p_by_owner_id
  )
  returning id into v_complaint_id;

  return jsonb_build_object(
    'ok', true,
    'complaint_id', v_complaint_id,
    'shift_id', v_session.shift_id,
    'service_session_id', p_service_session_id,
    'order_item_id', p_order_item_id,
    'status', 'open'
  );
end;
$$;

create or replace function public.ops_resolve_complaint(
  p_cafe_id uuid,
  p_complaint_id uuid,
  p_resolution_kind text,
  p_quantity integer default null,
  p_notes text default null,
  p_by_staff_id uuid default null,
  p_by_owner_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_complaint ops.complaints%rowtype;
  v_requested_quantity integer;
  v_resolution text;
  v_result jsonb;
  v_quantity integer;
begin
  if (p_by_staff_id is null and p_by_owner_id is null)
     or (p_by_staff_id is not null and p_by_owner_id is not null) then
    raise exception 'Exactly one actor is required';
  end if;

  v_resolution := case
    when p_resolution_kind in ('remake', 'cancel_undelivered', 'waive_delivered', 'dismissed') then p_resolution_kind
    else null
  end;

  if v_resolution is null then
    raise exception 'Invalid resolution kind';
  end if;

  select *
  into v_complaint
  from ops.complaints
  where cafe_id = p_cafe_id
    and id = p_complaint_id
  for update;

  if not found then
    raise exception 'complaint not found';
  end if;

  if v_complaint.status <> 'open' then
    raise exception 'complaint is already closed';
  end if;

  v_requested_quantity := coalesce(v_complaint.requested_quantity, 0);
  v_quantity := coalesce(nullif(p_quantity, 0), nullif(v_requested_quantity, 0), 1);

  if v_resolution = 'dismissed' then
    v_quantity := null;
  else
    if v_complaint.order_item_id is null then
      raise exception 'complaint must reference order_item for this resolution';
    end if;
    if v_quantity is null or v_quantity <= 0 then
      raise exception 'resolution quantity must be greater than zero';
    end if;

    if v_resolution = 'remake' then
      v_result := public.ops_request_remake(
        p_cafe_id,
        v_complaint.order_item_id,
        v_quantity,
        p_by_staff_id,
        p_by_owner_id,
        p_notes
      );
    elsif v_resolution = 'cancel_undelivered' then
      v_result := public.ops_cancel_undelivered_quantities(
        p_cafe_id,
        v_complaint.order_item_id,
        v_quantity,
        p_by_staff_id,
        p_by_owner_id,
        p_notes
      );
    elsif v_resolution = 'waive_delivered' then
      v_result := public.ops_waive_delivered_quantities(
        p_cafe_id,
        v_complaint.order_item_id,
        v_quantity,
        p_by_staff_id,
        p_by_owner_id,
        p_notes
      );
    end if;
  end if;

  update ops.complaints
  set status = case when v_resolution = 'dismissed' then 'dismissed' else 'resolved' end,
      resolution_kind = v_resolution,
      resolved_quantity = v_quantity,
      resolved_at = now(),
      resolved_by_staff_id = p_by_staff_id,
      resolved_by_owner_id = p_by_owner_id,
      notes = case
        when nullif(btrim(p_notes), '') is null then notes
        when notes is null or btrim(notes) = '' then btrim(p_notes)
        else notes || E'\n' || btrim(p_notes)
      end
  where cafe_id = p_cafe_id
    and id = p_complaint_id;

  return jsonb_build_object(
    'ok', true,
    'complaint_id', v_complaint.id,
    'shift_id', v_complaint.shift_id,
    'service_session_id', v_complaint.service_session_id,
    'order_item_id', v_complaint.order_item_id,
    'resolution_kind', v_resolution,
    'resolved_quantity', v_quantity,
    'operation', coalesce(v_result, '{}'::jsonb)
  );
end;
$$;

commit;
-- <<< 0010_phase3_complaints_cancel_and_waive.sql

-- >>> 0011_phase1_platform_partners_and_subscriptions.sql
begin;

alter table ops.owner_users
  add column if not exists owner_label text;

update ops.owner_users
set owner_label = 'owner'
where owner_label is null;

alter table ops.owner_users
  alter column owner_label set default 'owner';

alter table ops.owner_users
  alter column owner_label set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chk_ops_owner_users_owner_label'
  ) then
    alter table ops.owner_users
      add constraint chk_ops_owner_users_owner_label
      check (owner_label in ('owner', 'partner'));
  end if;
end;
$$;

create index if not exists idx_owner_users_cafe_owner_label
  on ops.owner_users(cafe_id, owner_label);

create or replace function public.ops_verify_owner_login(
  p_slug text,
  p_phone text,
  p_password text
)
returns table (
  cafe_id uuid,
  cafe_slug text,
  owner_user_id uuid,
  full_name text,
  owner_label text
)
language plpgsql
security definer
set search_path = public, ops
as $$
begin
  return query
  select
    c.id,
    c.slug,
    o.id,
    o.full_name,
    o.owner_label
  from ops.cafes c
  join ops.owner_users o
    on o.cafe_id = c.id
  where lower(btrim(c.slug)) = lower(btrim(p_slug))
    and c.is_active = true
    and o.is_active = true
    and btrim(o.phone) = btrim(p_phone)
    and extensions.crypt(p_password, o.password_hash) = o.password_hash
  limit 1;
end;
$$;

commit;
-- <<< 0011_phase1_platform_partners_and_subscriptions.sql

-- >>> 0012_phase2_menu_management.sql
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
-- <<< 0012_phase2_menu_management.sql

-- >>> 0013_phase3_remake_delivery_fix.sql
begin;

create or replace function public.ops_deliver_available_quantities(
  p_cafe_id uuid,
  p_order_item_id uuid,
  p_quantity integer,
  p_by_staff_id uuid default null,
  p_by_owner_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_item ops.order_items%rowtype;
  v_normal_ready integer;
  v_replacement_ready integer;
  v_normal_to_deliver integer;
  v_replacement_to_deliver integer;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'p_quantity must be greater than zero';
  end if;

  if (p_by_staff_id is null and p_by_owner_id is null)
     or (p_by_staff_id is not null and p_by_owner_id is not null) then
    raise exception 'Exactly one actor is required';
  end if;

  select *
  into v_item
  from ops.order_items
  where cafe_id = p_cafe_id
    and id = p_order_item_id
  for update;

  if not found then
    raise exception 'order_item not found';
  end if;

  v_normal_ready := greatest(
    least(v_item.qty_ready, v_item.qty_total - v_item.qty_cancelled) - v_item.qty_delivered,
    0
  );
  v_replacement_ready := greatest(
    v_item.qty_ready
      - least(v_item.qty_ready, v_item.qty_total - v_item.qty_cancelled)
      - v_item.qty_replacement_delivered,
    0
  );

  if p_quantity > (v_normal_ready + v_replacement_ready) then
    raise exception 'Requested quantity % exceeds ready quantity %', p_quantity, (v_normal_ready + v_replacement_ready);
  end if;

  v_normal_to_deliver := least(p_quantity, v_normal_ready);
  v_replacement_to_deliver := greatest(least(p_quantity - v_normal_to_deliver, v_replacement_ready), 0);

  if v_normal_to_deliver > 0 then
    update ops.order_items
    set qty_delivered = qty_delivered + v_normal_to_deliver
    where cafe_id = p_cafe_id
      and id = p_order_item_id;

    insert into ops.fulfillment_events (
      cafe_id,
      shift_id,
      service_session_id,
      order_item_id,
      station_code,
      event_code,
      quantity,
      notes,
      by_staff_id,
      by_owner_id
    )
    values (
      v_item.cafe_id,
      v_item.shift_id,
      v_item.service_session_id,
      v_item.id,
      v_item.station_code,
      'delivered',
      v_normal_to_deliver,
      p_notes,
      p_by_staff_id,
      p_by_owner_id
    );
  end if;

  if v_replacement_to_deliver > 0 then
    update ops.order_items
    set qty_replacement_delivered = qty_replacement_delivered + v_replacement_to_deliver
    where cafe_id = p_cafe_id
      and id = p_order_item_id;

    insert into ops.fulfillment_events (
      cafe_id,
      shift_id,
      service_session_id,
      order_item_id,
      station_code,
      event_code,
      quantity,
      notes,
      by_staff_id,
      by_owner_id
    )
    values (
      v_item.cafe_id,
      v_item.shift_id,
      v_item.service_session_id,
      v_item.id,
      v_item.station_code,
      'remake_delivered',
      v_replacement_to_deliver,
      p_notes,
      p_by_staff_id,
      p_by_owner_id
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'order_item_id', v_item.id,
    'delivered_qty', v_normal_to_deliver,
    'replacement_delivered_qty', v_replacement_to_deliver,
    'quantity', p_quantity
  );
end;
$$;

commit;
-- <<< 0013_phase3_remake_delivery_fix.sql

-- >>> 0014_shift_resume_latest_and_single_row.sql
begin;

set local search_path = public, ops;

-- =========================================================
-- 0014_shift_resume_latest_and_single_row.sql
--
-- الهدف:
-- 1) تثبيت قاعدة: صف واحد فقط لكل (cafe_id, shift_kind, business_date)
-- 2) جعل فتح الوردية ذكيًا:
--    - ينشئ وردية جديدة إذا لم توجد
--    - يكمل على نفس الوردية إذا كانت مفتوحة
--    - يعيد متابعة نفس الوردية إذا أُغلقت بالخطأ ولم يبدأ الشيفت التالي
-- 3) حذف snapshot المؤقت عند استكمال وردية مغلقة بالخطأ
-- 4) العمل بشكل آمن حتى لو كان القيد الجديد موجودًا بالفعل
-- =========================================================

-- ---------------------------------------------------------
-- 1) إزالة القيد القديم إن كان موجودًا
-- ---------------------------------------------------------
alter table ops.shifts
  drop constraint if exists shifts_cafe_id_shift_kind_business_date_status_key;

-- ---------------------------------------------------------
-- 2) فحص آمن: لو توجد بيانات مكررة حاليًا لنفس اليوم/النوع/القهوة
--    نوقف المايجريشن برسالة واضحة بدل أي دمج خطر
-- ---------------------------------------------------------
do $$
begin
  if exists (
    select 1
    from ops.shifts
    group by cafe_id, shift_kind, business_date
    having count(*) > 1
  ) then
    raise exception 'duplicate_shift_rows_exist_for_same_cafe_kind_business_date';
  end if;
end $$;

-- ---------------------------------------------------------
-- 3) تثبيت القيد الجديد فقط إذا لم يكن موجودًا بالفعل
-- ---------------------------------------------------------
do $$
declare
  v_constraint_exists boolean;
  v_relkind "char";
begin
  select exists (
    select 1
    from pg_constraint
    where conrelid = 'ops.shifts'::regclass
      and conname = 'shifts_cafe_id_shift_kind_business_date_key'
  )
  into v_constraint_exists;

  if v_constraint_exists then
    raise notice 'constraint shifts_cafe_id_shift_kind_business_date_key already exists, skipping';
    return;
  end if;

  select c.relkind
  into v_relkind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'ops'
    and c.relname = 'shifts_cafe_id_shift_kind_business_date_key'
  limit 1;

  if v_relkind = 'i' then
    execute 'drop index if exists ops.shifts_cafe_id_shift_kind_business_date_key';
  elsif v_relkind is not null then
    raise exception 'relation shifts_cafe_id_shift_kind_business_date_key exists but is not an index';
  end if;

  execute $sql$
    alter table ops.shifts
      add constraint shifts_cafe_id_shift_kind_business_date_key
      unique (cafe_id, shift_kind, business_date)
      deferrable initially immediate
  $sql$;
end $$;

-- ---------------------------------------------------------
-- 4) لم نعد نحتاج reopen عام كدالة مستقلة
--    لو كانت موجودة من محاولة قديمة احذفها بهدوء
-- ---------------------------------------------------------
drop function if exists public.ops_reopen_shift(uuid, uuid, text);

-- ---------------------------------------------------------
-- 5) فتح الوردية الذكي
-- ---------------------------------------------------------
create or replace function public.ops_open_shift(
  p_cafe_id uuid,
  p_shift_kind text,
  p_business_date date,
  p_opened_by_owner_id uuid,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_same_shift_id uuid;
  v_same_shift_status text;
  v_any_open_shift_id uuid;
  v_has_next_shift boolean := false;
  v_new_shift_id uuid;
  v_current_rank integer;
begin
  if p_cafe_id is null then
    raise exception 'cafe_id_required';
  end if;

  if p_shift_kind not in ('morning', 'evening') then
    raise exception 'invalid_shift_kind';
  end if;

  if p_business_date is null then
    raise exception 'business_date_required';
  end if;

  if p_opened_by_owner_id is null then
    raise exception 'opened_by_owner_id_required';
  end if;

  v_current_rank :=
    case p_shift_kind
      when 'morning' then 1
      when 'evening' then 2
      else 99
    end;

  -- نفس الوردية لنفس اليوم/النوع
  select s.id, s.status
  into v_same_shift_id, v_same_shift_status
  from ops.shifts s
  where s.cafe_id = p_cafe_id
    and s.shift_kind = p_shift_kind
    and s.business_date = p_business_date
  limit 1;

  -- أي وردية مفتوحة حاليًا لهذا المقهى
  select s.id
  into v_any_open_shift_id
  from ops.shifts s
  where s.cafe_id = p_cafe_id
    and s.status = 'open'
  order by s.opened_at desc nulls last, s.id desc
  limit 1;

  -- الحالة 1: نفس الوردية مفتوحة بالفعل => كمل عليها
  if v_same_shift_id is not null and v_same_shift_status = 'open' then
    return jsonb_build_object(
      'shift_id', v_same_shift_id,
      'mode', 'resumed_open'
    );
  end if;

  -- الحالة 2: توجد وردية مفتوحة أخرى => ممنوع
  if v_any_open_shift_id is not null then
    raise exception 'another_shift_is_already_open';
  end if;

  -- الحالة 3: نفس الوردية موجودة ولكن مغلقة
  -- نسمح باستكمالها فقط إذا لم يبدأ بعدها الشيفت التالي
  if v_same_shift_id is not null and v_same_shift_status = 'closed' then
    select exists (
      select 1
      from ops.shifts s2
      where s2.cafe_id = p_cafe_id
        and s2.id <> v_same_shift_id
        and (
          s2.business_date > p_business_date
          or (
            s2.business_date = p_business_date
            and (
              case s2.shift_kind
                when 'morning' then 1
                when 'evening' then 2
                else 99
              end
            ) > v_current_rank
          )
        )
    )
    into v_has_next_shift;

    if v_has_next_shift then
      raise exception 'cannot_resume_shift_after_next_shift_started';
    end if;

    -- حذف snapshot السابق لهذه الوردية لأنها ستُستكمل ثم تُغلق لاحقًا نهائيًا
    if to_regclass('ops.shift_snapshots') is not null then
      execute 'delete from ops.shift_snapshots where shift_id = $1'
      using v_same_shift_id;
    elsif to_regclass('ops.shift_snapshot') is not null then
      execute 'delete from ops.shift_snapshot where shift_id = $1'
      using v_same_shift_id;
    end if;

    update ops.shifts
    set
      status = 'open',
      closed_at = null,
      closed_by_owner_id = null,
      notes = case
        when p_notes is null or btrim(p_notes) = '' then notes
        when notes is null or btrim(notes) = '' then p_notes
        else notes || E'\n' || p_notes
      end
    where id = v_same_shift_id;

    return jsonb_build_object(
      'shift_id', v_same_shift_id,
      'mode', 'resumed_closed'
    );
  end if;

  -- الحالة 4: لا توجد وردية لهذا اليوم/النوع => أنشئ واحدة جديدة
  insert into ops.shifts (
    cafe_id,
    shift_kind,
    business_date,
    status,
    opened_by_owner_id,
    notes
  ) values (
    p_cafe_id,
    p_shift_kind,
    p_business_date,
    'open',
    p_opened_by_owner_id,
    p_notes
  )
  returning id into v_new_shift_id;

  return jsonb_build_object(
    'shift_id', v_new_shift_id,
    'mode', 'created'
  );
end;
$$;

commit;
-- <<< 0014_shift_resume_latest_and_single_row.sql

-- >>> 0015_session_label.sql
create or replace function public.ops_open_or_resume_service_session(
  p_cafe_id uuid,
  p_shift_id uuid,
  p_session_label text default null,
  p_staff_member_id uuid default null,
  p_owner_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $function$
declare
  v_session_id uuid;
  v_requested_label text;
  v_existing_label text;
  v_norm_label text;
begin
  if p_cafe_id is null then
    raise exception 'cafe_id_required';
  end if;

  if p_shift_id is null then
    raise exception 'shift_id_required';
  end if;

  if (p_staff_member_id is null and p_owner_user_id is null)
     or (p_staff_member_id is not null and p_owner_user_id is not null) then
    raise exception 'exactly_one_actor_required';
  end if;

  v_requested_label := nullif(btrim(coalesce(p_session_label, '')), '');

  if v_requested_label is not null then
    v_norm_label := lower(v_requested_label);

    select s.id, s.session_label
    into v_session_id, v_existing_label
    from ops.service_sessions s
    where s.cafe_id = p_cafe_id
      and s.shift_id = p_shift_id
      and s.status = 'open'
      and lower(btrim(s.session_label)) = v_norm_label
    order by s.opened_at desc
    limit 1;

    if v_session_id is not null then
      return jsonb_build_object(
        'service_session_id', v_session_id,
        'session_label', v_existing_label,
        'reused', true
      );
    end if;
  end if;

  begin
    insert into ops.service_sessions (
      cafe_id,
      shift_id,
      session_label,
      status,
      opened_by_staff_id,
      opened_by_owner_id
    )
    values (
      p_cafe_id,
      p_shift_id,
      coalesce(v_requested_label, ops.generate_session_label()),
      'open',
      p_staff_member_id,
      p_owner_user_id
    )
    returning id, session_label into v_session_id, v_existing_label;
  exception
    when unique_violation then
      if v_requested_label is null then
        raise;
      end if;

      select s.id, s.session_label
      into v_session_id, v_existing_label
      from ops.service_sessions s
      where s.cafe_id = p_cafe_id
        and s.shift_id = p_shift_id
        and s.status = 'open'
        and lower(btrim(s.session_label)) = lower(v_requested_label)
      order by s.opened_at desc
      limit 1;

      if v_session_id is null then
        raise;
      end if;

      return jsonb_build_object(
        'service_session_id', v_session_id,
        'session_label', v_existing_label,
        'reused', true
      );
  end;

  return jsonb_build_object(
    'service_session_id', v_session_id,
    'session_label', v_existing_label,
    'reused', false
  );
end;
$function$;
-- <<< 0015_session_label.sql

-- >>> 0018_reconcile_multi_shisha_shift_roles.sql
begin;

set local search_path = public, ops;

-- =========================================================
-- 0018_reconcile_multi_shisha_shift_roles.sql
--
-- الهدف:
-- 1) إزالة فرض singleton عن دور الشيشة داخل نفس الوردية
-- 2) الإبقاء على singleton فقط للمشرف والباريستا
-- 3) إعادة تعريف public.ops_assign_shift_role بشكل canonical
--    حتى لا يعطل أي شيشة مان سابق عند تعيين شيشة مان جديد
-- =========================================================

-- ---------------------------------------------------------
-- 1) إزالة القيد القديم المتعارض ثم إعادة إنشائه بالحالة النهائية
-- ---------------------------------------------------------
drop index if exists ops.uq_shift_role_active_singleton;

create unique index if not exists uq_shift_role_active_singleton
  on ops.shift_role_assignments(cafe_id, shift_id, role_code)
  where is_active = true
    and role_code in ('supervisor', 'barista');

-- ---------------------------------------------------------
-- 2) إعادة تعريف تعيين الأدوار بحيث لا يبطل الشيشة الموجودين
-- ---------------------------------------------------------
create or replace function public.ops_assign_shift_role(
  p_cafe_id uuid,
  p_shift_id uuid,
  p_role_code text,
  p_staff_member_id uuid default null,
  p_owner_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_assignment_id uuid;
  v_existing_id uuid;
begin
  if p_cafe_id is null then
    raise exception 'cafe_id_required';
  end if;

  if p_shift_id is null then
    raise exception 'shift_id_required';
  end if;

  if p_role_code not in ('supervisor', 'waiter', 'barista', 'shisha') then
    raise exception 'invalid_role_code';
  end if;

  if (p_staff_member_id is null and p_owner_user_id is null)
     or (p_staff_member_id is not null and p_owner_user_id is not null) then
    raise exception 'exactly_one_actor_required';
  end if;

  select sra.id
  into v_existing_id
  from ops.shift_role_assignments sra
  where sra.cafe_id = p_cafe_id
    and sra.shift_id = p_shift_id
    and sra.role_code = p_role_code
    and sra.is_active = true
    and sra.staff_member_id is not distinct from p_staff_member_id
    and sra.owner_user_id is not distinct from p_owner_user_id
  limit 1;

  if v_existing_id is not null then
    return jsonb_build_object(
      'assignment_id', v_existing_id,
      'role_code', p_role_code,
      'reused', true
    );
  end if;

  if p_role_code in ('supervisor', 'barista') then
    update ops.shift_role_assignments
    set is_active = false
    where cafe_id = p_cafe_id
      and shift_id = p_shift_id
      and role_code = p_role_code
      and is_active = true;
  end if;

  insert into ops.shift_role_assignments (
    cafe_id,
    shift_id,
    role_code,
    staff_member_id,
    owner_user_id,
    is_active
  )
  values (
    p_cafe_id,
    p_shift_id,
    p_role_code,
    p_staff_member_id,
    p_owner_user_id,
    true
  )
  returning id into v_assignment_id;

  return jsonb_build_object(
    'assignment_id', v_assignment_id,
    'role_code', p_role_code,
    'reused', false
  );
end;
$$;

commit;
-- <<< 0018_reconcile_multi_shisha_shift_roles.sql

-- >>> 0019_split_general_complaints_from_item_issues.sql
begin;

alter table ops.complaints
  add column if not exists complaint_scope text not null default 'general';

alter table ops.complaints
  drop constraint if exists ck_complaints_scope;

alter table ops.complaints
  add constraint ck_complaints_scope
  check (complaint_scope in ('general', 'legacy_item_issue'));

alter table ops.complaints
  drop constraint if exists complaints_resolution_kind_check;

alter table ops.complaints
  add constraint complaints_resolution_kind_check
  check (
    resolution_kind is null
    or resolution_kind in ('remake', 'cancel_undelivered', 'waive_delivered', 'dismissed', 'resolved')
  );

create table if not exists ops.order_item_issues (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  shift_id uuid not null,
  service_session_id uuid not null,
  order_item_id uuid not null,
  source_complaint_id uuid,
  station_code text check (station_code in ('barista', 'shisha')),
  issue_kind text not null check (issue_kind in ('quality_issue', 'wrong_item', 'delay', 'billing_issue', 'other')),
  action_kind text not null check (action_kind in ('note', 'remake', 'cancel_undelivered', 'waive_delivered')),
  status text not null default 'logged' check (status in ('logged', 'applied', 'dismissed')),
  requested_quantity integer check (requested_quantity is null or requested_quantity > 0),
  resolved_quantity integer check (resolved_quantity is null or resolved_quantity > 0),
  notes text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_by_staff_id uuid,
  created_by_owner_id uuid,
  resolved_by_staff_id uuid,
  resolved_by_owner_id uuid,
  unique (cafe_id, id),
  unique (cafe_id, source_complaint_id),
  constraint fk_order_item_issues_shift
    foreign key (cafe_id, shift_id)
    references ops.shifts(cafe_id, id)
    on delete cascade,
  constraint fk_order_item_issues_session
    foreign key (cafe_id, service_session_id)
    references ops.service_sessions(cafe_id, id)
    on delete cascade,
  constraint fk_order_item_issues_item
    foreign key (cafe_id, order_item_id)
    references ops.order_items(cafe_id, id)
    on delete cascade,
  constraint fk_order_item_issues_source_complaint
    foreign key (cafe_id, source_complaint_id)
    references ops.complaints(cafe_id, id)
    on delete set null,
  constraint fk_order_item_issues_created_staff
    foreign key (cafe_id, created_by_staff_id)
    references ops.staff_members(cafe_id, id)
    on delete set null,
  constraint fk_order_item_issues_created_owner
    foreign key (cafe_id, created_by_owner_id)
    references ops.owner_users(cafe_id, id)
    on delete set null,
  constraint fk_order_item_issues_resolved_staff
    foreign key (cafe_id, resolved_by_staff_id)
    references ops.staff_members(cafe_id, id)
    on delete set null,
  constraint fk_order_item_issues_resolved_owner
    foreign key (cafe_id, resolved_by_owner_id)
    references ops.owner_users(cafe_id, id)
    on delete set null,
  constraint ck_order_item_issues_created_actor
    check (
      (created_by_staff_id is not null and created_by_owner_id is null)
      or
      (created_by_staff_id is null and created_by_owner_id is not null)
    ),
  constraint ck_order_item_issues_resolved_actor
    check (
      (resolved_by_staff_id is null and resolved_by_owner_id is null)
      or
      (resolved_by_staff_id is not null and resolved_by_owner_id is null)
      or
      (resolved_by_staff_id is null and resolved_by_owner_id is not null)
    )
);

create index if not exists idx_order_item_issues_shift_created_at
  on ops.order_item_issues(cafe_id, shift_id, created_at desc);

create index if not exists idx_order_item_issues_order_item
  on ops.order_item_issues(cafe_id, order_item_id, created_at desc);

alter table ops.order_item_issues enable row level security;
drop policy if exists cafe_access_policy on ops.order_item_issues;
create policy cafe_access_policy on ops.order_item_issues for all
  using (app.can_access_cafe(cafe_id))
  with check (app.can_access_cafe(cafe_id));

insert into ops.order_item_issues (
  cafe_id,
  shift_id,
  service_session_id,
  order_item_id,
  source_complaint_id,
  station_code,
  issue_kind,
  action_kind,
  status,
  requested_quantity,
  resolved_quantity,
  notes,
  created_at,
  resolved_at,
  created_by_staff_id,
  created_by_owner_id,
  resolved_by_staff_id,
  resolved_by_owner_id
)
select
  c.cafe_id,
  c.shift_id,
  c.service_session_id,
  c.order_item_id,
  c.id,
  c.station_code,
  c.complaint_kind,
  case
    when c.resolution_kind in ('remake', 'cancel_undelivered', 'waive_delivered') then c.resolution_kind
    else 'note'
  end,
  case
    when c.status = 'dismissed' then 'dismissed'
    when c.resolution_kind in ('remake', 'cancel_undelivered', 'waive_delivered') then 'applied'
    else 'logged'
  end,
  c.requested_quantity,
  c.resolved_quantity,
  c.notes,
  c.created_at,
  c.resolved_at,
  c.created_by_staff_id,
  c.created_by_owner_id,
  c.resolved_by_staff_id,
  c.resolved_by_owner_id
from ops.complaints c
where c.order_item_id is not null
  and not exists (
    select 1
    from ops.order_item_issues i
    where i.cafe_id = c.cafe_id
      and i.source_complaint_id = c.id
  );

update ops.complaints
set complaint_scope = 'legacy_item_issue'
where order_item_id is not null;

create or replace function public.ops_create_complaint(
  p_cafe_id uuid,
  p_service_session_id uuid default null,
  p_order_item_id uuid default null,
  p_complaint_kind text default 'other',
  p_requested_quantity integer default null,
  p_notes text default null,
  p_by_staff_id uuid default null,
  p_by_owner_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_session ops.service_sessions%rowtype;
  v_item ops.order_items%rowtype;
  v_complaint_id uuid;
  v_kind text;
  v_quantity integer;
begin
  v_kind := case
    when p_complaint_kind in ('quality_issue', 'wrong_item', 'delay', 'billing_issue', 'other') then p_complaint_kind
    else 'other'
  end;
  v_quantity := case when p_requested_quantity is null or p_requested_quantity <= 0 then null else p_requested_quantity end;

  if (p_by_staff_id is null and p_by_owner_id is null)
     or (p_by_staff_id is not null and p_by_owner_id is not null) then
    raise exception 'Exactly one actor is required';
  end if;

  if p_order_item_id is not null then
    select *
    into v_item
    from ops.order_items
    where cafe_id = p_cafe_id
      and id = p_order_item_id;

    if not found then
      raise exception 'order_item not found';
    end if;

    if p_service_session_id is not null and v_item.service_session_id <> p_service_session_id then
      raise exception 'order_item does not belong to service_session';
    end if;

    p_service_session_id := v_item.service_session_id;
  end if;

  if p_service_session_id is null then
    raise exception 'service_session_id is required';
  end if;

  select *
  into v_session
  from ops.service_sessions
  where cafe_id = p_cafe_id
    and id = p_service_session_id;

  if not found then
    raise exception 'service_session not found';
  end if;

  insert into ops.complaints (
    cafe_id,
    shift_id,
    service_session_id,
    order_item_id,
    station_code,
    complaint_scope,
    complaint_kind,
    status,
    requested_quantity,
    notes,
    created_by_staff_id,
    created_by_owner_id
  )
  values (
    p_cafe_id,
    v_session.shift_id,
    p_service_session_id,
    null,
    coalesce(v_item.station_code, null),
    'general',
    v_kind,
    'open',
    v_quantity,
    nullif(btrim(p_notes), ''),
    p_by_staff_id,
    p_by_owner_id
  )
  returning id into v_complaint_id;

  return jsonb_build_object(
    'ok', true,
    'complaint_id', v_complaint_id,
    'shift_id', v_session.shift_id,
    'service_session_id', p_service_session_id,
    'order_item_id', null,
    'status', 'open'
  );
end;
$$;

create or replace function public.ops_log_order_item_issue(
  p_cafe_id uuid,
  p_order_item_id uuid,
  p_service_session_id uuid default null,
  p_issue_kind text default 'other',
  p_action_kind text default 'note',
  p_requested_quantity integer default null,
  p_notes text default null,
  p_by_staff_id uuid default null,
  p_by_owner_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_item ops.order_items%rowtype;
  v_issue_id uuid;
  v_issue_kind text;
  v_action text;
  v_requested_quantity integer;
  v_resolved_quantity integer;
  v_status text := 'logged';
  v_result jsonb;
begin
  if p_order_item_id is null then
    raise exception 'p_order_item_id is required';
  end if;

  if (p_by_staff_id is null and p_by_owner_id is null)
     or (p_by_staff_id is not null and p_by_owner_id is not null) then
    raise exception 'Exactly one actor is required';
  end if;

  v_issue_kind := case
    when p_issue_kind in ('quality_issue', 'wrong_item', 'delay', 'billing_issue', 'other') then p_issue_kind
    else 'other'
  end;

  v_action := case
    when p_action_kind in ('note', 'remake', 'cancel_undelivered', 'waive_delivered') then p_action_kind
    else 'note'
  end;

  select *
  into v_item
  from ops.order_items
  where cafe_id = p_cafe_id
    and id = p_order_item_id
  for update;

  if not found then
    raise exception 'order_item not found';
  end if;

  if p_service_session_id is not null and v_item.service_session_id <> p_service_session_id then
    raise exception 'order_item does not belong to service_session';
  end if;

  p_service_session_id := v_item.service_session_id;
  v_requested_quantity := case when p_requested_quantity is null or p_requested_quantity <= 0 then null else p_requested_quantity end;

  if v_action <> 'note' then
    v_resolved_quantity := coalesce(v_requested_quantity, 1);

    if v_action = 'remake' then
      v_result := public.ops_request_remake(
        p_cafe_id,
        p_order_item_id,
        v_resolved_quantity,
        p_by_staff_id,
        p_by_owner_id,
        p_notes
      );
    elsif v_action = 'cancel_undelivered' then
      v_result := public.ops_cancel_undelivered_quantities(
        p_cafe_id,
        p_order_item_id,
        v_resolved_quantity,
        p_by_staff_id,
        p_by_owner_id,
        p_notes
      );
    elsif v_action = 'waive_delivered' then
      v_result := public.ops_waive_delivered_quantities(
        p_cafe_id,
        p_order_item_id,
        v_resolved_quantity,
        p_by_staff_id,
        p_by_owner_id,
        p_notes
      );
    end if;

    v_status := 'applied';
  end if;

  insert into ops.order_item_issues (
    cafe_id,
    shift_id,
    service_session_id,
    order_item_id,
    station_code,
    issue_kind,
    action_kind,
    status,
    requested_quantity,
    resolved_quantity,
    notes,
    created_by_staff_id,
    created_by_owner_id,
    resolved_at,
    resolved_by_staff_id,
    resolved_by_owner_id
  )
  values (
    p_cafe_id,
    v_item.shift_id,
    p_service_session_id,
    p_order_item_id,
    v_item.station_code,
    v_issue_kind,
    v_action,
    v_status,
    v_requested_quantity,
    v_resolved_quantity,
    nullif(btrim(p_notes), ''),
    p_by_staff_id,
    p_by_owner_id,
    case when v_status = 'applied' then now() else null end,
    case when v_status = 'applied' then p_by_staff_id else null end,
    case when v_status = 'applied' then p_by_owner_id else null end
  )
  returning id into v_issue_id;

  return jsonb_build_object(
    'ok', true,
    'item_issue_id', v_issue_id,
    'shift_id', v_item.shift_id,
    'service_session_id', p_service_session_id,
    'order_item_id', p_order_item_id,
    'action_kind', v_action,
    'status', v_status,
    'resolved_quantity', v_resolved_quantity,
    'operation', coalesce(v_result, '{}'::jsonb)
  );
end;
$$;

grant execute on function public.ops_log_order_item_issue(uuid, uuid, uuid, text, text, integer, text, uuid, uuid) to authenticated;

create or replace function public.ops_resolve_complaint(
  p_cafe_id uuid,
  p_complaint_id uuid,
  p_resolution_kind text,
  p_quantity integer default null,
  p_notes text default null,
  p_by_staff_id uuid default null,
  p_by_owner_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_complaint ops.complaints%rowtype;
  v_resolution text;
begin
  if (p_by_staff_id is null and p_by_owner_id is null)
     or (p_by_staff_id is not null and p_by_owner_id is not null) then
    raise exception 'Exactly one actor is required';
  end if;

  v_resolution := case
    when p_resolution_kind in ('resolved', 'dismissed') then p_resolution_kind
    else null
  end;

  if v_resolution is null then
    raise exception 'Invalid resolution kind';
  end if;

  select *
  into v_complaint
  from ops.complaints
  where cafe_id = p_cafe_id
    and id = p_complaint_id
    and complaint_scope = 'general'
  for update;

  if not found then
    raise exception 'complaint not found';
  end if;

  if v_complaint.status <> 'open' then
    raise exception 'complaint is already closed';
  end if;

  update ops.complaints
  set status = case when v_resolution = 'dismissed' then 'dismissed' else 'resolved' end,
      resolution_kind = v_resolution,
      resolved_quantity = null,
      resolved_at = now(),
      resolved_by_staff_id = p_by_staff_id,
      resolved_by_owner_id = p_by_owner_id,
      notes = case
        when nullif(btrim(p_notes), '') is null then notes
        when notes is null or btrim(notes) = '' then btrim(p_notes)
        else notes || E'\n' || btrim(p_notes)
      end
  where cafe_id = p_cafe_id
    and id = p_complaint_id;

  return jsonb_build_object(
    'ok', true,
    'complaint_id', v_complaint.id,
    'shift_id', v_complaint.shift_id,
    'service_session_id', v_complaint.service_session_id,
    'order_item_id', null,
    'resolution_kind', case when v_resolution = 'dismissed' then 'dismissed' else null end,
    'resolved_quantity', null,
    'operation', '{}'::jsonb
  );
end;
$$;

commit;
-- <<< 0019_split_general_complaints_from_item_issues.sql

-- >>> 0020_canonical_shift_snapshots_and_time_reports.sql
begin;

create or replace function public.ops_build_shift_snapshot(
  p_cafe_id uuid,
  p_shift_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_shift ops.shifts%rowtype;
  v_snapshot jsonb;
  v_totals jsonb;
  v_products jsonb;
  v_staff jsonb;
  v_sessions jsonb;
  v_complaints jsonb;
  v_item_issues jsonb;
begin
  select *
  into v_shift
  from ops.shifts
  where cafe_id = p_cafe_id
    and id = p_shift_id;

  if not found then
    raise exception 'shift not found';
  end if;

  with item_totals as (
    select
      coalesce(sum(oi.qty_submitted), 0) as submitted_qty,
      coalesce(sum(oi.qty_ready), 0) as ready_qty,
      coalesce(sum(oi.qty_delivered), 0) as delivered_qty,
      coalesce(sum(oi.qty_replacement_delivered), 0) as replacement_delivered_qty,
      coalesce(sum(oi.qty_paid), 0) as paid_qty,
      coalesce(sum(oi.qty_deferred), 0) as deferred_qty,
      coalesce(sum(oi.qty_remade), 0) as remade_qty,
      coalesce(sum(oi.qty_cancelled), 0) as cancelled_qty,
      coalesce(sum(oi.qty_waived), 0) as waived_qty,
      coalesce(sum(greatest(oi.qty_delivered - oi.qty_waived, 0) * oi.unit_price), 0)::numeric(12,2) as net_sales
    from ops.order_items oi
    where oi.cafe_id = p_cafe_id
      and oi.shift_id = p_shift_id
  ),
  payment_totals as (
    select
      coalesce(sum(case when p.payment_kind in ('cash', 'mixed') then p.total_amount else 0 end), 0)::numeric(12,2) as cash_total,
      coalesce(sum(case when p.payment_kind = 'deferred' then p.total_amount else 0 end), 0)::numeric(12,2) as deferred_total,
      coalesce(sum(case when p.payment_kind = 'repayment' then p.total_amount else 0 end), 0)::numeric(12,2) as repayment_total
    from ops.payments p
    where p.cafe_id = p_cafe_id
      and p.shift_id = p_shift_id
  ),
  complaint_totals as (
    select
      count(*)::integer as complaint_total,
      coalesce(sum(case when c.status = 'open' then 1 else 0 end), 0)::integer as complaint_open,
      coalesce(sum(case when c.status = 'resolved' then 1 else 0 end), 0)::integer as complaint_resolved,
      coalesce(sum(case when c.status = 'dismissed' then 1 else 0 end), 0)::integer as complaint_dismissed,
      coalesce(sum(case when c.resolution_kind = 'remake' then 1 else 0 end), 0)::integer as complaint_remake,
      coalesce(sum(case when c.resolution_kind = 'cancel_undelivered' then 1 else 0 end), 0)::integer as complaint_cancel,
      coalesce(sum(case when c.resolution_kind = 'waive_delivered' then 1 else 0 end), 0)::integer as complaint_waive
    from ops.complaints c
    where c.cafe_id = p_cafe_id
      and c.shift_id = p_shift_id
      and c.complaint_scope = 'general'
  ),
  item_issue_totals as (
    select
      count(*)::integer as item_issue_total,
      coalesce(sum(case when i.action_kind = 'note' then 1 else 0 end), 0)::integer as item_issue_note,
      coalesce(sum(case when i.action_kind = 'remake' then 1 else 0 end), 0)::integer as item_issue_remake,
      coalesce(sum(case when i.action_kind = 'cancel_undelivered' then 1 else 0 end), 0)::integer as item_issue_cancel,
      coalesce(sum(case when i.action_kind = 'waive_delivered' then 1 else 0 end), 0)::integer as item_issue_waive
    from ops.order_item_issues i
    where i.cafe_id = p_cafe_id
      and i.shift_id = p_shift_id
  )
  select jsonb_build_object(
    'submitted_qty', it.submitted_qty,
    'ready_qty', it.ready_qty,
    'delivered_qty', it.delivered_qty,
    'replacement_delivered_qty', it.replacement_delivered_qty,
    'paid_qty', it.paid_qty,
    'deferred_qty', it.deferred_qty,
    'remade_qty', it.remade_qty,
    'cancelled_qty', it.cancelled_qty,
    'waived_qty', it.waived_qty,
    'net_sales', it.net_sales,
    'cash_total', pt.cash_total,
    'deferred_total', pt.deferred_total,
    'repayment_total', pt.repayment_total,
    'complaint_total', ct.complaint_total,
    'complaint_open', ct.complaint_open,
    'complaint_resolved', ct.complaint_resolved,
    'complaint_dismissed', ct.complaint_dismissed,
    'complaint_remake', ct.complaint_remake,
    'complaint_cancel', ct.complaint_cancel,
    'complaint_waive', ct.complaint_waive,
    'item_issue_total', iit.item_issue_total,
    'item_issue_note', iit.item_issue_note,
    'item_issue_remake', iit.item_issue_remake,
    'item_issue_cancel', iit.item_issue_cancel,
    'item_issue_waive', iit.item_issue_waive
  )
  into v_totals
  from item_totals it
  cross join payment_totals pt
  cross join complaint_totals ct
  cross join item_issue_totals iit;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.product_name), '[]'::jsonb)
  into v_products
  from (
    select
      mp.id as product_id,
      mp.product_name,
      oi.station_code,
      sum(oi.qty_submitted) as qty_submitted,
      sum(oi.qty_ready) as qty_ready,
      sum(oi.qty_delivered) as qty_delivered,
      sum(oi.qty_replacement_delivered) as qty_replacement_delivered,
      sum(oi.qty_paid) as qty_paid,
      sum(oi.qty_deferred) as qty_deferred,
      sum(oi.qty_remade) as qty_remade,
      sum(oi.qty_cancelled) as qty_cancelled,
      sum(oi.qty_waived) as qty_waived,
      sum(oi.qty_delivered * oi.unit_price)::numeric(12,2) as gross_sales,
      sum(greatest(oi.qty_delivered - oi.qty_waived, 0) * oi.unit_price)::numeric(12,2) as net_sales
    from ops.order_items oi
    join ops.menu_products mp
      on mp.id = oi.menu_product_id
     and mp.cafe_id = oi.cafe_id
    where oi.cafe_id = p_cafe_id
      and oi.shift_id = p_shift_id
    group by mp.id, mp.product_name, oi.station_code
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.actor_label), '[]'::jsonb)
  into v_staff
  from (
    select
      actor_label,
      sum(submitted_qty) as submitted_qty,
      sum(ready_qty) as ready_qty,
      sum(delivered_qty) as delivered_qty,
      sum(replacement_delivered_qty) as replacement_delivered_qty,
      sum(remade_qty) as remade_qty,
      sum(cancelled_qty) as cancelled_qty,
      sum(waived_qty) as waived_qty,
      sum(payment_total)::numeric(12,2) as payment_total,
      sum(cash_sales)::numeric(12,2) as cash_sales,
      sum(deferred_sales)::numeric(12,2) as deferred_sales,
      sum(repayment_total)::numeric(12,2) as repayment_total,
      sum(complaint_count) as complaint_count,
      sum(item_issue_count) as item_issue_count
    from (
      select
        sm.full_name as actor_label,
        0::bigint as submitted_qty,
        0::bigint as ready_qty,
        0::bigint as delivered_qty,
        0::bigint as replacement_delivered_qty,
        0::bigint as remade_qty,
        0::bigint as cancelled_qty,
        0::bigint as waived_qty,
        coalesce(sum(p.total_amount), 0)::numeric(12,2) as payment_total,
        coalesce(sum(case when p.payment_kind in ('cash', 'mixed') then p.total_amount else 0 end), 0)::numeric(12,2) as cash_sales,
        coalesce(sum(case when p.payment_kind = 'deferred' then p.total_amount else 0 end), 0)::numeric(12,2) as deferred_sales,
        coalesce(sum(case when p.payment_kind = 'repayment' then p.total_amount else 0 end), 0)::numeric(12,2) as repayment_total,
        0::bigint as complaint_count,
        0::bigint as item_issue_count
      from ops.payments p
      join ops.staff_members sm
        on sm.id = p.by_staff_id
       and sm.cafe_id = p.cafe_id
      where p.cafe_id = p_cafe_id
        and p.shift_id = p_shift_id
      group by sm.full_name

      union all

      select
        ou.full_name as actor_label,
        0::bigint,
        0::bigint,
        0::bigint,
        0::bigint,
        0::bigint,
        0::bigint,
        0::bigint,
        coalesce(sum(p.total_amount), 0)::numeric(12,2),
        coalesce(sum(case when p.payment_kind in ('cash', 'mixed') then p.total_amount else 0 end), 0)::numeric(12,2),
        coalesce(sum(case when p.payment_kind = 'deferred' then p.total_amount else 0 end), 0)::numeric(12,2),
        coalesce(sum(case when p.payment_kind = 'repayment' then p.total_amount else 0 end), 0)::numeric(12,2),
        0::bigint,
        0::bigint
      from ops.payments p
      join ops.owner_users ou
        on ou.id = p.by_owner_id
       and ou.cafe_id = p.cafe_id
      where p.cafe_id = p_cafe_id
        and p.shift_id = p_shift_id
      group by ou.full_name

      union all

      select
        sm.full_name as actor_label,
        coalesce(sum(case when fe.event_code = 'submitted' then fe.quantity else 0 end), 0)::bigint,
        coalesce(sum(case when fe.event_code in ('partial_ready', 'ready') then fe.quantity else 0 end), 0)::bigint,
        coalesce(sum(case when fe.event_code = 'delivered' then fe.quantity else 0 end), 0)::bigint,
        coalesce(sum(case when fe.event_code = 'remake_delivered' then fe.quantity else 0 end), 0)::bigint,
        coalesce(sum(case when fe.event_code = 'remake_submitted' then fe.quantity else 0 end), 0)::bigint,
        coalesce(sum(case when fe.event_code = 'cancelled' then fe.quantity else 0 end), 0)::bigint,
        coalesce(sum(case when fe.event_code = 'waived' then fe.quantity else 0 end), 0)::bigint,
        0::numeric(12,2),
        0::numeric(12,2),
        0::numeric(12,2),
        0::numeric(12,2),
        0::bigint,
        0::bigint
      from ops.fulfillment_events fe
      join ops.staff_members sm
        on sm.id = fe.by_staff_id
       and sm.cafe_id = fe.cafe_id
      where fe.cafe_id = p_cafe_id
        and fe.shift_id = p_shift_id
      group by sm.full_name

      union all

      select
        ou.full_name as actor_label,
        coalesce(sum(case when fe.event_code = 'submitted' then fe.quantity else 0 end), 0)::bigint,
        coalesce(sum(case when fe.event_code in ('partial_ready', 'ready') then fe.quantity else 0 end), 0)::bigint,
        coalesce(sum(case when fe.event_code = 'delivered' then fe.quantity else 0 end), 0)::bigint,
        coalesce(sum(case when fe.event_code = 'remake_delivered' then fe.quantity else 0 end), 0)::bigint,
        coalesce(sum(case when fe.event_code = 'remake_submitted' then fe.quantity else 0 end), 0)::bigint,
        coalesce(sum(case when fe.event_code = 'cancelled' then fe.quantity else 0 end), 0)::bigint,
        coalesce(sum(case when fe.event_code = 'waived' then fe.quantity else 0 end), 0)::bigint,
        0::numeric(12,2),
        0::numeric(12,2),
        0::numeric(12,2),
        0::numeric(12,2),
        0::bigint,
        0::bigint
      from ops.fulfillment_events fe
      join ops.owner_users ou
        on ou.id = fe.by_owner_id
       and ou.cafe_id = fe.cafe_id
      where fe.cafe_id = p_cafe_id
        and fe.shift_id = p_shift_id
      group by ou.full_name

      union all

      select
        coalesce(sm.full_name, ou.full_name, 'unknown') as actor_label,
        0::bigint,
        0::bigint,
        0::bigint,
        0::bigint,
        0::bigint,
        0::bigint,
        0::bigint,
        0::numeric(12,2),
        0::numeric(12,2),
        0::numeric(12,2),
        0::numeric(12,2),
        count(*)::bigint,
        0::bigint
      from ops.complaints c
      left join ops.staff_members sm
        on sm.id = c.created_by_staff_id
       and sm.cafe_id = c.cafe_id
      left join ops.owner_users ou
        on ou.id = c.created_by_owner_id
       and ou.cafe_id = c.cafe_id
      where c.cafe_id = p_cafe_id
        and c.shift_id = p_shift_id
        and c.complaint_scope = 'general'
      group by coalesce(sm.full_name, ou.full_name, 'unknown')

      union all

      select
        coalesce(sm.full_name, ou.full_name, 'unknown') as actor_label,
        0::bigint,
        0::bigint,
        0::bigint,
        0::bigint,
        0::bigint,
        0::bigint,
        0::bigint,
        0::numeric(12,2),
        0::numeric(12,2),
        0::numeric(12,2),
        0::numeric(12,2),
        0::bigint,
        count(*)::bigint
      from ops.order_item_issues i
      left join ops.staff_members sm
        on sm.id = i.created_by_staff_id
       and sm.cafe_id = i.cafe_id
      left join ops.owner_users ou
        on ou.id = i.created_by_owner_id
       and ou.cafe_id = i.cafe_id
      where i.cafe_id = p_cafe_id
        and i.shift_id = p_shift_id
      group by coalesce(sm.full_name, ou.full_name, 'unknown')
    ) raw
    group by actor_label
  ) x;

  select jsonb_build_object(
    'open_sessions', coalesce(sum(case when status = 'open' then 1 else 0 end), 0),
    'closed_sessions', coalesce(sum(case when status = 'closed' then 1 else 0 end), 0),
    'total_sessions', count(*)
  )
  into v_sessions
  from ops.service_sessions
  where cafe_id = p_cafe_id
    and shift_id = p_shift_id;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
  into v_complaints
  from (
    select
      c.id,
      c.service_session_id,
      ss.session_label,
      c.complaint_kind,
      c.status,
      c.resolution_kind,
      c.requested_quantity,
      c.resolved_quantity,
      c.notes,
      c.created_at,
      c.resolved_at,
      coalesce(cs.full_name, co.full_name) as created_by_label,
      coalesce(rs.full_name, ro.full_name) as resolved_by_label
    from ops.complaints c
    join ops.service_sessions ss
      on ss.id = c.service_session_id
     and ss.cafe_id = c.cafe_id
    left join ops.staff_members cs
      on cs.id = c.created_by_staff_id
     and cs.cafe_id = c.cafe_id
    left join ops.owner_users co
      on co.id = c.created_by_owner_id
     and co.cafe_id = c.cafe_id
    left join ops.staff_members rs
      on rs.id = c.resolved_by_staff_id
     and rs.cafe_id = c.cafe_id
    left join ops.owner_users ro
      on ro.id = c.resolved_by_owner_id
     and ro.cafe_id = c.cafe_id
    where c.cafe_id = p_cafe_id
      and c.shift_id = p_shift_id
      and c.complaint_scope = 'general'
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
  into v_item_issues
  from (
    select
      i.id,
      i.order_item_id,
      i.service_session_id,
      ss.session_label,
      mp.product_name,
      i.issue_kind,
      i.action_kind,
      i.status,
      i.requested_quantity,
      i.resolved_quantity,
      i.notes,
      i.created_at,
      i.resolved_at,
      coalesce(cs.full_name, co.full_name) as created_by_label,
      coalesce(rs.full_name, ro.full_name) as resolved_by_label
    from ops.order_item_issues i
    join ops.service_sessions ss
      on ss.id = i.service_session_id
     and ss.cafe_id = i.cafe_id
    join ops.order_items oi
      on oi.id = i.order_item_id
     and oi.cafe_id = i.cafe_id
    join ops.menu_products mp
      on mp.id = oi.menu_product_id
     and mp.cafe_id = oi.cafe_id
    left join ops.staff_members cs
      on cs.id = i.created_by_staff_id
     and cs.cafe_id = i.cafe_id
    left join ops.owner_users co
      on co.id = i.created_by_owner_id
     and co.cafe_id = i.cafe_id
    left join ops.staff_members rs
      on rs.id = i.resolved_by_staff_id
     and rs.cafe_id = i.cafe_id
    left join ops.owner_users ro
      on ro.id = i.resolved_by_owner_id
     and ro.cafe_id = i.cafe_id
    where i.cafe_id = p_cafe_id
      and i.shift_id = p_shift_id
  ) x;

  v_snapshot := jsonb_build_object(
    'version', 2,
    'shift', jsonb_build_object(
      'shift_id', v_shift.id,
      'shift_kind', v_shift.shift_kind,
      'business_date', v_shift.business_date,
      'status', v_shift.status,
      'opened_at', v_shift.opened_at,
      'closed_at', v_shift.closed_at
    ),
    'totals', coalesce(v_totals, '{}'::jsonb),
    'sessions', coalesce(v_sessions, '{}'::jsonb),
    'products', coalesce(v_products, '[]'::jsonb),
    'staff', coalesce(v_staff, '[]'::jsonb),
    'complaints', coalesce(v_complaints, '[]'::jsonb),
    'item_issues', coalesce(v_item_issues, '[]'::jsonb)
  );

  insert into ops.shift_snapshots (
    cafe_id,
    shift_id,
    snapshot_json
  )
  values (
    p_cafe_id,
    p_shift_id,
    v_snapshot
  )
  on conflict (cafe_id, shift_id)
  do update set snapshot_json = excluded.snapshot_json,
                created_at = now();

  return v_snapshot;
end;
$$;

commit;
-- <<< 0020_canonical_shift_snapshots_and_time_reports.sql

-- >>> 0024_staff_employment_status_lifecycle.sql
begin;

set local search_path = public, ops;

alter table ops.staff_members
  add column if not exists employment_status text;

update ops.staff_members
set employment_status = case when is_active then 'active' else 'inactive' end
where employment_status is null
   or btrim(employment_status) = '';

alter table ops.staff_members
  drop constraint if exists ck_staff_members_employment_status;

alter table ops.staff_members
  add constraint ck_staff_members_employment_status
  check (employment_status in ('active', 'inactive', 'left'));

alter table ops.staff_members
  alter column employment_status set default 'active';

alter table ops.staff_members
  alter column employment_status set not null;

update ops.staff_members
set is_active = (employment_status = 'active')
where is_active is distinct from (employment_status = 'active');

create or replace function public.ops_create_staff_member_v2(
  p_cafe_id uuid,
  p_full_name text,
  p_pin text,
  p_employee_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_staff_id uuid;
  v_employee_code text;
begin
  if p_cafe_id is null then
    raise exception 'cafe_id_required';
  end if;

  if coalesce(trim(p_full_name), '') = '' then
    raise exception 'full_name_required';
  end if;

  if coalesce(trim(p_pin), '') = '' then
    raise exception 'pin_required';
  end if;

  v_employee_code := nullif(lower(btrim(p_employee_code)), '');

  insert into ops.staff_members (
    cafe_id,
    full_name,
    pin_hash,
    employee_code,
    is_active,
    employment_status
  )
  values (
    p_cafe_id,
    trim(p_full_name),
    extensions.crypt(p_pin, extensions.gen_salt('bf')),
    v_employee_code,
    true,
    'active'
  )
  returning id into v_staff_id;

  return jsonb_build_object(
    'staff_member_id', v_staff_id,
    'employee_code', v_employee_code,
    'employment_status', 'active'
  );
end;
$$;

create or replace function public.ops_set_staff_member_status(
  p_cafe_id uuid,
  p_staff_member_id uuid,
  p_employment_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_normalized_status text;
  v_is_active boolean;
begin
  if p_cafe_id is null then
    raise exception 'cafe_id_required';
  end if;

  if p_staff_member_id is null then
    raise exception 'staff_member_id_required';
  end if;

  v_normalized_status := lower(btrim(coalesce(p_employment_status, '')));
  if v_normalized_status not in ('active', 'inactive', 'left') then
    raise exception 'invalid_employment_status';
  end if;

  v_is_active := v_normalized_status = 'active';

  update ops.staff_members
  set employment_status = v_normalized_status,
      is_active = v_is_active
  where cafe_id = p_cafe_id
    and id = p_staff_member_id;

  if not found then
    raise exception 'staff_member_not_found';
  end if;

  return jsonb_build_object(
    'staff_member_id', p_staff_member_id,
    'employment_status', v_normalized_status,
    'is_active', v_is_active
  );
end;
$$;

create or replace function public.ops_set_staff_member_active(
  p_cafe_id uuid,
  p_staff_member_id uuid,
  p_is_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
begin
  return public.ops_set_staff_member_status(
    p_cafe_id,
    p_staff_member_id,
    case when coalesce(p_is_active, false) then 'active' else 'inactive' end
  );
end;
$$;

create or replace function public.ops_verify_staff_pin_login(
  p_slug text,
  p_identifier text,
  p_pin text
)
returns table (
  cafe_id uuid,
  cafe_slug text,
  staff_member_id uuid,
  full_name text,
  employee_code text,
  shift_id uuid,
  shift_role text,
  login_state text
)
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_cafe_id uuid;
  v_cafe_slug text;
  v_staff ops.staff_members%rowtype;
  v_shift_id uuid;
  v_shift_role text;
begin
  select c.id, c.slug
  into v_cafe_id, v_cafe_slug
  from ops.cafes c
  where lower(btrim(c.slug)) = lower(btrim(p_slug))
    and c.is_active = true
  limit 1;

  if v_cafe_id is null then
    return;
  end if;

  select sm.*
  into v_staff
  from ops.staff_members sm
  where sm.cafe_id = v_cafe_id
    and sm.is_active = true
    and sm.employment_status = 'active'
    and (
      lower(btrim(sm.full_name)) = lower(btrim(p_identifier))
      or lower(btrim(coalesce(sm.employee_code, ''))) = lower(btrim(p_identifier))
    )
    and extensions.crypt(p_pin, sm.pin_hash) = sm.pin_hash
  limit 1;

  if v_staff.id is null then
    return;
  end if;

  select s.id
  into v_shift_id
  from ops.shifts s
  where s.cafe_id = v_cafe_id
    and s.status = 'open'
  order by s.opened_at desc
  limit 1;

  if v_shift_id is null then
    return query
    select v_cafe_id, v_cafe_slug, v_staff.id, v_staff.full_name, v_staff.employee_code, null::uuid, null::text, 'no_shift'::text;
    return;
  end if;

  select sra.role_code
  into v_shift_role
  from ops.shift_role_assignments sra
  where sra.cafe_id = v_cafe_id
    and sra.shift_id = v_shift_id
    and sra.staff_member_id = v_staff.id
    and sra.is_active = true
  order by sra.assigned_at desc
  limit 1;

  if v_shift_role is null then
    return query
    select v_cafe_id, v_cafe_slug, v_staff.id, v_staff.full_name, v_staff.employee_code, v_shift_id, null::text, 'not_assigned'::text;
    return;
  end if;

  return query
  select v_cafe_id, v_cafe_slug, v_staff.id, v_staff.full_name, v_staff.employee_code, v_shift_id, v_shift_role, 'ok'::text;
end;
$$;

create or replace function public.ops_assign_shift_role(
  p_cafe_id uuid,
  p_shift_id uuid,
  p_role_code text,
  p_staff_member_id uuid default null,
  p_owner_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_assignment_id uuid;
  v_existing_id uuid;
  v_staff_is_active boolean;
begin
  if p_cafe_id is null then
    raise exception 'cafe_id_required';
  end if;

  if p_shift_id is null then
    raise exception 'shift_id_required';
  end if;

  if p_role_code not in ('supervisor', 'waiter', 'barista', 'shisha') then
    raise exception 'invalid_role_code';
  end if;

  if (p_staff_member_id is null and p_owner_user_id is null)
     or (p_staff_member_id is not null and p_owner_user_id is not null) then
    raise exception 'exactly_one_actor_required';
  end if;

  if p_staff_member_id is not null then
    select exists (
      select 1
      from ops.staff_members sm
      where sm.cafe_id = p_cafe_id
        and sm.id = p_staff_member_id
        and sm.is_active = true
        and sm.employment_status = 'active'
    ) into v_staff_is_active;

    if not coalesce(v_staff_is_active, false) then
      raise exception 'staff_member_not_active';
    end if;
  end if;

  select sra.id
  into v_existing_id
  from ops.shift_role_assignments sra
  where sra.cafe_id = p_cafe_id
    and sra.shift_id = p_shift_id
    and sra.role_code = p_role_code
    and sra.is_active = true
    and sra.staff_member_id is not distinct from p_staff_member_id
    and sra.owner_user_id is not distinct from p_owner_user_id
  limit 1;

  if v_existing_id is not null then
    return jsonb_build_object(
      'assignment_id', v_existing_id,
      'role_code', p_role_code,
      'reused', true
    );
  end if;

  if p_role_code in ('supervisor', 'barista') then
    update ops.shift_role_assignments
    set is_active = false
    where cafe_id = p_cafe_id
      and shift_id = p_shift_id
      and role_code = p_role_code
      and is_active = true;
  end if;

  insert into ops.shift_role_assignments (
    cafe_id,
    shift_id,
    role_code,
    staff_member_id,
    owner_user_id,
    is_active
  )
  values (
    p_cafe_id,
    p_shift_id,
    p_role_code,
    p_staff_member_id,
    p_owner_user_id,
    true
  )
  returning id into v_assignment_id;

  return jsonb_build_object(
    'assignment_id', v_assignment_id,
    'role_code', p_role_code,
    'reused', false
  );
end;
$$;

commit;
-- <<< 0024_staff_employment_status_lifecycle.sql

-- >>> 0025_ops_idempotency_for_sensitive_mutations.sql
begin;

set local search_path = public, ops;

create table if not exists ops.idempotency_keys (
  id bigint generated always as identity primary key,
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  idempotency_key text not null,
  action_name text not null,
  request_hash text not null,
  actor_runtime_user_id text not null,
  actor_owner_id uuid null,
  actor_staff_id uuid null,
  status text not null default 'pending',
  response_status integer null,
  response_body jsonb null,
  created_at timestamptz not null default now(),
  completed_at timestamptz null,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  constraint ck_idempotency_keys_status check (status in ('pending', 'completed')),
  constraint uq_idempotency_keys_cafe_key unique (cafe_id, idempotency_key)
);

create index if not exists idx_idempotency_keys_cafe_created_at
  on ops.idempotency_keys (cafe_id, created_at desc);

create index if not exists idx_idempotency_keys_expires_at
  on ops.idempotency_keys (expires_at);

create index if not exists idx_idempotency_keys_status
  on ops.idempotency_keys (status, created_at desc);

commit;
-- <<< 0025_ops_idempotency_for_sensitive_mutations.sql

-- >>> 0027_weekly_archiving_rollups.sql
begin;

create schema if not exists archive;

alter table ops.shifts
  add column if not exists detail_archived_at timestamptz;

create table if not exists ops.daily_snapshots (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  business_date date not null,
  snapshot_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cafe_id, business_date)
);

create index if not exists idx_daily_snapshots_cafe_date
  on ops.daily_snapshots(cafe_id, business_date desc);

create table if not exists ops.weekly_summaries (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  week_start_date date not null,
  week_end_date date not null,
  summary_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cafe_id, week_start_date),
  constraint ck_weekly_summaries_range check (week_end_date = week_start_date + 6)
);

create index if not exists idx_weekly_summaries_cafe_week
  on ops.weekly_summaries(cafe_id, week_start_date desc);

create table if not exists archive.service_sessions (like ops.service_sessions including defaults);
create table if not exists archive.orders (like ops.orders including defaults);
create table if not exists archive.order_items (like ops.order_items including defaults);
create table if not exists archive.fulfillment_events (like ops.fulfillment_events including defaults);
create table if not exists archive.payments (like ops.payments including defaults);
create table if not exists archive.payment_allocations (like ops.payment_allocations including defaults);
create table if not exists archive.complaints (like ops.complaints including defaults);
create table if not exists archive.order_item_issues (like ops.order_item_issues including defaults);
create table if not exists archive.audit_events (like ops.audit_events including defaults);

alter table archive.service_sessions add column if not exists archived_at timestamptz not null default now();
alter table archive.service_sessions add column if not exists archived_business_date date;
alter table archive.orders add column if not exists archived_at timestamptz not null default now();
alter table archive.orders add column if not exists archived_business_date date;
alter table archive.order_items add column if not exists archived_at timestamptz not null default now();
alter table archive.order_items add column if not exists archived_business_date date;
alter table archive.fulfillment_events add column if not exists archived_at timestamptz not null default now();
alter table archive.fulfillment_events add column if not exists archived_business_date date;
alter table archive.payments add column if not exists archived_at timestamptz not null default now();
alter table archive.payments add column if not exists archived_business_date date;
alter table archive.payment_allocations add column if not exists archived_at timestamptz not null default now();
alter table archive.payment_allocations add column if not exists archived_business_date date;
alter table archive.complaints add column if not exists archived_at timestamptz not null default now();
alter table archive.complaints add column if not exists archived_business_date date;
alter table archive.order_item_issues add column if not exists archived_at timestamptz not null default now();
alter table archive.order_item_issues add column if not exists archived_business_date date;
alter table archive.audit_events add column if not exists archived_at timestamptz not null default now();
alter table archive.audit_events add column if not exists archived_business_date date;

create unique index if not exists idx_archive_service_sessions_key on archive.service_sessions(cafe_id, id);
create unique index if not exists idx_archive_orders_key on archive.orders(cafe_id, id);
create unique index if not exists idx_archive_order_items_key on archive.order_items(cafe_id, id);
create unique index if not exists idx_archive_fulfillment_events_key on archive.fulfillment_events(cafe_id, id);
create unique index if not exists idx_archive_payments_key on archive.payments(cafe_id, id);
create unique index if not exists idx_archive_payment_allocations_key on archive.payment_allocations(cafe_id, id);
create unique index if not exists idx_archive_complaints_key on archive.complaints(cafe_id, id);
create unique index if not exists idx_archive_order_item_issues_key on archive.order_item_issues(cafe_id, id);
create unique index if not exists idx_archive_audit_events_key on archive.audit_events(cafe_id, id);

create index if not exists idx_archive_service_sessions_cafe_date on archive.service_sessions(cafe_id, archived_business_date desc, closed_at desc nulls last);
create index if not exists idx_archive_orders_cafe_date on archive.orders(cafe_id, archived_business_date desc, created_at desc);
create index if not exists idx_archive_order_items_cafe_date on archive.order_items(cafe_id, archived_business_date desc, created_at desc);
create index if not exists idx_archive_fulfillment_events_cafe_date on archive.fulfillment_events(cafe_id, archived_business_date desc, created_at desc);
create index if not exists idx_archive_payments_cafe_date on archive.payments(cafe_id, archived_business_date desc, created_at desc);
create index if not exists idx_archive_payment_allocations_cafe_date on archive.payment_allocations(cafe_id, archived_business_date desc, created_at desc);
create index if not exists idx_archive_complaints_cafe_date on archive.complaints(cafe_id, archived_business_date desc, created_at desc);
create index if not exists idx_archive_order_item_issues_cafe_date on archive.order_item_issues(cafe_id, archived_business_date desc, created_at desc);
create index if not exists idx_archive_audit_events_cafe_date on archive.audit_events(cafe_id, archived_business_date desc, created_at desc);

create or replace function public.ops_refresh_daily_snapshot(
  p_cafe_id uuid,
  p_business_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_snapshot jsonb;
begin
  with source as (
    select
      s.id as shift_id,
      s.shift_kind,
      s.business_date,
      s.opened_at,
      s.closed_at,
      ss.snapshot_json
    from ops.shifts s
    join ops.shift_snapshots ss
      on ss.cafe_id = s.cafe_id
     and ss.shift_id = s.id
    where s.cafe_id = p_cafe_id
      and s.business_date = p_business_date
      and s.status = 'closed'
  ),
  counts as (
    select count(*)::int as shift_count from source
  ),
  totals as (
    select
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'submitted_qty')::numeric, 0)), 0) as submitted_qty,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'ready_qty')::numeric, 0)), 0) as ready_qty,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'delivered_qty')::numeric, 0)), 0) as delivered_qty,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'replacement_delivered_qty')::numeric, 0)), 0) as replacement_delivered_qty,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'paid_qty')::numeric, 0)), 0) as paid_qty,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'deferred_qty')::numeric, 0)), 0) as deferred_qty,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'remade_qty')::numeric, 0)), 0) as remade_qty,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'cancelled_qty')::numeric, 0)), 0) as cancelled_qty,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'waived_qty')::numeric, 0)), 0) as waived_qty,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'net_sales')::numeric, 0)), 0)::numeric(12,2) as net_sales,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'cash_total')::numeric, 0)), 0)::numeric(12,2) as cash_total,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'deferred_total')::numeric, 0)), 0)::numeric(12,2) as deferred_total,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'repayment_total')::numeric, 0)), 0)::numeric(12,2) as repayment_total,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'complaint_total')::numeric, 0)), 0) as complaint_total,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'complaint_open')::numeric, 0)), 0) as complaint_open,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'complaint_resolved')::numeric, 0)), 0) as complaint_resolved,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'complaint_dismissed')::numeric, 0)), 0) as complaint_dismissed,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'complaint_remake')::numeric, 0)), 0) as complaint_remake,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'complaint_cancel')::numeric, 0)), 0) as complaint_cancel,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'complaint_waive')::numeric, 0)), 0) as complaint_waive,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'item_issue_total')::numeric, 0)), 0) as item_issue_total,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'item_issue_note')::numeric, 0)), 0) as item_issue_note,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'item_issue_remake')::numeric, 0)), 0) as item_issue_remake,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'item_issue_cancel')::numeric, 0)), 0) as item_issue_cancel,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'item_issue_waive')::numeric, 0)), 0) as item_issue_waive,
      coalesce(sum(coalesce((snapshot_json -> 'sessions' ->> 'open_sessions')::numeric, 0)), 0) as open_sessions,
      coalesce(sum(coalesce((snapshot_json -> 'sessions' ->> 'closed_sessions')::numeric, 0)), 0) as closed_sessions,
      coalesce(sum(coalesce((snapshot_json -> 'sessions' ->> 'total_sessions')::numeric, 0)), 0) as total_sessions,
      bool_or(shift_kind = 'morning') as has_morning_shift,
      bool_or(shift_kind = 'evening') as has_evening_shift
    from source
  ),
  products as (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.product_name, x.station_code), '[]'::jsonb) as value
    from (
      select
        prod ->> 'product_id' as product_id,
        prod ->> 'product_name' as product_name,
        prod ->> 'station_code' as station_code,
        sum(coalesce((prod ->> 'qty_submitted')::numeric, 0))::bigint as qty_submitted,
        sum(coalesce((prod ->> 'qty_ready')::numeric, 0))::bigint as qty_ready,
        sum(coalesce((prod ->> 'qty_delivered')::numeric, 0))::bigint as qty_delivered,
        sum(coalesce((prod ->> 'qty_replacement_delivered')::numeric, 0))::bigint as qty_replacement_delivered,
        sum(coalesce((prod ->> 'qty_paid')::numeric, 0))::bigint as qty_paid,
        sum(coalesce((prod ->> 'qty_deferred')::numeric, 0))::bigint as qty_deferred,
        sum(coalesce((prod ->> 'qty_remade')::numeric, 0))::bigint as qty_remade,
        sum(coalesce((prod ->> 'qty_cancelled')::numeric, 0))::bigint as qty_cancelled,
        sum(coalesce((prod ->> 'qty_waived')::numeric, 0))::bigint as qty_waived,
        sum(coalesce((prod ->> 'gross_sales')::numeric, 0))::numeric(12,2) as gross_sales,
        sum(coalesce((prod ->> 'net_sales')::numeric, 0))::numeric(12,2) as net_sales
      from source,
      lateral jsonb_array_elements(coalesce(source.snapshot_json -> 'products', '[]'::jsonb)) as prod
      group by prod ->> 'product_id', prod ->> 'product_name', prod ->> 'station_code'
    ) x
  ),
  staff as (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.actor_label), '[]'::jsonb) as value
    from (
      select
        perf ->> 'actor_label' as actor_label,
        sum(coalesce((perf ->> 'submitted_qty')::numeric, 0))::bigint as submitted_qty,
        sum(coalesce((perf ->> 'ready_qty')::numeric, 0))::bigint as ready_qty,
        sum(coalesce((perf ->> 'delivered_qty')::numeric, 0))::bigint as delivered_qty,
        sum(coalesce((perf ->> 'replacement_delivered_qty')::numeric, 0))::bigint as replacement_delivered_qty,
        sum(coalesce((perf ->> 'remade_qty')::numeric, 0))::bigint as remade_qty,
        sum(coalesce((perf ->> 'cancelled_qty')::numeric, 0))::bigint as cancelled_qty,
        sum(coalesce((perf ->> 'waived_qty')::numeric, 0))::bigint as waived_qty,
        sum(coalesce((perf ->> 'payment_total')::numeric, 0))::numeric(12,2) as payment_total,
        sum(coalesce((perf ->> 'cash_sales')::numeric, 0))::numeric(12,2) as cash_sales,
        sum(coalesce((perf ->> 'deferred_sales')::numeric, 0))::numeric(12,2) as deferred_sales,
        sum(coalesce((perf ->> 'repayment_total')::numeric, 0))::numeric(12,2) as repayment_total,
        sum(coalesce((perf ->> 'complaint_count')::numeric, 0))::bigint as complaint_count,
        sum(coalesce((perf ->> 'item_issue_count')::numeric, 0))::bigint as item_issue_count
      from source,
      lateral jsonb_array_elements(coalesce(source.snapshot_json -> 'staff', '[]'::jsonb)) as perf
      group by perf ->> 'actor_label'
    ) x
  ),
  shift_refs as (
    select
      coalesce(jsonb_agg(shift_id order by shift_kind, shift_id), '[]'::jsonb) as shift_ids,
      min(opened_at) as first_opened_at,
      max(closed_at) as last_closed_at
    from source
  )
  select case
    when (select shift_count from counts) = 0 then null
    else jsonb_build_object(
      'version', 1,
      'business_date', p_business_date,
      'summary', jsonb_build_object(
        'shift_count', (select shift_count from counts),
        'has_morning_shift', coalesce((select has_morning_shift from totals), false),
        'has_evening_shift', coalesce((select has_evening_shift from totals), false),
        'submitted_qty', coalesce((select submitted_qty from totals), 0),
        'ready_qty', coalesce((select ready_qty from totals), 0),
        'delivered_qty', coalesce((select delivered_qty from totals), 0),
        'replacement_delivered_qty', coalesce((select replacement_delivered_qty from totals), 0),
        'paid_qty', coalesce((select paid_qty from totals), 0),
        'deferred_qty', coalesce((select deferred_qty from totals), 0),
        'remade_qty', coalesce((select remade_qty from totals), 0),
        'cancelled_qty', coalesce((select cancelled_qty from totals), 0),
        'waived_qty', coalesce((select waived_qty from totals), 0),
        'net_sales', coalesce((select net_sales from totals), 0),
        'cash_total', coalesce((select cash_total from totals), 0),
        'deferred_total', coalesce((select deferred_total from totals), 0),
        'repayment_total', coalesce((select repayment_total from totals), 0),
        'complaint_total', coalesce((select complaint_total from totals), 0),
        'complaint_open', coalesce((select complaint_open from totals), 0),
        'complaint_resolved', coalesce((select complaint_resolved from totals), 0),
        'complaint_dismissed', coalesce((select complaint_dismissed from totals), 0),
        'complaint_remake', coalesce((select complaint_remake from totals), 0),
        'complaint_cancel', coalesce((select complaint_cancel from totals), 0),
        'complaint_waive', coalesce((select complaint_waive from totals), 0),
        'item_issue_total', coalesce((select item_issue_total from totals), 0),
        'item_issue_note', coalesce((select item_issue_note from totals), 0),
        'item_issue_remake', coalesce((select item_issue_remake from totals), 0),
        'item_issue_cancel', coalesce((select item_issue_cancel from totals), 0),
        'item_issue_waive', coalesce((select item_issue_waive from totals), 0),
        'open_sessions', coalesce((select open_sessions from totals), 0),
        'closed_sessions', coalesce((select closed_sessions from totals), 0),
        'total_sessions', coalesce((select total_sessions from totals), 0)
      ),
      'products', coalesce((select value from products), '[]'::jsonb),
      'staff', coalesce((select value from staff), '[]'::jsonb),
      'source_shift_ids', coalesce((select shift_ids from shift_refs), '[]'::jsonb),
      'first_opened_at', (select first_opened_at from shift_refs),
      'last_closed_at', (select last_closed_at from shift_refs)
    )
  end
  into v_snapshot;

  if v_snapshot is null then
    delete from ops.daily_snapshots
    where cafe_id = p_cafe_id
      and business_date = p_business_date;

    return jsonb_build_object(
      'ok', true,
      'deleted', true,
      'business_date', p_business_date
    );
  end if;

  insert into ops.daily_snapshots (
    cafe_id,
    business_date,
    snapshot_json,
    updated_at
  )
  values (
    p_cafe_id,
    p_business_date,
    v_snapshot,
    now()
  )
  on conflict (cafe_id, business_date)
  do update set snapshot_json = excluded.snapshot_json,
                updated_at = now();

  return v_snapshot;
end;
$$;

create or replace function public.ops_refresh_weekly_summary(
  p_cafe_id uuid,
  p_week_start_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_week_start date := date_trunc('week', p_week_start_date::timestamp)::date;
  v_week_end date := (date_trunc('week', p_week_start_date::timestamp)::date + 6);
  v_summary jsonb;
begin
  with source as (
    select
      business_date,
      snapshot_json
    from ops.daily_snapshots
    where cafe_id = p_cafe_id
      and business_date between v_week_start and v_week_end
  ),
  counts as (
    select count(*)::int as day_count from source
  ),
  totals as (
    select
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'shift_count')::numeric, 0)), 0) as shift_count,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'submitted_qty')::numeric, 0)), 0) as submitted_qty,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'ready_qty')::numeric, 0)), 0) as ready_qty,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'delivered_qty')::numeric, 0)), 0) as delivered_qty,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'replacement_delivered_qty')::numeric, 0)), 0) as replacement_delivered_qty,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'paid_qty')::numeric, 0)), 0) as paid_qty,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'deferred_qty')::numeric, 0)), 0) as deferred_qty,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'remade_qty')::numeric, 0)), 0) as remade_qty,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'cancelled_qty')::numeric, 0)), 0) as cancelled_qty,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'waived_qty')::numeric, 0)), 0) as waived_qty,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'net_sales')::numeric, 0)), 0)::numeric(12,2) as net_sales,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'cash_total')::numeric, 0)), 0)::numeric(12,2) as cash_total,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'deferred_total')::numeric, 0)), 0)::numeric(12,2) as deferred_total,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'repayment_total')::numeric, 0)), 0)::numeric(12,2) as repayment_total,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'complaint_total')::numeric, 0)), 0) as complaint_total,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'complaint_open')::numeric, 0)), 0) as complaint_open,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'complaint_resolved')::numeric, 0)), 0) as complaint_resolved,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'complaint_dismissed')::numeric, 0)), 0) as complaint_dismissed,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'complaint_remake')::numeric, 0)), 0) as complaint_remake,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'complaint_cancel')::numeric, 0)), 0) as complaint_cancel,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'complaint_waive')::numeric, 0)), 0) as complaint_waive,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'item_issue_total')::numeric, 0)), 0) as item_issue_total,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'item_issue_note')::numeric, 0)), 0) as item_issue_note,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'item_issue_remake')::numeric, 0)), 0) as item_issue_remake,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'item_issue_cancel')::numeric, 0)), 0) as item_issue_cancel,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'item_issue_waive')::numeric, 0)), 0) as item_issue_waive,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'open_sessions')::numeric, 0)), 0) as open_sessions,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'closed_sessions')::numeric, 0)), 0) as closed_sessions,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'total_sessions')::numeric, 0)), 0) as total_sessions
    from source
  ),
  products as (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.product_name, x.station_code), '[]'::jsonb) as value
    from (
      select
        prod ->> 'product_id' as product_id,
        prod ->> 'product_name' as product_name,
        prod ->> 'station_code' as station_code,
        sum(coalesce((prod ->> 'qty_submitted')::numeric, 0))::bigint as qty_submitted,
        sum(coalesce((prod ->> 'qty_ready')::numeric, 0))::bigint as qty_ready,
        sum(coalesce((prod ->> 'qty_delivered')::numeric, 0))::bigint as qty_delivered,
        sum(coalesce((prod ->> 'qty_replacement_delivered')::numeric, 0))::bigint as qty_replacement_delivered,
        sum(coalesce((prod ->> 'qty_paid')::numeric, 0))::bigint as qty_paid,
        sum(coalesce((prod ->> 'qty_deferred')::numeric, 0))::bigint as qty_deferred,
        sum(coalesce((prod ->> 'qty_remade')::numeric, 0))::bigint as qty_remade,
        sum(coalesce((prod ->> 'qty_cancelled')::numeric, 0))::bigint as qty_cancelled,
        sum(coalesce((prod ->> 'qty_waived')::numeric, 0))::bigint as qty_waived,
        sum(coalesce((prod ->> 'gross_sales')::numeric, 0))::numeric(12,2) as gross_sales,
        sum(coalesce((prod ->> 'net_sales')::numeric, 0))::numeric(12,2) as net_sales
      from source,
      lateral jsonb_array_elements(coalesce(source.snapshot_json -> 'products', '[]'::jsonb)) as prod
      group by prod ->> 'product_id', prod ->> 'product_name', prod ->> 'station_code'
    ) x
  ),
  staff as (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.actor_label), '[]'::jsonb) as value
    from (
      select
        perf ->> 'actor_label' as actor_label,
        sum(coalesce((perf ->> 'submitted_qty')::numeric, 0))::bigint as submitted_qty,
        sum(coalesce((perf ->> 'ready_qty')::numeric, 0))::bigint as ready_qty,
        sum(coalesce((perf ->> 'delivered_qty')::numeric, 0))::bigint as delivered_qty,
        sum(coalesce((perf ->> 'replacement_delivered_qty')::numeric, 0))::bigint as replacement_delivered_qty,
        sum(coalesce((perf ->> 'remade_qty')::numeric, 0))::bigint as remade_qty,
        sum(coalesce((perf ->> 'cancelled_qty')::numeric, 0))::bigint as cancelled_qty,
        sum(coalesce((perf ->> 'waived_qty')::numeric, 0))::bigint as waived_qty,
        sum(coalesce((perf ->> 'payment_total')::numeric, 0))::numeric(12,2) as payment_total,
        sum(coalesce((perf ->> 'cash_sales')::numeric, 0))::numeric(12,2) as cash_sales,
        sum(coalesce((perf ->> 'deferred_sales')::numeric, 0))::numeric(12,2) as deferred_sales,
        sum(coalesce((perf ->> 'repayment_total')::numeric, 0))::numeric(12,2) as repayment_total,
        sum(coalesce((perf ->> 'complaint_count')::numeric, 0))::bigint as complaint_count,
        sum(coalesce((perf ->> 'item_issue_count')::numeric, 0))::bigint as item_issue_count
      from source,
      lateral jsonb_array_elements(coalesce(source.snapshot_json -> 'staff', '[]'::jsonb)) as perf
      group by perf ->> 'actor_label'
    ) x
  ),
  day_refs as (
    select
      coalesce(jsonb_agg(business_date order by business_date), '[]'::jsonb) as business_dates,
      min(business_date) as min_business_date,
      max(business_date) as max_business_date
    from source
  )
  select case
    when (select day_count from counts) = 0 then null
    else jsonb_build_object(
      'version', 1,
      'week_start_date', v_week_start,
      'week_end_date', v_week_end,
      'summary', jsonb_build_object(
        'day_count', (select day_count from counts),
        'shift_count', coalesce((select shift_count from totals), 0),
        'submitted_qty', coalesce((select submitted_qty from totals), 0),
        'ready_qty', coalesce((select ready_qty from totals), 0),
        'delivered_qty', coalesce((select delivered_qty from totals), 0),
        'replacement_delivered_qty', coalesce((select replacement_delivered_qty from totals), 0),
        'paid_qty', coalesce((select paid_qty from totals), 0),
        'deferred_qty', coalesce((select deferred_qty from totals), 0),
        'remade_qty', coalesce((select remade_qty from totals), 0),
        'cancelled_qty', coalesce((select cancelled_qty from totals), 0),
        'waived_qty', coalesce((select waived_qty from totals), 0),
        'net_sales', coalesce((select net_sales from totals), 0),
        'cash_total', coalesce((select cash_total from totals), 0),
        'deferred_total', coalesce((select deferred_total from totals), 0),
        'repayment_total', coalesce((select repayment_total from totals), 0),
        'complaint_total', coalesce((select complaint_total from totals), 0),
        'complaint_open', coalesce((select complaint_open from totals), 0),
        'complaint_resolved', coalesce((select complaint_resolved from totals), 0),
        'complaint_dismissed', coalesce((select complaint_dismissed from totals), 0),
        'complaint_remake', coalesce((select complaint_remake from totals), 0),
        'complaint_cancel', coalesce((select complaint_cancel from totals), 0),
        'complaint_waive', coalesce((select complaint_waive from totals), 0),
        'item_issue_total', coalesce((select item_issue_total from totals), 0),
        'item_issue_note', coalesce((select item_issue_note from totals), 0),
        'item_issue_remake', coalesce((select item_issue_remake from totals), 0),
        'item_issue_cancel', coalesce((select item_issue_cancel from totals), 0),
        'item_issue_waive', coalesce((select item_issue_waive from totals), 0),
        'open_sessions', coalesce((select open_sessions from totals), 0),
        'closed_sessions', coalesce((select closed_sessions from totals), 0),
        'total_sessions', coalesce((select total_sessions from totals), 0)
      ),
      'products', coalesce((select value from products), '[]'::jsonb),
      'staff', coalesce((select value from staff), '[]'::jsonb),
      'source_business_dates', coalesce((select business_dates from day_refs), '[]'::jsonb),
      'first_business_date', (select min_business_date from day_refs),
      'last_business_date', (select max_business_date from day_refs)
    )
  end
  into v_summary;

  if v_summary is null then
    delete from ops.weekly_summaries
    where cafe_id = p_cafe_id
      and week_start_date = v_week_start;

    return jsonb_build_object(
      'ok', true,
      'deleted', true,
      'week_start_date', v_week_start,
      'week_end_date', v_week_end
    );
  end if;

  insert into ops.weekly_summaries (
    cafe_id,
    week_start_date,
    week_end_date,
    summary_json,
    updated_at
  )
  values (
    p_cafe_id,
    v_week_start,
    v_week_end,
    v_summary,
    now()
  )
  on conflict (cafe_id, week_start_date)
  do update set week_end_date = excluded.week_end_date,
                summary_json = excluded.summary_json,
                updated_at = now();

  return v_summary;
end;
$$;

create or replace function public.ops_archive_closed_data(
  p_cafe_id uuid,
  p_archive_before_date date default (current_date - 14),
  p_rebuild_rollups boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, archive
as $$
declare
  v_shift_ids uuid[];
  v_shift_count integer := 0;
  v_days date[];
  v_day date;
  v_weeks date[];
  v_week date;
  v_session_count integer := 0;
  v_order_count integer := 0;
  v_item_count integer := 0;
  v_fulfillment_count integer := 0;
  v_payment_count integer := 0;
  v_allocation_count integer := 0;
  v_complaint_count integer := 0;
  v_issue_count integer := 0;
  v_audit_count integer := 0;
begin
  select array_agg(s.id order by s.business_date, s.opened_at), count(*)::int
  into v_shift_ids, v_shift_count
  from ops.shifts s
  where s.cafe_id = p_cafe_id
    and s.status = 'closed'
    and s.business_date <= p_archive_before_date
    and s.detail_archived_at is null;

  if v_shift_count = 0 or v_shift_ids is null then
    return jsonb_build_object(
      'ok', true,
      'archived', false,
      'reason', 'NO_ELIGIBLE_SHIFTS',
      'archive_before_date', p_archive_before_date
    );
  end if;

  select array_agg(distinct s.business_date order by s.business_date)
  into v_days
  from ops.shifts s
  where s.cafe_id = p_cafe_id
    and s.id = any(v_shift_ids);

  if p_rebuild_rollups and v_days is not null then
    foreach v_day in array v_days loop
      perform public.ops_refresh_daily_snapshot(p_cafe_id, v_day);
    end loop;

    select array_agg(distinct date_trunc('week', day_value::timestamp)::date order by date_trunc('week', day_value::timestamp)::date)
    into v_weeks
    from unnest(v_days) as t(day_value);

    if v_weeks is not null then
      foreach v_week in array v_weeks loop
        perform public.ops_refresh_weekly_summary(p_cafe_id, v_week);
      end loop;
    end if;
  end if;

  insert into archive.service_sessions
  select ss.*, now() as archived_at, sh.business_date as archived_business_date
  from ops.service_sessions ss
  join ops.shifts sh
    on sh.cafe_id = ss.cafe_id
   and sh.id = ss.shift_id
  where ss.cafe_id = p_cafe_id
    and ss.shift_id = any(v_shift_ids)
  on conflict (cafe_id, id) do nothing;

  get diagnostics v_session_count = row_count;

  insert into archive.orders
  select o.*, now() as archived_at, sh.business_date as archived_business_date
  from ops.orders o
  join ops.shifts sh
    on sh.cafe_id = o.cafe_id
   and sh.id = o.shift_id
  where o.cafe_id = p_cafe_id
    and o.shift_id = any(v_shift_ids)
  on conflict (cafe_id, id) do nothing;

  get diagnostics v_order_count = row_count;

  insert into archive.order_items
  select oi.*, now() as archived_at, sh.business_date as archived_business_date
  from ops.order_items oi
  join ops.shifts sh
    on sh.cafe_id = oi.cafe_id
   and sh.id = oi.shift_id
  where oi.cafe_id = p_cafe_id
    and oi.shift_id = any(v_shift_ids)
  on conflict (cafe_id, id) do nothing;

  get diagnostics v_item_count = row_count;

  insert into archive.fulfillment_events
  select fe.*, now() as archived_at, sh.business_date as archived_business_date
  from ops.fulfillment_events fe
  join ops.shifts sh
    on sh.cafe_id = fe.cafe_id
   and sh.id = fe.shift_id
  where fe.cafe_id = p_cafe_id
    and fe.shift_id = any(v_shift_ids)
  on conflict (cafe_id, id) do nothing;

  get diagnostics v_fulfillment_count = row_count;

  insert into archive.payments
  select p.*, now() as archived_at, sh.business_date as archived_business_date
  from ops.payments p
  join ops.shifts sh
    on sh.cafe_id = p.cafe_id
   and sh.id = p.shift_id
  where p.cafe_id = p_cafe_id
    and p.shift_id = any(v_shift_ids)
  on conflict (cafe_id, id) do nothing;

  get diagnostics v_payment_count = row_count;

  insert into archive.payment_allocations
  select pa.*, now() as archived_at, sh.business_date as archived_business_date
  from ops.payment_allocations pa
  join ops.payments p
    on p.cafe_id = pa.cafe_id
   and p.id = pa.payment_id
  join ops.shifts sh
    on sh.cafe_id = p.cafe_id
   and sh.id = p.shift_id
  where pa.cafe_id = p_cafe_id
    and p.shift_id = any(v_shift_ids)
  on conflict (cafe_id, id) do nothing;

  get diagnostics v_allocation_count = row_count;

  insert into archive.complaints
  select c.*, now() as archived_at, sh.business_date as archived_business_date
  from ops.complaints c
  join ops.shifts sh
    on sh.cafe_id = c.cafe_id
   and sh.id = c.shift_id
  where c.cafe_id = p_cafe_id
    and c.shift_id = any(v_shift_ids)
  on conflict (cafe_id, id) do nothing;

  get diagnostics v_complaint_count = row_count;

  insert into archive.order_item_issues
  select i.*, now() as archived_at, sh.business_date as archived_business_date
  from ops.order_item_issues i
  join ops.shifts sh
    on sh.cafe_id = i.cafe_id
   and sh.id = i.shift_id
  where i.cafe_id = p_cafe_id
    and i.shift_id = any(v_shift_ids)
  on conflict (cafe_id, id) do nothing;

  get diagnostics v_issue_count = row_count;

  insert into archive.audit_events
  select ae.*, now() as archived_at, (ae.created_at at time zone 'utc')::date as archived_business_date
  from ops.audit_events ae
  where ae.cafe_id = p_cafe_id
    and (ae.created_at at time zone 'utc')::date <= p_archive_before_date
  on conflict (cafe_id, id) do nothing;

  get diagnostics v_audit_count = row_count;

  delete from ops.payment_allocations pa
  using ops.payments p
  where pa.cafe_id = p_cafe_id
    and p.cafe_id = pa.cafe_id
    and p.id = pa.payment_id
    and p.shift_id = any(v_shift_ids);

  delete from ops.fulfillment_events
  where cafe_id = p_cafe_id
    and shift_id = any(v_shift_ids);

  delete from ops.complaints
  where cafe_id = p_cafe_id
    and shift_id = any(v_shift_ids);

  delete from ops.order_item_issues
  where cafe_id = p_cafe_id
    and shift_id = any(v_shift_ids);

  delete from ops.payments
  where cafe_id = p_cafe_id
    and shift_id = any(v_shift_ids);

  delete from ops.order_items
  where cafe_id = p_cafe_id
    and shift_id = any(v_shift_ids);

  delete from ops.orders
  where cafe_id = p_cafe_id
    and shift_id = any(v_shift_ids);

  delete from ops.service_sessions
  where cafe_id = p_cafe_id
    and shift_id = any(v_shift_ids);

  delete from ops.audit_events
  where cafe_id = p_cafe_id
    and (created_at at time zone 'utc')::date <= p_archive_before_date;

  update ops.shifts
  set detail_archived_at = now()
  where cafe_id = p_cafe_id
    and id = any(v_shift_ids)
    and detail_archived_at is null;

  return jsonb_build_object(
    'ok', true,
    'archived', true,
    'archive_before_date', p_archive_before_date,
    'shift_count', v_shift_count,
    'service_session_count', v_session_count,
    'order_count', v_order_count,
    'order_item_count', v_item_count,
    'fulfillment_event_count', v_fulfillment_count,
    'payment_count', v_payment_count,
    'payment_allocation_count', v_allocation_count,
    'complaint_count', v_complaint_count,
    'order_item_issue_count', v_issue_count,
    'audit_event_count', v_audit_count,
    'daily_snapshot_dates', coalesce(to_jsonb(v_days), '[]'::jsonb),
    'weekly_summary_weeks', coalesce(to_jsonb(v_weeks), '[]'::jsonb)
  );
end;
$$;

create or replace function public.ops_run_weekly_archive(
  p_cafe_id uuid,
  p_grace_days integer default 14
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, archive
as $$
declare
  v_cutoff date;
begin
  v_cutoff := current_date - greatest(coalesce(p_grace_days, 14), 0);
  return public.ops_archive_closed_data(p_cafe_id, v_cutoff, true);
end;
$$;

commit;
-- <<< 0027_weekly_archiving_rollups.sql

-- >>> 0028_operational_scope_monthly_yearly_rollups.sql
begin;

create table if not exists ops.monthly_summaries (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  month_start_date date not null,
  month_end_date date not null,
  summary_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cafe_id, month_start_date),
  constraint ck_monthly_summaries_range check (month_end_date >= month_start_date)
);

create index if not exists idx_monthly_summaries_cafe_month
  on ops.monthly_summaries(cafe_id, month_start_date desc);

create table if not exists ops.yearly_summaries (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  year_start_date date not null,
  year_end_date date not null,
  summary_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cafe_id, year_start_date),
  constraint ck_yearly_summaries_range check (year_end_date >= year_start_date)
);

create index if not exists idx_yearly_summaries_cafe_year
  on ops.yearly_summaries(cafe_id, year_start_date desc);

create or replace function public.ops_refresh_monthly_summary(
  p_cafe_id uuid,
  p_month_start_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_month_start date := date_trunc('month', p_month_start_date::timestamp)::date;
  v_month_end date := ((v_month_start + interval '1 month')::date - 1);
  v_summary jsonb;
begin
  with source as (
    select business_date, snapshot_json
    from ops.daily_snapshots
    where cafe_id = p_cafe_id
      and business_date between v_month_start and v_month_end
  ),
  counts as (
    select count(*)::int as day_count from source
  ),
  totals as (
    select
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'shift_count')::numeric, 0)), 0) as shift_count,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'submitted_qty')::numeric, 0)), 0) as submitted_qty,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'ready_qty')::numeric, 0)), 0) as ready_qty,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'delivered_qty')::numeric, 0)), 0) as delivered_qty,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'replacement_delivered_qty')::numeric, 0)), 0) as replacement_delivered_qty,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'paid_qty')::numeric, 0)), 0) as paid_qty,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'deferred_qty')::numeric, 0)), 0) as deferred_qty,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'remade_qty')::numeric, 0)), 0) as remade_qty,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'cancelled_qty')::numeric, 0)), 0) as cancelled_qty,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'waived_qty')::numeric, 0)), 0) as waived_qty,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'net_sales')::numeric, 0)), 0)::numeric(12,2) as net_sales,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'cash_total')::numeric, 0)), 0)::numeric(12,2) as cash_total,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'deferred_total')::numeric, 0)), 0)::numeric(12,2) as deferred_total,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'repayment_total')::numeric, 0)), 0)::numeric(12,2) as repayment_total,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'complaint_total')::numeric, 0)), 0) as complaint_total,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'complaint_open')::numeric, 0)), 0) as complaint_open,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'complaint_resolved')::numeric, 0)), 0) as complaint_resolved,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'complaint_dismissed')::numeric, 0)), 0) as complaint_dismissed,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'complaint_remake')::numeric, 0)), 0) as complaint_remake,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'complaint_cancel')::numeric, 0)), 0) as complaint_cancel,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'complaint_waive')::numeric, 0)), 0) as complaint_waive,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'item_issue_total')::numeric, 0)), 0) as item_issue_total,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'item_issue_note')::numeric, 0)), 0) as item_issue_note,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'item_issue_remake')::numeric, 0)), 0) as item_issue_remake,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'item_issue_cancel')::numeric, 0)), 0) as item_issue_cancel,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'item_issue_waive')::numeric, 0)), 0) as item_issue_waive,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'open_sessions')::numeric, 0)), 0) as open_sessions,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'closed_sessions')::numeric, 0)), 0) as closed_sessions,
      coalesce(sum(coalesce((snapshot_json -> 'summary' ->> 'total_sessions')::numeric, 0)), 0) as total_sessions
    from source
  ),
  products as (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.product_name, x.station_code), '[]'::jsonb) as value
    from (
      select
        prod ->> 'product_id' as product_id,
        prod ->> 'product_name' as product_name,
        prod ->> 'station_code' as station_code,
        sum(coalesce((prod ->> 'qty_submitted')::numeric, 0))::bigint as qty_submitted,
        sum(coalesce((prod ->> 'qty_ready')::numeric, 0))::bigint as qty_ready,
        sum(coalesce((prod ->> 'qty_delivered')::numeric, 0))::bigint as qty_delivered,
        sum(coalesce((prod ->> 'qty_replacement_delivered')::numeric, 0))::bigint as qty_replacement_delivered,
        sum(coalesce((prod ->> 'qty_paid')::numeric, 0))::bigint as qty_paid,
        sum(coalesce((prod ->> 'qty_deferred')::numeric, 0))::bigint as qty_deferred,
        sum(coalesce((prod ->> 'qty_remade')::numeric, 0))::bigint as qty_remade,
        sum(coalesce((prod ->> 'qty_cancelled')::numeric, 0))::bigint as qty_cancelled,
        sum(coalesce((prod ->> 'qty_waived')::numeric, 0))::bigint as qty_waived,
        sum(coalesce((prod ->> 'gross_sales')::numeric, 0))::numeric(12,2) as gross_sales,
        sum(coalesce((prod ->> 'net_sales')::numeric, 0))::numeric(12,2) as net_sales
      from source,
      lateral jsonb_array_elements(coalesce(source.snapshot_json -> 'products', '[]'::jsonb)) as prod
      group by prod ->> 'product_id', prod ->> 'product_name', prod ->> 'station_code'
    ) x
  ),
  staff as (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.actor_label), '[]'::jsonb) as value
    from (
      select
        perf ->> 'actor_label' as actor_label,
        sum(coalesce((perf ->> 'submitted_qty')::numeric, 0))::bigint as submitted_qty,
        sum(coalesce((perf ->> 'ready_qty')::numeric, 0))::bigint as ready_qty,
        sum(coalesce((perf ->> 'delivered_qty')::numeric, 0))::bigint as delivered_qty,
        sum(coalesce((perf ->> 'replacement_delivered_qty')::numeric, 0))::bigint as replacement_delivered_qty,
        sum(coalesce((perf ->> 'remade_qty')::numeric, 0))::bigint as remade_qty,
        sum(coalesce((perf ->> 'cancelled_qty')::numeric, 0))::bigint as cancelled_qty,
        sum(coalesce((perf ->> 'waived_qty')::numeric, 0))::bigint as waived_qty,
        sum(coalesce((perf ->> 'payment_total')::numeric, 0))::numeric(12,2) as payment_total,
        sum(coalesce((perf ->> 'cash_sales')::numeric, 0))::numeric(12,2) as cash_sales,
        sum(coalesce((perf ->> 'deferred_sales')::numeric, 0))::numeric(12,2) as deferred_sales,
        sum(coalesce((perf ->> 'repayment_total')::numeric, 0))::numeric(12,2) as repayment_total,
        sum(coalesce((perf ->> 'complaint_count')::numeric, 0))::bigint as complaint_count,
        sum(coalesce((perf ->> 'item_issue_count')::numeric, 0))::bigint as item_issue_count
      from source,
      lateral jsonb_array_elements(coalesce(source.snapshot_json -> 'staff', '[]'::jsonb)) as perf
      group by perf ->> 'actor_label'
    ) x
  ),
  day_refs as (
    select
      coalesce(jsonb_agg(business_date order by business_date), '[]'::jsonb) as business_dates,
      min(business_date) as min_business_date,
      max(business_date) as max_business_date
    from source
  )
  select case
    when (select day_count from counts) = 0 then null
    else jsonb_build_object(
      'version', 1,
      'month_start_date', v_month_start,
      'month_end_date', v_month_end,
      'summary', jsonb_build_object(
        'day_count', (select day_count from counts),
        'shift_count', coalesce((select shift_count from totals), 0),
        'submitted_qty', coalesce((select submitted_qty from totals), 0),
        'ready_qty', coalesce((select ready_qty from totals), 0),
        'delivered_qty', coalesce((select delivered_qty from totals), 0),
        'replacement_delivered_qty', coalesce((select replacement_delivered_qty from totals), 0),
        'paid_qty', coalesce((select paid_qty from totals), 0),
        'deferred_qty', coalesce((select deferred_qty from totals), 0),
        'remade_qty', coalesce((select remade_qty from totals), 0),
        'cancelled_qty', coalesce((select cancelled_qty from totals), 0),
        'waived_qty', coalesce((select waived_qty from totals), 0),
        'net_sales', coalesce((select net_sales from totals), 0),
        'cash_total', coalesce((select cash_total from totals), 0),
        'deferred_total', coalesce((select deferred_total from totals), 0),
        'repayment_total', coalesce((select repayment_total from totals), 0),
        'complaint_total', coalesce((select complaint_total from totals), 0),
        'complaint_open', coalesce((select complaint_open from totals), 0),
        'complaint_resolved', coalesce((select complaint_resolved from totals), 0),
        'complaint_dismissed', coalesce((select complaint_dismissed from totals), 0),
        'complaint_remake', coalesce((select complaint_remake from totals), 0),
        'complaint_cancel', coalesce((select complaint_cancel from totals), 0),
        'complaint_waive', coalesce((select complaint_waive from totals), 0),
        'item_issue_total', coalesce((select item_issue_total from totals), 0),
        'item_issue_note', coalesce((select item_issue_note from totals), 0),
        'item_issue_remake', coalesce((select item_issue_remake from totals), 0),
        'item_issue_cancel', coalesce((select item_issue_cancel from totals), 0),
        'item_issue_waive', coalesce((select item_issue_waive from totals), 0),
        'open_sessions', coalesce((select open_sessions from totals), 0),
        'closed_sessions', coalesce((select closed_sessions from totals), 0),
        'total_sessions', coalesce((select total_sessions from totals), 0)
      ),
      'products', coalesce((select value from products), '[]'::jsonb),
      'staff', coalesce((select value from staff), '[]'::jsonb),
      'source_business_dates', coalesce((select business_dates from day_refs), '[]'::jsonb),
      'first_business_date', (select min_business_date from day_refs),
      'last_business_date', (select max_business_date from day_refs)
    )
  end into v_summary;

  if v_summary is null then
    delete from ops.monthly_summaries
    where cafe_id = p_cafe_id
      and month_start_date = v_month_start;

    return jsonb_build_object(
      'ok', true,
      'deleted', true,
      'month_start_date', v_month_start,
      'month_end_date', v_month_end
    );
  end if;

  insert into ops.monthly_summaries (
    cafe_id,
    month_start_date,
    month_end_date,
    summary_json,
    updated_at
  ) values (
    p_cafe_id,
    v_month_start,
    v_month_end,
    v_summary,
    now()
  )
  on conflict (cafe_id, month_start_date)
  do update set month_end_date = excluded.month_end_date,
                summary_json = excluded.summary_json,
                updated_at = now();

  return v_summary;
end;
$$;

create or replace function public.ops_refresh_yearly_summary(
  p_cafe_id uuid,
  p_year_start_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_year_start date := date_trunc('year', p_year_start_date::timestamp)::date;
  v_year_end date := ((v_year_start + interval '1 year')::date - 1);
  v_summary jsonb;
begin
  with source as (
    select month_start_date, summary_json
    from ops.monthly_summaries
    where cafe_id = p_cafe_id
      and month_start_date between v_year_start and v_year_end
  ),
  counts as (
    select count(*)::int as month_count from source
  ),
  totals as (
    select
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'day_count')::numeric, 0)), 0) as day_count,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'shift_count')::numeric, 0)), 0) as shift_count,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'submitted_qty')::numeric, 0)), 0) as submitted_qty,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'ready_qty')::numeric, 0)), 0) as ready_qty,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'delivered_qty')::numeric, 0)), 0) as delivered_qty,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'replacement_delivered_qty')::numeric, 0)), 0) as replacement_delivered_qty,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'paid_qty')::numeric, 0)), 0) as paid_qty,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'deferred_qty')::numeric, 0)), 0) as deferred_qty,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'remade_qty')::numeric, 0)), 0) as remade_qty,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'cancelled_qty')::numeric, 0)), 0) as cancelled_qty,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'waived_qty')::numeric, 0)), 0) as waived_qty,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'net_sales')::numeric, 0)), 0)::numeric(12,2) as net_sales,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'cash_total')::numeric, 0)), 0)::numeric(12,2) as cash_total,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'deferred_total')::numeric, 0)), 0)::numeric(12,2) as deferred_total,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'repayment_total')::numeric, 0)), 0)::numeric(12,2) as repayment_total,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'complaint_total')::numeric, 0)), 0) as complaint_total,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'complaint_open')::numeric, 0)), 0) as complaint_open,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'complaint_resolved')::numeric, 0)), 0) as complaint_resolved,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'complaint_dismissed')::numeric, 0)), 0) as complaint_dismissed,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'complaint_remake')::numeric, 0)), 0) as complaint_remake,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'complaint_cancel')::numeric, 0)), 0) as complaint_cancel,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'complaint_waive')::numeric, 0)), 0) as complaint_waive,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'item_issue_total')::numeric, 0)), 0) as item_issue_total,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'item_issue_note')::numeric, 0)), 0) as item_issue_note,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'item_issue_remake')::numeric, 0)), 0) as item_issue_remake,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'item_issue_cancel')::numeric, 0)), 0) as item_issue_cancel,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'item_issue_waive')::numeric, 0)), 0) as item_issue_waive,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'open_sessions')::numeric, 0)), 0) as open_sessions,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'closed_sessions')::numeric, 0)), 0) as closed_sessions,
      coalesce(sum(coalesce((summary_json -> 'summary' ->> 'total_sessions')::numeric, 0)), 0) as total_sessions
    from source
  ),
  products as (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.product_name, x.station_code), '[]'::jsonb) as value
    from (
      select
        prod ->> 'product_id' as product_id,
        prod ->> 'product_name' as product_name,
        prod ->> 'station_code' as station_code,
        sum(coalesce((prod ->> 'qty_submitted')::numeric, 0))::bigint as qty_submitted,
        sum(coalesce((prod ->> 'qty_ready')::numeric, 0))::bigint as qty_ready,
        sum(coalesce((prod ->> 'qty_delivered')::numeric, 0))::bigint as qty_delivered,
        sum(coalesce((prod ->> 'qty_replacement_delivered')::numeric, 0))::bigint as qty_replacement_delivered,
        sum(coalesce((prod ->> 'qty_paid')::numeric, 0))::bigint as qty_paid,
        sum(coalesce((prod ->> 'qty_deferred')::numeric, 0))::bigint as qty_deferred,
        sum(coalesce((prod ->> 'qty_remade')::numeric, 0))::bigint as qty_remade,
        sum(coalesce((prod ->> 'qty_cancelled')::numeric, 0))::bigint as qty_cancelled,
        sum(coalesce((prod ->> 'qty_waived')::numeric, 0))::bigint as qty_waived,
        sum(coalesce((prod ->> 'gross_sales')::numeric, 0))::numeric(12,2) as gross_sales,
        sum(coalesce((prod ->> 'net_sales')::numeric, 0))::numeric(12,2) as net_sales
      from source,
      lateral jsonb_array_elements(coalesce(source.summary_json -> 'products', '[]'::jsonb)) as prod
      group by prod ->> 'product_id', prod ->> 'product_name', prod ->> 'station_code'
    ) x
  ),
  staff as (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.actor_label), '[]'::jsonb) as value
    from (
      select
        perf ->> 'actor_label' as actor_label,
        sum(coalesce((perf ->> 'submitted_qty')::numeric, 0))::bigint as submitted_qty,
        sum(coalesce((perf ->> 'ready_qty')::numeric, 0))::bigint as ready_qty,
        sum(coalesce((perf ->> 'delivered_qty')::numeric, 0))::bigint as delivered_qty,
        sum(coalesce((perf ->> 'replacement_delivered_qty')::numeric, 0))::bigint as replacement_delivered_qty,
        sum(coalesce((perf ->> 'remade_qty')::numeric, 0))::bigint as remade_qty,
        sum(coalesce((perf ->> 'cancelled_qty')::numeric, 0))::bigint as cancelled_qty,
        sum(coalesce((perf ->> 'waived_qty')::numeric, 0))::bigint as waived_qty,
        sum(coalesce((perf ->> 'payment_total')::numeric, 0))::numeric(12,2) as payment_total,
        sum(coalesce((perf ->> 'cash_sales')::numeric, 0))::numeric(12,2) as cash_sales,
        sum(coalesce((perf ->> 'deferred_sales')::numeric, 0))::numeric(12,2) as deferred_sales,
        sum(coalesce((perf ->> 'repayment_total')::numeric, 0))::numeric(12,2) as repayment_total,
        sum(coalesce((perf ->> 'complaint_count')::numeric, 0))::bigint as complaint_count,
        sum(coalesce((perf ->> 'item_issue_count')::numeric, 0))::bigint as item_issue_count
      from source,
      lateral jsonb_array_elements(coalesce(source.summary_json -> 'staff', '[]'::jsonb)) as perf
      group by perf ->> 'actor_label'
    ) x
  ),
  month_refs as (
    select
      coalesce(jsonb_agg(month_start_date order by month_start_date), '[]'::jsonb) as month_starts,
      min(month_start_date) as min_month_start,
      max(month_start_date) as max_month_start
    from source
  )
  select case
    when (select month_count from counts) = 0 then null
    else jsonb_build_object(
      'version', 1,
      'year_start_date', v_year_start,
      'year_end_date', v_year_end,
      'summary', jsonb_build_object(
        'month_count', (select month_count from counts),
        'day_count', coalesce((select day_count from totals), 0),
        'shift_count', coalesce((select shift_count from totals), 0),
        'submitted_qty', coalesce((select submitted_qty from totals), 0),
        'ready_qty', coalesce((select ready_qty from totals), 0),
        'delivered_qty', coalesce((select delivered_qty from totals), 0),
        'replacement_delivered_qty', coalesce((select replacement_delivered_qty from totals), 0),
        'paid_qty', coalesce((select paid_qty from totals), 0),
        'deferred_qty', coalesce((select deferred_qty from totals), 0),
        'remade_qty', coalesce((select remade_qty from totals), 0),
        'cancelled_qty', coalesce((select cancelled_qty from totals), 0),
        'waived_qty', coalesce((select waived_qty from totals), 0),
        'net_sales', coalesce((select net_sales from totals), 0),
        'cash_total', coalesce((select cash_total from totals), 0),
        'deferred_total', coalesce((select deferred_total from totals), 0),
        'repayment_total', coalesce((select repayment_total from totals), 0),
        'complaint_total', coalesce((select complaint_total from totals), 0),
        'complaint_open', coalesce((select complaint_open from totals), 0),
        'complaint_resolved', coalesce((select complaint_resolved from totals), 0),
        'complaint_dismissed', coalesce((select complaint_dismissed from totals), 0),
        'complaint_remake', coalesce((select complaint_remake from totals), 0),
        'complaint_cancel', coalesce((select complaint_cancel from totals), 0),
        'complaint_waive', coalesce((select complaint_waive from totals), 0),
        'item_issue_total', coalesce((select item_issue_total from totals), 0),
        'item_issue_note', coalesce((select item_issue_note from totals), 0),
        'item_issue_remake', coalesce((select item_issue_remake from totals), 0),
        'item_issue_cancel', coalesce((select item_issue_cancel from totals), 0),
        'item_issue_waive', coalesce((select item_issue_waive from totals), 0),
        'open_sessions', coalesce((select open_sessions from totals), 0),
        'closed_sessions', coalesce((select closed_sessions from totals), 0),
        'total_sessions', coalesce((select total_sessions from totals), 0)
      ),
      'products', coalesce((select value from products), '[]'::jsonb),
      'staff', coalesce((select value from staff), '[]'::jsonb),
      'source_month_start_dates', coalesce((select month_starts from month_refs), '[]'::jsonb),
      'first_month_start_date', (select min_month_start from month_refs),
      'last_month_start_date', (select max_month_start from month_refs)
    )
  end into v_summary;

  if v_summary is null then
    delete from ops.yearly_summaries
    where cafe_id = p_cafe_id
      and year_start_date = v_year_start;

    return jsonb_build_object(
      'ok', true,
      'deleted', true,
      'year_start_date', v_year_start,
      'year_end_date', v_year_end
    );
  end if;

  insert into ops.yearly_summaries (
    cafe_id,
    year_start_date,
    year_end_date,
    summary_json,
    updated_at
  ) values (
    p_cafe_id,
    v_year_start,
    v_year_end,
    v_summary,
    now()
  )
  on conflict (cafe_id, year_start_date)
  do update set year_end_date = excluded.year_end_date,
                summary_json = excluded.summary_json,
                updated_at = now();

  return v_summary;
end;
$$;

create or replace function public.ops_deferred_customer_summaries(
  p_cafe_id uuid
)
returns table (
  debtor_name text,
  entry_count bigint,
  debt_total numeric,
  repayment_total numeric,
  balance numeric,
  last_entry_at timestamptz,
  last_debt_at timestamptz,
  last_repayment_at timestamptz,
  last_entry_kind text
)
language sql
security definer
set search_path = public, ops
as $$
  with rows as (
    select id, debtor_name, entry_kind, amount, created_at
    from ops.deferred_ledger_entries
    where cafe_id = p_cafe_id
      and coalesce(trim(debtor_name), '') <> ''
  ),
  grouped as (
    select
      debtor_name,
      count(*)::bigint as entry_count,
      coalesce(sum(case when entry_kind = 'debt' then amount else 0 end), 0)::numeric as debt_total,
      coalesce(sum(case when entry_kind = 'repayment' then amount else 0 end), 0)::numeric as repayment_total,
      max(created_at) as last_entry_at,
      max(case when entry_kind = 'debt' then created_at end) as last_debt_at,
      max(case when entry_kind = 'repayment' then created_at end) as last_repayment_at
    from rows
    group by debtor_name
  ),
  latest as (
    select distinct on (debtor_name)
      debtor_name,
      entry_kind as last_entry_kind
    from rows
    order by debtor_name, created_at desc, id desc
  )
  select
    grouped.debtor_name,
    grouped.entry_count,
    grouped.debt_total,
    grouped.repayment_total,
    (grouped.debt_total - grouped.repayment_total)::numeric as balance,
    grouped.last_entry_at,
    grouped.last_debt_at,
    grouped.last_repayment_at,
    latest.last_entry_kind
  from grouped
  left join latest using (debtor_name)
  order by grouped.debtor_name;
$$;

create or replace function public.ops_archive_closed_data(
  p_cafe_id uuid,
  p_archive_before_date date default (current_date - 14),
  p_rebuild_rollups boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, archive
as $$
declare
  v_shift_ids uuid[];
  v_shift_count integer := 0;
  v_days date[];
  v_day date;
  v_weeks date[];
  v_week date;
  v_months date[];
  v_month date;
  v_years date[];
  v_year date;
  v_session_count integer := 0;
  v_order_count integer := 0;
  v_item_count integer := 0;
  v_fulfillment_count integer := 0;
  v_payment_count integer := 0;
  v_allocation_count integer := 0;
  v_complaint_count integer := 0;
  v_issue_count integer := 0;
  v_audit_count integer := 0;
begin
  select array_agg(s.id order by s.business_date, s.opened_at), count(*)::int
  into v_shift_ids, v_shift_count
  from ops.shifts s
  where s.cafe_id = p_cafe_id
    and s.status = 'closed'
    and s.business_date <= p_archive_before_date
    and s.detail_archived_at is null;

  if v_shift_count = 0 or v_shift_ids is null then
    return jsonb_build_object(
      'ok', true,
      'archived', false,
      'reason', 'NO_ELIGIBLE_SHIFTS',
      'archive_before_date', p_archive_before_date
    );
  end if;

  select array_agg(distinct s.business_date order by s.business_date)
  into v_days
  from ops.shifts s
  where s.cafe_id = p_cafe_id
    and s.id = any(v_shift_ids);

  if p_rebuild_rollups and v_days is not null then
    foreach v_day in array v_days loop
      perform public.ops_refresh_daily_snapshot(p_cafe_id, v_day);
    end loop;

    select array_agg(distinct date_trunc('week', day_value::timestamp)::date order by date_trunc('week', day_value::timestamp)::date)
    into v_weeks
    from unnest(v_days) as t(day_value);

    if v_weeks is not null then
      foreach v_week in array v_weeks loop
        perform public.ops_refresh_weekly_summary(p_cafe_id, v_week);
      end loop;
    end if;

    select array_agg(distinct date_trunc('month', day_value::timestamp)::date order by date_trunc('month', day_value::timestamp)::date)
    into v_months
    from unnest(v_days) as t(day_value);

    if v_months is not null then
      foreach v_month in array v_months loop
        perform public.ops_refresh_monthly_summary(p_cafe_id, v_month);
      end loop;
    end if;

    select array_agg(distinct date_trunc('year', day_value::timestamp)::date order by date_trunc('year', day_value::timestamp)::date)
    into v_years
    from unnest(v_days) as t(day_value);

    if v_years is not null then
      foreach v_year in array v_years loop
        perform public.ops_refresh_yearly_summary(p_cafe_id, v_year);
      end loop;
    end if;
  end if;

  insert into archive.service_sessions
  select ss.*, now() as archived_at, sh.business_date as archived_business_date
  from ops.service_sessions ss
  join ops.shifts sh
    on sh.cafe_id = ss.cafe_id
   and sh.id = ss.shift_id
  where ss.cafe_id = p_cafe_id
    and ss.shift_id = any(v_shift_ids)
  on conflict (cafe_id, id) do nothing;

  get diagnostics v_session_count = row_count;

  insert into archive.orders
  select o.*, now() as archived_at, sh.business_date as archived_business_date
  from ops.orders o
  join ops.shifts sh
    on sh.cafe_id = o.cafe_id
   and sh.id = o.shift_id
  where o.cafe_id = p_cafe_id
    and o.shift_id = any(v_shift_ids)
  on conflict (cafe_id, id) do nothing;

  get diagnostics v_order_count = row_count;

  insert into archive.order_items
  select oi.*, now() as archived_at, sh.business_date as archived_business_date
  from ops.order_items oi
  join ops.shifts sh
    on sh.cafe_id = oi.cafe_id
   and sh.id = oi.shift_id
  where oi.cafe_id = p_cafe_id
    and oi.shift_id = any(v_shift_ids)
  on conflict (cafe_id, id) do nothing;

  get diagnostics v_item_count = row_count;

  insert into archive.fulfillment_events
  select fe.*, now() as archived_at, sh.business_date as archived_business_date
  from ops.fulfillment_events fe
  join ops.shifts sh
    on sh.cafe_id = fe.cafe_id
   and sh.id = fe.shift_id
  where fe.cafe_id = p_cafe_id
    and fe.shift_id = any(v_shift_ids)
  on conflict (cafe_id, id) do nothing;

  get diagnostics v_fulfillment_count = row_count;

  insert into archive.payments
  select p.*, now() as archived_at, sh.business_date as archived_business_date
  from ops.payments p
  join ops.shifts sh
    on sh.cafe_id = p.cafe_id
   and sh.id = p.shift_id
  where p.cafe_id = p_cafe_id
    and p.shift_id = any(v_shift_ids)
  on conflict (cafe_id, id) do nothing;

  get diagnostics v_payment_count = row_count;

  insert into archive.payment_allocations
  select pa.*, now() as archived_at, sh.business_date as archived_business_date
  from ops.payment_allocations pa
  join ops.payments p
    on p.cafe_id = pa.cafe_id
   and p.id = pa.payment_id
  join ops.shifts sh
    on sh.cafe_id = p.cafe_id
   and sh.id = p.shift_id
  where pa.cafe_id = p_cafe_id
    and p.shift_id = any(v_shift_ids)
  on conflict (cafe_id, id) do nothing;

  get diagnostics v_allocation_count = row_count;

  insert into archive.complaints
  select c.*, now() as archived_at, sh.business_date as archived_business_date
  from ops.complaints c
  join ops.shifts sh
    on sh.cafe_id = c.cafe_id
   and sh.id = c.shift_id
  where c.cafe_id = p_cafe_id
    and c.shift_id = any(v_shift_ids)
  on conflict (cafe_id, id) do nothing;

  get diagnostics v_complaint_count = row_count;

  insert into archive.order_item_issues
  select i.*, now() as archived_at, sh.business_date as archived_business_date
  from ops.order_item_issues i
  join ops.shifts sh
    on sh.cafe_id = i.cafe_id
   and sh.id = i.shift_id
  where i.cafe_id = p_cafe_id
    and i.shift_id = any(v_shift_ids)
  on conflict (cafe_id, id) do nothing;

  get diagnostics v_issue_count = row_count;

  insert into archive.audit_events
  select ae.*, now() as archived_at, (ae.created_at at time zone 'utc')::date as archived_business_date
  from ops.audit_events ae
  where ae.cafe_id = p_cafe_id
    and (ae.created_at at time zone 'utc')::date <= p_archive_before_date
  on conflict (cafe_id, id) do nothing;

  get diagnostics v_audit_count = row_count;

  delete from ops.payment_allocations pa
  using ops.payments p
  where pa.cafe_id = p_cafe_id
    and p.cafe_id = pa.cafe_id
    and p.id = pa.payment_id
    and p.shift_id = any(v_shift_ids);

  delete from ops.fulfillment_events
  where cafe_id = p_cafe_id
    and shift_id = any(v_shift_ids);

  delete from ops.complaints
  where cafe_id = p_cafe_id
    and shift_id = any(v_shift_ids);

  delete from ops.order_item_issues
  where cafe_id = p_cafe_id
    and shift_id = any(v_shift_ids);

  delete from ops.payments
  where cafe_id = p_cafe_id
    and shift_id = any(v_shift_ids);

  delete from ops.order_items
  where cafe_id = p_cafe_id
    and shift_id = any(v_shift_ids);

  delete from ops.orders
  where cafe_id = p_cafe_id
    and shift_id = any(v_shift_ids);

  delete from ops.service_sessions
  where cafe_id = p_cafe_id
    and shift_id = any(v_shift_ids);

  delete from ops.audit_events
  where cafe_id = p_cafe_id
    and (created_at at time zone 'utc')::date <= p_archive_before_date;

  update ops.shifts
  set detail_archived_at = now()
  where cafe_id = p_cafe_id
    and id = any(v_shift_ids)
    and detail_archived_at is null;

  return jsonb_build_object(
    'ok', true,
    'archived', true,
    'archive_before_date', p_archive_before_date,
    'shift_count', v_shift_count,
    'service_session_count', v_session_count,
    'order_count', v_order_count,
    'order_item_count', v_item_count,
    'fulfillment_event_count', v_fulfillment_count,
    'payment_count', v_payment_count,
    'payment_allocation_count', v_allocation_count,
    'complaint_count', v_complaint_count,
    'order_item_issue_count', v_issue_count,
    'audit_event_count', v_audit_count,
    'daily_snapshot_dates', coalesce(to_jsonb(v_days), '[]'::jsonb),
    'weekly_summary_weeks', coalesce(to_jsonb(v_weeks), '[]'::jsonb),
    'monthly_summary_months', coalesce(to_jsonb(v_months), '[]'::jsonb),
    'yearly_summary_years', coalesce(to_jsonb(v_years), '[]'::jsonb)
  );
end;
$$;

commit;
-- <<< 0028_operational_scope_monthly_yearly_rollups.sql

-- >>> 0029_runtime_reporting_contract_and_deferred_balances.sql
begin;

create table if not exists ops.deferred_customer_balances (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  debtor_name text not null,
  balance numeric(12,2) not null default 0,
  debt_total numeric(12,2) not null default 0,
  repayment_total numeric(12,2) not null default 0,
  entry_count integer not null default 0,
  last_entry_at timestamptz,
  last_debt_at timestamptz,
  last_repayment_at timestamptz,
  last_entry_kind text check (last_entry_kind in ('debt', 'repayment', 'adjustment')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cafe_id, debtor_name)
);

create index if not exists idx_deferred_customer_balances_cafe_balance
  on ops.deferred_customer_balances(cafe_id, balance desc, last_entry_at desc nulls last);

alter table ops.daily_snapshots
  add column if not exists source_shift_ids uuid[] not null default '{}'::uuid[],
  add column if not exists closed_shift_count integer not null default 0,
  add column if not exists is_finalized boolean not null default false,
  add column if not exists finalized_at timestamptz;

create or replace function public.ops_rebuild_deferred_customer_balances(
  p_cafe_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_rows integer := 0;
begin
  if p_cafe_id is null then
    delete from ops.deferred_customer_balances;

    insert into ops.deferred_customer_balances (
      cafe_id,
      debtor_name,
      balance,
      debt_total,
      repayment_total,
      entry_count,
      last_entry_at,
      last_debt_at,
      last_repayment_at,
      last_entry_kind,
      created_at,
      updated_at
    )
    with ledger as (
      select
        dle.cafe_id,
        btrim(dle.debtor_name) as debtor_name,
        dle.entry_kind,
        dle.amount,
        dle.created_at
      from ops.deferred_ledger_entries dle
      where nullif(btrim(dle.debtor_name), '') is not null
    ),
    normalized as (
      select
        cafe_id,
        debtor_name,
        count(*)::int as entry_count,
        coalesce(sum(case when entry_kind = 'debt' then amount else 0 end), 0)::numeric(12,2) as debt_total,
        coalesce(sum(case when entry_kind = 'repayment' then amount else 0 end), 0)::numeric(12,2) as repayment_total,
        max(created_at) as last_entry_at,
        max(created_at) filter (where entry_kind = 'debt') as last_debt_at,
        max(created_at) filter (where entry_kind = 'repayment') as last_repayment_at
      from ledger
      group by cafe_id, debtor_name
    ),
    last_kind as (
      select distinct on (dle.cafe_id, btrim(dle.debtor_name))
        dle.cafe_id,
        btrim(dle.debtor_name) as debtor_name,
        dle.entry_kind as last_entry_kind
      from ops.deferred_ledger_entries dle
      where nullif(btrim(dle.debtor_name), '') is not null
      order by dle.cafe_id, btrim(dle.debtor_name), dle.created_at desc, dle.id desc
    )
    select
      normalized.cafe_id,
      normalized.debtor_name,
      (normalized.debt_total - normalized.repayment_total)::numeric(12,2) as balance,
      normalized.debt_total,
      normalized.repayment_total,
      normalized.entry_count,
      normalized.last_entry_at,
      normalized.last_debt_at,
      normalized.last_repayment_at,
      last_kind.last_entry_kind,
      now(),
      now()
    from normalized
    left join last_kind
      on last_kind.cafe_id = normalized.cafe_id
     and last_kind.debtor_name = normalized.debtor_name;
  else
    delete from ops.deferred_customer_balances
    where cafe_id = p_cafe_id;

    insert into ops.deferred_customer_balances (
      cafe_id,
      debtor_name,
      balance,
      debt_total,
      repayment_total,
      entry_count,
      last_entry_at,
      last_debt_at,
      last_repayment_at,
      last_entry_kind,
      created_at,
      updated_at
    )
    with ledger as (
      select
        dle.cafe_id,
        btrim(dle.debtor_name) as debtor_name,
        dle.entry_kind,
        dle.amount,
        dle.created_at
      from ops.deferred_ledger_entries dle
      where dle.cafe_id = p_cafe_id
        and nullif(btrim(dle.debtor_name), '') is not null
    ),
    normalized as (
      select
        cafe_id,
        debtor_name,
        count(*)::int as entry_count,
        coalesce(sum(case when entry_kind = 'debt' then amount else 0 end), 0)::numeric(12,2) as debt_total,
        coalesce(sum(case when entry_kind = 'repayment' then amount else 0 end), 0)::numeric(12,2) as repayment_total,
        max(created_at) as last_entry_at,
        max(created_at) filter (where entry_kind = 'debt') as last_debt_at,
        max(created_at) filter (where entry_kind = 'repayment') as last_repayment_at
      from ledger
      group by cafe_id, debtor_name
    ),
    last_kind as (
      select distinct on (dle.cafe_id, btrim(dle.debtor_name))
        dle.cafe_id,
        btrim(dle.debtor_name) as debtor_name,
        dle.entry_kind as last_entry_kind
      from ops.deferred_ledger_entries dle
      where dle.cafe_id = p_cafe_id
        and nullif(btrim(dle.debtor_name), '') is not null
      order by dle.cafe_id, btrim(dle.debtor_name), dle.created_at desc, dle.id desc
    )
    select
      normalized.cafe_id,
      normalized.debtor_name,
      (normalized.debt_total - normalized.repayment_total)::numeric(12,2) as balance,
      normalized.debt_total,
      normalized.repayment_total,
      normalized.entry_count,
      normalized.last_entry_at,
      normalized.last_debt_at,
      normalized.last_repayment_at,
      last_kind.last_entry_kind,
      now(),
      now()
    from normalized
    left join last_kind
      on last_kind.cafe_id = normalized.cafe_id
     and last_kind.debtor_name = normalized.debtor_name;
  end if;

  get diagnostics v_rows = row_count;

  return jsonb_build_object(
    'ok', true,
    'scope', case when p_cafe_id is null then 'all' else 'cafe' end,
    'cafe_id', p_cafe_id,
    'rows', v_rows
  );
end;
$$;

create or replace function public.ops_sync_deferred_customer_balance(
  p_cafe_id uuid,
  p_debtor_name text
)
returns void
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_name text := nullif(btrim(p_debtor_name), '');
  v_entry_count integer := 0;
  v_debt_total numeric(12,2) := 0;
  v_repayment_total numeric(12,2) := 0;
  v_last_entry_at timestamptz;
  v_last_debt_at timestamptz;
  v_last_repayment_at timestamptz;
  v_last_entry_kind text;
begin
  if p_cafe_id is null then
    raise exception 'p_cafe_id is required';
  end if;

  if v_name is null then
    return;
  end if;

  select
    count(*)::int,
    coalesce(sum(case when entry_kind = 'debt' then amount else 0 end), 0)::numeric(12,2),
    coalesce(sum(case when entry_kind = 'repayment' then amount else 0 end), 0)::numeric(12,2),
    max(created_at),
    max(created_at) filter (where entry_kind = 'debt'),
    max(created_at) filter (where entry_kind = 'repayment')
  into v_entry_count, v_debt_total, v_repayment_total, v_last_entry_at, v_last_debt_at, v_last_repayment_at
  from ops.deferred_ledger_entries
  where cafe_id = p_cafe_id
    and btrim(debtor_name) = v_name;

  if v_entry_count = 0 then
    delete from ops.deferred_customer_balances
    where cafe_id = p_cafe_id
      and debtor_name = v_name;
    return;
  end if;

  select dle.entry_kind
  into v_last_entry_kind
  from ops.deferred_ledger_entries dle
  where dle.cafe_id = p_cafe_id
    and btrim(dle.debtor_name) = v_name
  order by dle.created_at desc, dle.id desc
  limit 1;

  insert into ops.deferred_customer_balances (
    cafe_id,
    debtor_name,
    balance,
    debt_total,
    repayment_total,
    entry_count,
    last_entry_at,
    last_debt_at,
    last_repayment_at,
    last_entry_kind,
    created_at,
    updated_at
  ) values (
    p_cafe_id,
    v_name,
    (v_debt_total - v_repayment_total)::numeric(12,2),
    v_debt_total,
    v_repayment_total,
    v_entry_count,
    v_last_entry_at,
    v_last_debt_at,
    v_last_repayment_at,
    v_last_entry_kind,
    now(),
    now()
  )
  on conflict (cafe_id, debtor_name)
  do update set balance = excluded.balance,
                debt_total = excluded.debt_total,
                repayment_total = excluded.repayment_total,
                entry_count = excluded.entry_count,
                last_entry_at = excluded.last_entry_at,
                last_debt_at = excluded.last_debt_at,
                last_repayment_at = excluded.last_repayment_at,
                last_entry_kind = excluded.last_entry_kind,
                updated_at = now();
end;
$$;

create or replace function public.ops_trg_sync_deferred_customer_balance()
returns trigger
language plpgsql
security definer
set search_path = public, ops
as $$
begin
  if tg_op = 'DELETE' then
    perform public.ops_sync_deferred_customer_balance(old.cafe_id, old.debtor_name);
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.cafe_id is distinct from new.cafe_id or btrim(coalesce(old.debtor_name, '')) is distinct from btrim(coalesce(new.debtor_name, '')) then
      perform public.ops_sync_deferred_customer_balance(old.cafe_id, old.debtor_name);
    end if;
    perform public.ops_sync_deferred_customer_balance(new.cafe_id, new.debtor_name);
    return new;
  end if;

  perform public.ops_sync_deferred_customer_balance(new.cafe_id, new.debtor_name);
  return new;
end;
$$;

drop trigger if exists trg_sync_deferred_customer_balance on ops.deferred_ledger_entries;
create trigger trg_sync_deferred_customer_balance
  after insert or update or delete on ops.deferred_ledger_entries
  for each row execute function public.ops_trg_sync_deferred_customer_balance();

select public.ops_rebuild_deferred_customer_balances();

create or replace function public.ops_deferred_customer_summaries(
  p_cafe_id uuid
)
returns table (
  debtor_name text,
  entry_count bigint,
  debt_total numeric,
  repayment_total numeric,
  balance numeric,
  last_entry_at timestamptz,
  last_debt_at timestamptz,
  last_repayment_at timestamptz,
  last_entry_kind text
)
language sql
security definer
set search_path = public, ops
as $$
  select
    dcb.debtor_name,
    dcb.entry_count::bigint as entry_count,
    dcb.debt_total::numeric as debt_total,
    dcb.repayment_total::numeric as repayment_total,
    dcb.balance::numeric as balance,
    dcb.last_entry_at,
    dcb.last_debt_at,
    dcb.last_repayment_at,
    dcb.last_entry_kind
  from ops.deferred_customer_balances dcb
  where dcb.cafe_id = p_cafe_id
  order by dcb.balance desc, dcb.last_entry_at desc nulls last, dcb.debtor_name asc;
$$;

create or replace function public.ops_refresh_daily_snapshot(
  p_cafe_id uuid,
  p_business_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_snapshot jsonb;
  v_source_shift_ids uuid[] := '{}'::uuid[];
  v_closed_shift_count integer := 0;
  v_is_finalized boolean := false;
  v_finalized_at timestamptz := null;
begin
  with source as (
    select
      s.id as shift_id,
      s.shift_kind,
      s.business_date,
      s.opened_at,
      s.closed_at,
      ss.snapshot_json
    from ops.shifts s
    join ops.shift_snapshots ss
      on ss.cafe_id = s.cafe_id
     and ss.shift_id = s.id
    where s.cafe_id = p_cafe_id
      and s.business_date = p_business_date
      and s.status = 'closed'
  ),
  counts as (
    select count(*)::int as shift_count from source
  ),
  totals as (
    select
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'submitted_qty')::numeric, 0)), 0) as submitted_qty,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'ready_qty')::numeric, 0)), 0) as ready_qty,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'delivered_qty')::numeric, 0)), 0) as delivered_qty,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'replacement_delivered_qty')::numeric, 0)), 0) as replacement_delivered_qty,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'paid_qty')::numeric, 0)), 0) as paid_qty,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'deferred_qty')::numeric, 0)), 0) as deferred_qty,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'remade_qty')::numeric, 0)), 0) as remade_qty,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'cancelled_qty')::numeric, 0)), 0) as cancelled_qty,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'waived_qty')::numeric, 0)), 0) as waived_qty,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'net_sales')::numeric, 0)), 0)::numeric(12,2) as net_sales,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'cash_total')::numeric, 0)), 0)::numeric(12,2) as cash_total,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'deferred_total')::numeric, 0)), 0)::numeric(12,2) as deferred_total,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'repayment_total')::numeric, 0)), 0)::numeric(12,2) as repayment_total,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'complaint_total')::numeric, 0)), 0) as complaint_total,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'complaint_open')::numeric, 0)), 0) as complaint_open,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'complaint_resolved')::numeric, 0)), 0) as complaint_resolved,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'complaint_dismissed')::numeric, 0)), 0) as complaint_dismissed,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'complaint_remake')::numeric, 0)), 0) as complaint_remake,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'complaint_cancel')::numeric, 0)), 0) as complaint_cancel,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'complaint_waive')::numeric, 0)), 0) as complaint_waive,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'item_issue_total')::numeric, 0)), 0) as item_issue_total,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'item_issue_note')::numeric, 0)), 0) as item_issue_note,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'item_issue_remake')::numeric, 0)), 0) as item_issue_remake,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'item_issue_cancel')::numeric, 0)), 0) as item_issue_cancel,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'item_issue_waive')::numeric, 0)), 0) as item_issue_waive,
      coalesce(sum(coalesce((snapshot_json -> 'sessions' ->> 'open_sessions')::numeric, 0)), 0) as open_sessions,
      coalesce(sum(coalesce((snapshot_json -> 'sessions' ->> 'closed_sessions')::numeric, 0)), 0) as closed_sessions,
      coalesce(sum(coalesce((snapshot_json -> 'sessions' ->> 'total_sessions')::numeric, 0)), 0) as total_sessions
    from source
  ),
  products as (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.product_name, x.station_code), '[]'::jsonb) as value
    from (
      select
        prod ->> 'product_id' as product_id,
        prod ->> 'product_name' as product_name,
        prod ->> 'station_code' as station_code,
        sum(coalesce((prod ->> 'qty_submitted')::numeric, 0))::bigint as qty_submitted,
        sum(coalesce((prod ->> 'qty_ready')::numeric, 0))::bigint as qty_ready,
        sum(coalesce((prod ->> 'qty_delivered')::numeric, 0))::bigint as qty_delivered,
        sum(coalesce((prod ->> 'qty_replacement_delivered')::numeric, 0))::bigint as qty_replacement_delivered,
        sum(coalesce((prod ->> 'qty_paid')::numeric, 0))::bigint as qty_paid,
        sum(coalesce((prod ->> 'qty_deferred')::numeric, 0))::bigint as qty_deferred,
        sum(coalesce((prod ->> 'qty_remade')::numeric, 0))::bigint as qty_remade,
        sum(coalesce((prod ->> 'qty_cancelled')::numeric, 0))::bigint as qty_cancelled,
        sum(coalesce((prod ->> 'qty_waived')::numeric, 0))::bigint as qty_waived,
        sum(coalesce((prod ->> 'gross_sales')::numeric, 0))::numeric(12,2) as gross_sales,
        sum(coalesce((prod ->> 'net_sales')::numeric, 0))::numeric(12,2) as net_sales
      from source,
      lateral jsonb_array_elements(coalesce(source.snapshot_json -> 'products', '[]'::jsonb)) as prod
      group by prod ->> 'product_id', prod ->> 'product_name', prod ->> 'station_code'
    ) x
  ),
  staff as (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.actor_label), '[]'::jsonb) as value
    from (
      select
        perf ->> 'actor_label' as actor_label,
        sum(coalesce((perf ->> 'submitted_qty')::numeric, 0))::bigint as submitted_qty,
        sum(coalesce((perf ->> 'ready_qty')::numeric, 0))::bigint as ready_qty,
        sum(coalesce((perf ->> 'delivered_qty')::numeric, 0))::bigint as delivered_qty,
        sum(coalesce((perf ->> 'replacement_delivered_qty')::numeric, 0))::bigint as replacement_delivered_qty,
        sum(coalesce((perf ->> 'remade_qty')::numeric, 0))::bigint as remade_qty,
        sum(coalesce((perf ->> 'cancelled_qty')::numeric, 0))::bigint as cancelled_qty,
        sum(coalesce((perf ->> 'waived_qty')::numeric, 0))::bigint as waived_qty,
        sum(coalesce((perf ->> 'payment_total')::numeric, 0))::numeric(12,2) as payment_total,
        sum(coalesce((perf ->> 'cash_sales')::numeric, 0))::numeric(12,2) as cash_sales,
        sum(coalesce((perf ->> 'deferred_sales')::numeric, 0))::numeric(12,2) as deferred_sales,
        sum(coalesce((perf ->> 'repayment_total')::numeric, 0))::numeric(12,2) as repayment_total,
        sum(coalesce((perf ->> 'complaint_count')::numeric, 0))::bigint as complaint_count,
        sum(coalesce((perf ->> 'item_issue_count')::numeric, 0))::bigint as item_issue_count
      from source,
      lateral jsonb_array_elements(coalesce(source.snapshot_json -> 'staff', '[]'::jsonb)) as perf
      group by perf ->> 'actor_label'
    ) x
  ),
  shift_refs as (
    select
      coalesce(array_agg(source.shift_id order by source.shift_kind, source.closed_at nulls last, source.shift_id), '{}'::uuid[]) as shift_ids,
      count(*)::int as closed_shift_count,
      bool_and(source.shift_kind in ('morning', 'evening')) as valid_shift_kinds,
      count(distinct source.shift_kind)::int as distinct_shift_kinds,
      max(source.closed_at) as latest_closed_at
    from source
  )
  select case
    when (select shift_count from counts) = 0 then null
    else jsonb_build_object(
      'version', 2,
      'business_date', p_business_date,
      'summary', jsonb_build_object(
        'shift_count', coalesce((select shift_count from counts), 0),
        'submitted_qty', coalesce((select submitted_qty from totals), 0),
        'ready_qty', coalesce((select ready_qty from totals), 0),
        'delivered_qty', coalesce((select delivered_qty from totals), 0),
        'replacement_delivered_qty', coalesce((select replacement_delivered_qty from totals), 0),
        'paid_qty', coalesce((select paid_qty from totals), 0),
        'deferred_qty', coalesce((select deferred_qty from totals), 0),
        'remade_qty', coalesce((select remade_qty from totals), 0),
        'cancelled_qty', coalesce((select cancelled_qty from totals), 0),
        'waived_qty', coalesce((select waived_qty from totals), 0),
        'net_sales', coalesce((select net_sales from totals), 0),
        'cash_total', coalesce((select cash_total from totals), 0),
        'deferred_total', coalesce((select deferred_total from totals), 0),
        'repayment_total', coalesce((select repayment_total from totals), 0),
        'complaint_total', coalesce((select complaint_total from totals), 0),
        'complaint_open', coalesce((select complaint_open from totals), 0),
        'complaint_resolved', coalesce((select complaint_resolved from totals), 0),
        'complaint_dismissed', coalesce((select complaint_dismissed from totals), 0),
        'complaint_remake', coalesce((select complaint_remake from totals), 0),
        'complaint_cancel', coalesce((select complaint_cancel from totals), 0),
        'complaint_waive', coalesce((select complaint_waive from totals), 0),
        'item_issue_total', coalesce((select item_issue_total from totals), 0),
        'item_issue_note', coalesce((select item_issue_note from totals), 0),
        'item_issue_remake', coalesce((select item_issue_remake from totals), 0),
        'item_issue_cancel', coalesce((select item_issue_cancel from totals), 0),
        'item_issue_waive', coalesce((select item_issue_waive from totals), 0),
        'open_sessions', coalesce((select open_sessions from totals), 0),
        'closed_sessions', coalesce((select closed_sessions from totals), 0),
        'total_sessions', coalesce((select total_sessions from totals), 0),
        'recognized_sales', (coalesce((select cash_total from totals), 0) + coalesce((select deferred_total from totals), 0))::numeric(12,2)
      ),
      'products', coalesce((select value from products), '[]'::jsonb),
      'staff', coalesce((select value from staff), '[]'::jsonb),
      'source_shift_ids', to_jsonb(coalesce((select shift_ids from shift_refs), '{}'::uuid[])),
      'closed_shift_count', coalesce((select closed_shift_count from shift_refs), 0),
      'is_finalized', (
        coalesce((select valid_shift_kinds from shift_refs), false)
        and coalesce((select distinct_shift_kinds from shift_refs), 0) = 2
        and not exists (
          select 1
          from ops.shifts s_open
          where s_open.cafe_id = p_cafe_id
            and s_open.business_date = p_business_date
            and s_open.status = 'open'
        )
      ),
      'finalized_at', case
        when (
          coalesce((select valid_shift_kinds from shift_refs), false)
          and coalesce((select distinct_shift_kinds from shift_refs), 0) = 2
          and not exists (
            select 1
            from ops.shifts s_open
            where s_open.cafe_id = p_cafe_id
              and s_open.business_date = p_business_date
              and s_open.status = 'open'
          )
        ) then (select latest_closed_at from shift_refs)
        else null
      end
    )
  end into v_snapshot;

  select
    coalesce(shift_ids, '{}'::uuid[]),
    coalesce(closed_shift_count, 0),
    (
      coalesce(valid_shift_kinds, false)
      and coalesce(distinct_shift_kinds, 0) = 2
      and not exists (
        select 1
        from ops.shifts s_open
        where s_open.cafe_id = p_cafe_id
          and s_open.business_date = p_business_date
          and s_open.status = 'open'
      )
    ),
    case
      when (
        coalesce(valid_shift_kinds, false)
        and coalesce(distinct_shift_kinds, 0) = 2
        and not exists (
          select 1
          from ops.shifts s_open
          where s_open.cafe_id = p_cafe_id
            and s_open.business_date = p_business_date
            and s_open.status = 'open'
        )
      ) then latest_closed_at
      else null
    end
  into v_source_shift_ids, v_closed_shift_count, v_is_finalized, v_finalized_at
  from (
    with source as (
      select s.id as shift_id, s.shift_kind, s.closed_at
      from ops.shifts s
      join ops.shift_snapshots ss
        on ss.cafe_id = s.cafe_id
       and ss.shift_id = s.id
      where s.cafe_id = p_cafe_id
        and s.business_date = p_business_date
        and s.status = 'closed'
    )
    select
      coalesce(array_agg(source.shift_id order by source.shift_kind, source.closed_at nulls last, source.shift_id), '{}'::uuid[]) as shift_ids,
      count(*)::int as closed_shift_count,
      bool_and(source.shift_kind in ('morning', 'evening')) as valid_shift_kinds,
      count(distinct source.shift_kind)::int as distinct_shift_kinds,
      max(source.closed_at) as latest_closed_at
    from source
  ) shift_meta;

  if v_snapshot is null then
    delete from ops.daily_snapshots
    where cafe_id = p_cafe_id
      and business_date = p_business_date;

    return jsonb_build_object(
      'ok', true,
      'deleted', true,
      'business_date', p_business_date
    );
  end if;

  insert into ops.daily_snapshots (
    cafe_id,
    business_date,
    snapshot_json,
    source_shift_ids,
    closed_shift_count,
    is_finalized,
    finalized_at,
    updated_at
  ) values (
    p_cafe_id,
    p_business_date,
    v_snapshot,
    v_source_shift_ids,
    v_closed_shift_count,
    v_is_finalized,
    v_finalized_at,
    now()
  )
  on conflict (cafe_id, business_date)
  do update set snapshot_json = excluded.snapshot_json,
                source_shift_ids = excluded.source_shift_ids,
                closed_shift_count = excluded.closed_shift_count,
                is_finalized = excluded.is_finalized,
                finalized_at = excluded.finalized_at,
                updated_at = now();

  return v_snapshot;
end;
$$;

create or replace function public.ops_refresh_reporting_chain(
  p_cafe_id uuid,
  p_business_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_day date := p_business_date;
  v_week_start date := date_trunc('week', p_business_date::timestamp)::date;
  v_month_start date := date_trunc('month', p_business_date::timestamp)::date;
  v_year_start date := date_trunc('year', p_business_date::timestamp)::date;
  v_daily jsonb;
  v_weekly jsonb;
  v_monthly jsonb;
  v_yearly jsonb;
begin
  if p_cafe_id is null then
    raise exception 'p_cafe_id is required';
  end if;

  if p_business_date is null then
    raise exception 'p_business_date is required';
  end if;

  v_daily := public.ops_refresh_daily_snapshot(p_cafe_id, v_day);
  v_weekly := public.ops_refresh_weekly_summary(p_cafe_id, v_week_start);
  v_monthly := public.ops_refresh_monthly_summary(p_cafe_id, v_month_start);
  v_yearly := public.ops_refresh_yearly_summary(p_cafe_id, v_year_start);

  return jsonb_build_object(
    'ok', true,
    'business_date', v_day,
    'week_start_date', v_week_start,
    'month_start_date', v_month_start,
    'year_start_date', v_year_start,
    'daily', v_daily,
    'weekly', v_weekly,
    'monthly', v_monthly,
    'yearly', v_yearly
  );
end;
$$;

create or replace function public.ops_assert_runtime_contract(
  p_require_reporting boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_missing text[] := '{}'::text[];
  v_required_reporting boolean := coalesce(p_require_reporting, false);
begin
  if to_regclass('ops.deferred_customer_balances') is null then
    v_missing := array_append(v_missing, 'ops.deferred_customer_balances');
  end if;

  if to_regprocedure('public.ops_deferred_customer_summaries(uuid)') is null then
    v_missing := array_append(v_missing, 'public.ops_deferred_customer_summaries(uuid)');
  end if;

  if v_required_reporting then
    if to_regclass('ops.daily_snapshots') is null then
      v_missing := array_append(v_missing, 'ops.daily_snapshots');
    end if;
    if to_regclass('ops.weekly_summaries') is null then
      v_missing := array_append(v_missing, 'ops.weekly_summaries');
    end if;
    if to_regclass('ops.monthly_summaries') is null then
      v_missing := array_append(v_missing, 'ops.monthly_summaries');
    end if;
    if to_regclass('ops.yearly_summaries') is null then
      v_missing := array_append(v_missing, 'ops.yearly_summaries');
    end if;
    if to_regprocedure('public.ops_refresh_reporting_chain(uuid,date)') is null then
      v_missing := array_append(v_missing, 'public.ops_refresh_reporting_chain(uuid,date)');
    end if;
  end if;

  if coalesce(array_length(v_missing, 1), 0) > 0 then
    raise exception using
      message = 'runtime_reporting_contract_mismatch',
      detail = array_to_string(v_missing, ', ');
  end if;

  return jsonb_build_object(
    'ok', true,
    'reporting_required', v_required_reporting,
    'checked_at', now()
  );
end;
$$;

create or replace function public.ops_close_shift(
  p_cafe_id uuid,
  p_shift_id uuid,
  p_by_owner_id uuid,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_open_sessions integer;
  v_snapshot jsonb;
  v_business_date date;
  v_rollups jsonb;
begin
  if p_by_owner_id is null then
    raise exception 'p_by_owner_id is required';
  end if;

  select count(*)
  into v_open_sessions
  from ops.service_sessions
  where cafe_id = p_cafe_id
    and shift_id = p_shift_id
    and status = 'open';

  if v_open_sessions > 0 then
    raise exception 'Cannot close shift while open service sessions exist';
  end if;

  update ops.shifts
  set status = 'closed',
      closed_at = now(),
      closed_by_owner_id = p_by_owner_id,
      notes = coalesce(p_notes, notes)
  where cafe_id = p_cafe_id
    and id = p_shift_id
    and status = 'open'
  returning business_date into v_business_date;

  if not found then
    raise exception 'shift not found or already closed';
  end if;

  v_snapshot := public.ops_build_shift_snapshot(p_cafe_id, p_shift_id);
  v_rollups := public.ops_refresh_reporting_chain(p_cafe_id, v_business_date);

  return jsonb_build_object(
    'ok', true,
    'shift_id', p_shift_id,
    'status', 'closed',
    'business_date', v_business_date,
    'snapshot', v_snapshot,
    'rollups', v_rollups
  );
end;
$$;

commit;
-- <<< 0029_runtime_reporting_contract_and_deferred_balances.sql

-- >>> 0030_archive_scheduler_and_backfill_reconciliation.sql
begin;

create table if not exists ops.reporting_maintenance_runs (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid references ops.cafes(id) on delete cascade,
  run_kind text not null check (run_kind in ('archive', 'backfill', 'reconcile')),
  triggered_by text not null default 'system',
  dry_run boolean not null default false,
  window_start_date date,
  window_end_date date,
  request_json jsonb not null default '{}'::jsonb,
  result_json jsonb,
  status text not null default 'started' check (status in ('started', 'succeeded', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists idx_reporting_maintenance_runs_cafe_started
  on ops.reporting_maintenance_runs(cafe_id, started_at desc);

create index if not exists idx_reporting_maintenance_runs_kind_started
  on ops.reporting_maintenance_runs(run_kind, started_at desc);

create or replace function public.ops_archive_closed_data(
  p_cafe_id uuid,
  p_archive_before_date date default (current_date - 14),
  p_rebuild_rollups boolean default true,
  p_dry_run boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, archive
as $$
declare
  v_run_id uuid;
  v_shift_ids uuid[];
  v_shift_count integer := 0;
  v_days date[];
  v_day date;
  v_weeks date[];
  v_week date;
  v_months date[];
  v_month date;
  v_years date[];
  v_year date;
  v_session_count integer := 0;
  v_order_count integer := 0;
  v_item_count integer := 0;
  v_fulfillment_count integer := 0;
  v_payment_count integer := 0;
  v_allocation_count integer := 0;
  v_complaint_count integer := 0;
  v_issue_count integer := 0;
  v_audit_count integer := 0;
  v_result jsonb;
begin
  insert into ops.reporting_maintenance_runs (
    cafe_id,
    run_kind,
    triggered_by,
    dry_run,
    window_end_date,
    request_json
  ) values (
    p_cafe_id,
    'archive',
    'db',
    coalesce(p_dry_run, false),
    p_archive_before_date,
    jsonb_build_object(
      'archive_before_date', p_archive_before_date,
      'rebuild_rollups', coalesce(p_rebuild_rollups, true),
      'dry_run', coalesce(p_dry_run, false)
    )
  ) returning id into v_run_id;

  select array_agg(s.id order by s.business_date, s.opened_at), count(*)::int
  into v_shift_ids, v_shift_count
  from ops.shifts s
  join ops.daily_snapshots ds
    on ds.cafe_id = s.cafe_id
   and ds.business_date = s.business_date
   and ds.is_finalized = true
  where s.cafe_id = p_cafe_id
    and s.status = 'closed'
    and s.business_date <= p_archive_before_date
    and s.detail_archived_at is null;

  if v_shift_count = 0 or v_shift_ids is null then
    v_result := jsonb_build_object(
      'ok', true,
      'archived', false,
      'reason', 'NO_ELIGIBLE_SHIFTS',
      'archive_before_date', p_archive_before_date
    );

    update ops.reporting_maintenance_runs
    set status = 'succeeded',
        result_json = v_result,
        finished_at = now()
    where id = v_run_id;

    return v_result;
  end if;

  select array_agg(distinct s.business_date order by s.business_date)
  into v_days
  from ops.shifts s
  where s.cafe_id = p_cafe_id
    and s.id = any(v_shift_ids);

  select count(*)::int into v_session_count
  from ops.service_sessions
  where cafe_id = p_cafe_id
    and shift_id = any(v_shift_ids);

  select count(*)::int into v_order_count
  from ops.orders
  where cafe_id = p_cafe_id
    and shift_id = any(v_shift_ids);

  select count(*)::int into v_item_count
  from ops.order_items
  where cafe_id = p_cafe_id
    and shift_id = any(v_shift_ids);

  select count(*)::int into v_fulfillment_count
  from ops.fulfillment_events
  where cafe_id = p_cafe_id
    and shift_id = any(v_shift_ids);

  select count(*)::int into v_payment_count
  from ops.payments
  where cafe_id = p_cafe_id
    and shift_id = any(v_shift_ids);

  select count(*)::int into v_allocation_count
  from ops.payment_allocations pa
  join ops.payments p
    on p.cafe_id = pa.cafe_id
   and p.id = pa.payment_id
  where pa.cafe_id = p_cafe_id
    and p.shift_id = any(v_shift_ids);

  select count(*)::int into v_complaint_count
  from ops.complaints
  where cafe_id = p_cafe_id
    and shift_id = any(v_shift_ids);

  select count(*)::int into v_issue_count
  from ops.order_item_issues
  where cafe_id = p_cafe_id
    and shift_id = any(v_shift_ids);

  select count(*)::int into v_audit_count
  from ops.audit_events
  where cafe_id = p_cafe_id
    and (created_at at time zone 'utc')::date <= p_archive_before_date;

  if v_days is not null then
    select array_agg(distinct date_trunc('week', day_value::timestamp)::date order by date_trunc('week', day_value::timestamp)::date)
    into v_weeks
    from unnest(v_days) as t(day_value);

    select array_agg(distinct date_trunc('month', day_value::timestamp)::date order by date_trunc('month', day_value::timestamp)::date)
    into v_months
    from unnest(v_days) as t(day_value);

    select array_agg(distinct date_trunc('year', day_value::timestamp)::date order by date_trunc('year', day_value::timestamp)::date)
    into v_years
    from unnest(v_days) as t(day_value);
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'archived', not coalesce(p_dry_run, false),
    'dry_run', coalesce(p_dry_run, false),
    'archive_before_date', p_archive_before_date,
    'shift_count', v_shift_count,
    'service_session_count', v_session_count,
    'order_count', v_order_count,
    'order_item_count', v_item_count,
    'fulfillment_event_count', v_fulfillment_count,
    'payment_count', v_payment_count,
    'payment_allocation_count', v_allocation_count,
    'complaint_count', v_complaint_count,
    'order_item_issue_count', v_issue_count,
    'audit_event_count', v_audit_count,
    'daily_snapshot_dates', coalesce(to_jsonb(v_days), '[]'::jsonb),
    'weekly_summary_weeks', coalesce(to_jsonb(v_weeks), '[]'::jsonb),
    'monthly_summary_months', coalesce(to_jsonb(v_months), '[]'::jsonb),
    'yearly_summary_years', coalesce(to_jsonb(v_years), '[]'::jsonb)
  );

  if coalesce(p_dry_run, false) then
    update ops.reporting_maintenance_runs
    set status = 'succeeded',
        result_json = v_result,
        finished_at = now()
    where id = v_run_id;

    return v_result;
  end if;

  if coalesce(p_rebuild_rollups, true) and v_days is not null then
    foreach v_day in array v_days loop
      perform public.ops_refresh_reporting_chain(p_cafe_id, v_day);
    end loop;
  end if;

  insert into archive.service_sessions
  select ss.*, now() as archived_at, sh.business_date as archived_business_date
  from ops.service_sessions ss
  join ops.shifts sh
    on sh.cafe_id = ss.cafe_id
   and sh.id = ss.shift_id
  where ss.cafe_id = p_cafe_id
    and ss.shift_id = any(v_shift_ids)
  on conflict (cafe_id, id) do nothing;

  insert into archive.orders
  select o.*, now() as archived_at, sh.business_date as archived_business_date
  from ops.orders o
  join ops.shifts sh
    on sh.cafe_id = o.cafe_id
   and sh.id = o.shift_id
  where o.cafe_id = p_cafe_id
    and o.shift_id = any(v_shift_ids)
  on conflict (cafe_id, id) do nothing;

  insert into archive.order_items
  select oi.*, now() as archived_at, sh.business_date as archived_business_date
  from ops.order_items oi
  join ops.shifts sh
    on sh.cafe_id = oi.cafe_id
   and sh.id = oi.shift_id
  where oi.cafe_id = p_cafe_id
    and oi.shift_id = any(v_shift_ids)
  on conflict (cafe_id, id) do nothing;

  insert into archive.fulfillment_events
  select fe.*, now() as archived_at, sh.business_date as archived_business_date
  from ops.fulfillment_events fe
  join ops.shifts sh
    on sh.cafe_id = fe.cafe_id
   and sh.id = fe.shift_id
  where fe.cafe_id = p_cafe_id
    and fe.shift_id = any(v_shift_ids)
  on conflict (cafe_id, id) do nothing;

  insert into archive.payments
  select p.*, now() as archived_at, sh.business_date as archived_business_date
  from ops.payments p
  join ops.shifts sh
    on sh.cafe_id = p.cafe_id
   and sh.id = p.shift_id
  where p.cafe_id = p_cafe_id
    and p.shift_id = any(v_shift_ids)
  on conflict (cafe_id, id) do nothing;

  insert into archive.payment_allocations
  select pa.*, now() as archived_at, sh.business_date as archived_business_date
  from ops.payment_allocations pa
  join ops.payments p
    on p.cafe_id = pa.cafe_id
   and p.id = pa.payment_id
  join ops.shifts sh
    on sh.cafe_id = p.cafe_id
   and sh.id = p.shift_id
  where pa.cafe_id = p_cafe_id
    and p.shift_id = any(v_shift_ids)
  on conflict (cafe_id, id) do nothing;

  insert into archive.complaints
  select c.*, now() as archived_at, sh.business_date as archived_business_date
  from ops.complaints c
  join ops.shifts sh
    on sh.cafe_id = c.cafe_id
   and sh.id = c.shift_id
  where c.cafe_id = p_cafe_id
    and c.shift_id = any(v_shift_ids)
  on conflict (cafe_id, id) do nothing;

  insert into archive.order_item_issues
  select i.*, now() as archived_at, sh.business_date as archived_business_date
  from ops.order_item_issues i
  join ops.shifts sh
    on sh.cafe_id = i.cafe_id
   and sh.id = i.shift_id
  where i.cafe_id = p_cafe_id
    and i.shift_id = any(v_shift_ids)
  on conflict (cafe_id, id) do nothing;

  insert into archive.audit_events
  select ae.*, now() as archived_at, (ae.created_at at time zone 'utc')::date as archived_business_date
  from ops.audit_events ae
  where ae.cafe_id = p_cafe_id
    and (ae.created_at at time zone 'utc')::date <= p_archive_before_date
  on conflict (cafe_id, id) do nothing;

  delete from ops.payment_allocations pa
  using ops.payments p
  where pa.cafe_id = p_cafe_id
    and p.cafe_id = pa.cafe_id
    and p.id = pa.payment_id
    and p.shift_id = any(v_shift_ids);

  delete from ops.fulfillment_events
  where cafe_id = p_cafe_id
    and shift_id = any(v_shift_ids);

  delete from ops.complaints
  where cafe_id = p_cafe_id
    and shift_id = any(v_shift_ids);

  delete from ops.order_item_issues
  where cafe_id = p_cafe_id
    and shift_id = any(v_shift_ids);

  delete from ops.payments
  where cafe_id = p_cafe_id
    and shift_id = any(v_shift_ids);

  delete from ops.order_items
  where cafe_id = p_cafe_id
    and shift_id = any(v_shift_ids);

  delete from ops.orders
  where cafe_id = p_cafe_id
    and shift_id = any(v_shift_ids);

  delete from ops.service_sessions
  where cafe_id = p_cafe_id
    and shift_id = any(v_shift_ids);

  delete from ops.audit_events
  where cafe_id = p_cafe_id
    and (created_at at time zone 'utc')::date <= p_archive_before_date;

  update ops.shifts
  set detail_archived_at = now()
  where cafe_id = p_cafe_id
    and id = any(v_shift_ids)
    and detail_archived_at is null;

  update ops.reporting_maintenance_runs
  set status = 'succeeded',
      result_json = v_result,
      finished_at = now()
  where id = v_run_id;

  return v_result;
exception
  when others then
    update ops.reporting_maintenance_runs
    set status = 'failed',
        result_json = jsonb_build_object('ok', false, 'error', sqlerrm),
        finished_at = now()
    where id = v_run_id;
    raise;
end;
$$;

drop function if exists public.ops_run_weekly_archive(uuid, integer);
create or replace function public.ops_run_weekly_archive(
  p_cafe_id uuid,
  p_grace_days integer default 14,
  p_dry_run boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, archive
as $$
declare
  v_cutoff date;
begin
  v_cutoff := current_date - greatest(coalesce(p_grace_days, 14), 0);
  return public.ops_archive_closed_data(p_cafe_id, v_cutoff, true, p_dry_run);
end;
$$;

create or replace function public.ops_backfill_reporting_history(
  p_cafe_id uuid,
  p_start_date date default null,
  p_end_date date default current_date,
  p_rebuild_deferred_balances boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_run_id uuid;
  v_effective_start date;
  v_days date[];
  v_day date;
  v_weeks date[];
  v_months date[];
  v_years date[];
  v_result jsonb;
begin
  select coalesce(p_start_date, min(business_date)), coalesce(array_agg(distinct business_date order by business_date), '{}'::date[])
  into v_effective_start, v_days
  from ops.shifts
  where cafe_id = p_cafe_id
    and business_date <= coalesce(p_end_date, current_date)
    and business_date >= coalesce(p_start_date, business_date);

  insert into ops.reporting_maintenance_runs (
    cafe_id,
    run_kind,
    triggered_by,
    dry_run,
    window_start_date,
    window_end_date,
    request_json
  ) values (
    p_cafe_id,
    'backfill',
    'db',
    false,
    v_effective_start,
    coalesce(p_end_date, current_date),
    jsonb_build_object(
      'start_date', v_effective_start,
      'end_date', coalesce(p_end_date, current_date),
      'rebuild_deferred_balances', coalesce(p_rebuild_deferred_balances, true)
    )
  ) returning id into v_run_id;

  if coalesce(array_length(v_days, 1), 0) = 0 then
    v_result := jsonb_build_object(
      'ok', true,
      'backfilled', false,
      'reason', 'NO_SOURCE_DAYS',
      'start_date', v_effective_start,
      'end_date', coalesce(p_end_date, current_date)
    );

    update ops.reporting_maintenance_runs
    set status = 'succeeded',
        result_json = v_result,
        finished_at = now()
    where id = v_run_id;

    return v_result;
  end if;

  if coalesce(p_rebuild_deferred_balances, true) then
    perform public.ops_rebuild_deferred_customer_balances(p_cafe_id);
  end if;

  foreach v_day in array v_days loop
    perform public.ops_refresh_reporting_chain(p_cafe_id, v_day);
  end loop;

  select array_agg(distinct date_trunc('week', day_value::timestamp)::date order by date_trunc('week', day_value::timestamp)::date)
  into v_weeks
  from unnest(v_days) as t(day_value);

  select array_agg(distinct date_trunc('month', day_value::timestamp)::date order by date_trunc('month', day_value::timestamp)::date)
  into v_months
  from unnest(v_days) as t(day_value);

  select array_agg(distinct date_trunc('year', day_value::timestamp)::date order by date_trunc('year', day_value::timestamp)::date)
  into v_years
  from unnest(v_days) as t(day_value);

  v_result := jsonb_build_object(
    'ok', true,
    'backfilled', true,
    'start_date', v_effective_start,
    'end_date', coalesce(p_end_date, current_date),
    'business_day_count', coalesce(array_length(v_days, 1), 0),
    'business_dates', to_jsonb(v_days),
    'weekly_summary_weeks', coalesce(to_jsonb(v_weeks), '[]'::jsonb),
    'monthly_summary_months', coalesce(to_jsonb(v_months), '[]'::jsonb),
    'yearly_summary_years', coalesce(to_jsonb(v_years), '[]'::jsonb),
    'rebuild_deferred_balances', coalesce(p_rebuild_deferred_balances, true)
  );

  update ops.reporting_maintenance_runs
  set status = 'succeeded',
      result_json = v_result,
      finished_at = now()
  where id = v_run_id;

  return v_result;
exception
  when others then
    update ops.reporting_maintenance_runs
    set status = 'failed',
        result_json = jsonb_build_object('ok', false, 'error', sqlerrm),
        finished_at = now()
    where id = v_run_id;
    raise;
end;
$$;

create or replace function public.ops_reconcile_reporting_window(
  p_cafe_id uuid,
  p_start_date date,
  p_end_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_run_id uuid;
  v_result jsonb;
begin
  insert into ops.reporting_maintenance_runs (
    cafe_id,
    run_kind,
    triggered_by,
    dry_run,
    window_start_date,
    window_end_date,
    request_json
  ) values (
    p_cafe_id,
    'reconcile',
    'db',
    true,
    p_start_date,
    coalesce(p_end_date, current_date),
    jsonb_build_object(
      'start_date', p_start_date,
      'end_date', coalesce(p_end_date, current_date)
    )
  ) returning id into v_run_id;

  with source as (
    select
      s.business_date,
      count(*)::int as shift_count,
      coalesce(sum(coalesce((ss.snapshot_json -> 'totals' ->> 'submitted_qty')::numeric, 0)), 0) as submitted_qty,
      coalesce(sum(coalesce((ss.snapshot_json -> 'totals' ->> 'delivered_qty')::numeric, 0)), 0) as delivered_qty,
      coalesce(sum(coalesce((ss.snapshot_json -> 'totals' ->> 'paid_qty')::numeric, 0)), 0) as paid_qty,
      coalesce(sum(coalesce((ss.snapshot_json -> 'totals' ->> 'deferred_qty')::numeric, 0)), 0) as deferred_qty,
      coalesce(sum(coalesce((ss.snapshot_json -> 'totals' ->> 'net_sales')::numeric, 0)), 0)::numeric(12,2) as net_sales,
      coalesce(sum(coalesce((ss.snapshot_json -> 'totals' ->> 'cash_total')::numeric, 0)), 0)::numeric(12,2) as cash_total,
      coalesce(sum(coalesce((ss.snapshot_json -> 'totals' ->> 'deferred_total')::numeric, 0)), 0)::numeric(12,2) as deferred_total,
      coalesce(sum(coalesce((ss.snapshot_json -> 'totals' ->> 'repayment_total')::numeric, 0)), 0)::numeric(12,2) as repayment_total,
      coalesce(sum(coalesce((ss.snapshot_json -> 'totals' ->> 'complaint_total')::numeric, 0)), 0) as complaint_total,
      coalesce(sum(coalesce((ss.snapshot_json -> 'totals' ->> 'item_issue_total')::numeric, 0)), 0) as item_issue_total,
      count(distinct s.shift_kind)::int as shift_kind_count
    from ops.shifts s
    join ops.shift_snapshots ss
      on ss.cafe_id = s.cafe_id
     and ss.shift_id = s.id
    where s.cafe_id = p_cafe_id
      and s.status = 'closed'
      and s.business_date between p_start_date and coalesce(p_end_date, current_date)
    group by s.business_date
  ),
  compared as (
    select
      src.business_date,
      src.shift_count,
      src.shift_kind_count,
      ds.is_finalized,
      ds.closed_shift_count,
      (ds.id is null) as missing_daily,
      coalesce((ds.snapshot_json -> 'summary' ->> 'shift_count')::int, 0) as snapshot_shift_count,
      coalesce((ds.snapshot_json -> 'summary' ->> 'submitted_qty')::numeric, 0) as snapshot_submitted_qty,
      coalesce((ds.snapshot_json -> 'summary' ->> 'delivered_qty')::numeric, 0) as snapshot_delivered_qty,
      coalesce((ds.snapshot_json -> 'summary' ->> 'paid_qty')::numeric, 0) as snapshot_paid_qty,
      coalesce((ds.snapshot_json -> 'summary' ->> 'deferred_qty')::numeric, 0) as snapshot_deferred_qty,
      coalesce((ds.snapshot_json -> 'summary' ->> 'net_sales')::numeric, 0) as snapshot_net_sales,
      coalesce((ds.snapshot_json -> 'summary' ->> 'cash_total')::numeric, 0) as snapshot_cash_total,
      coalesce((ds.snapshot_json -> 'summary' ->> 'deferred_total')::numeric, 0) as snapshot_deferred_total,
      coalesce((ds.snapshot_json -> 'summary' ->> 'repayment_total')::numeric, 0) as snapshot_repayment_total,
      coalesce((ds.snapshot_json -> 'summary' ->> 'complaint_total')::numeric, 0) as snapshot_complaint_total,
      coalesce((ds.snapshot_json -> 'summary' ->> 'item_issue_total')::numeric, 0) as snapshot_item_issue_total,
      src.submitted_qty,
      src.delivered_qty,
      src.paid_qty,
      src.deferred_qty,
      src.net_sales,
      src.cash_total,
      src.deferred_total,
      src.repayment_total,
      src.complaint_total,
      src.item_issue_total
    from source src
    left join ops.daily_snapshots ds
      on ds.cafe_id = p_cafe_id
     and ds.business_date = src.business_date
  ),
  mismatches as (
    select
      business_date,
      jsonb_strip_nulls(jsonb_build_object(
        'business_date', business_date,
        'reason', case when missing_daily then 'missing_daily_snapshot' end,
        'expected_shift_count', shift_count,
        'actual_shift_count', snapshot_shift_count,
        'expected_submitted_qty', submitted_qty,
        'actual_submitted_qty', snapshot_submitted_qty,
        'expected_delivered_qty', delivered_qty,
        'actual_delivered_qty', snapshot_delivered_qty,
        'expected_paid_qty', paid_qty,
        'actual_paid_qty', snapshot_paid_qty,
        'expected_deferred_qty', deferred_qty,
        'actual_deferred_qty', snapshot_deferred_qty,
        'expected_net_sales', net_sales,
        'actual_net_sales', snapshot_net_sales,
        'expected_cash_total', cash_total,
        'actual_cash_total', snapshot_cash_total,
        'expected_deferred_total', deferred_total,
        'actual_deferred_total', snapshot_deferred_total,
        'expected_repayment_total', repayment_total,
        'actual_repayment_total', snapshot_repayment_total,
        'expected_complaint_total', complaint_total,
        'actual_complaint_total', snapshot_complaint_total,
        'expected_item_issue_total', item_issue_total,
        'actual_item_issue_total', snapshot_item_issue_total,
        'is_finalized', is_finalized,
        'closed_shift_count', closed_shift_count
      )) as detail
    from compared
    where missing_daily
       or snapshot_shift_count <> shift_count
       or snapshot_submitted_qty <> submitted_qty
       or snapshot_delivered_qty <> delivered_qty
       or snapshot_paid_qty <> paid_qty
       or snapshot_deferred_qty <> deferred_qty
       or snapshot_net_sales <> net_sales
       or snapshot_cash_total <> cash_total
       or snapshot_deferred_total <> deferred_total
       or snapshot_repayment_total <> repayment_total
       or snapshot_complaint_total <> complaint_total
       or snapshot_item_issue_total <> item_issue_total
       or ((shift_kind_count = 2) and coalesce(is_finalized, false) = false)
  ),
  weeks as (
    select array_agg(distinct date_trunc('week', business_date::timestamp)::date order by date_trunc('week', business_date::timestamp)::date) as value
    from source
  ),
  missing_weekly as (
    select coalesce(jsonb_agg(week_start_date order by week_start_date), '[]'::jsonb) as value
    from (
      select week_start_date
      from unnest(coalesce((select value from weeks), '{}'::date[])) as week_start_date
      where not exists (
        select 1
        from ops.weekly_summaries ws
        where ws.cafe_id = p_cafe_id
          and ws.week_start_date = week_start_date
      )
    ) q
  ),
  months as (
    select array_agg(distinct date_trunc('month', business_date::timestamp)::date order by date_trunc('month', business_date::timestamp)::date) as value
    from source
  ),
  missing_monthly as (
    select coalesce(jsonb_agg(month_start_date order by month_start_date), '[]'::jsonb) as value
    from (
      select month_start_date
      from unnest(coalesce((select value from months), '{}'::date[])) as month_start_date
      where not exists (
        select 1
        from ops.monthly_summaries ms
        where ms.cafe_id = p_cafe_id
          and ms.month_start_date = month_start_date
      )
    ) q
  ),
  years as (
    select array_agg(distinct date_trunc('year', business_date::timestamp)::date order by date_trunc('year', business_date::timestamp)::date) as value
    from source
  ),
  missing_yearly as (
    select coalesce(jsonb_agg(year_start_date order by year_start_date), '[]'::jsonb) as value
    from (
      select year_start_date
      from unnest(coalesce((select value from years), '{}'::date[])) as year_start_date
      where not exists (
        select 1
        from ops.yearly_summaries ys
        where ys.cafe_id = p_cafe_id
          and ys.year_start_date = year_start_date
      )
    ) q
  )
  select jsonb_build_object(
    'ok', true,
    'start_date', p_start_date,
    'end_date', coalesce(p_end_date, current_date),
    'business_day_count', coalesce((select count(*)::int from source), 0),
    'daily_mismatch_count', coalesce((select count(*)::int from mismatches), 0),
    'daily_mismatches', coalesce((select jsonb_agg(detail order by business_date) from mismatches), '[]'::jsonb),
    'missing_weekly_summaries', (select value from missing_weekly),
    'missing_monthly_summaries', (select value from missing_monthly),
    'missing_yearly_summaries', (select value from missing_yearly)
  ) into v_result;

  update ops.reporting_maintenance_runs
  set status = 'succeeded',
      result_json = v_result,
      finished_at = now()
  where id = v_run_id;

  return v_result;
exception
  when others then
    update ops.reporting_maintenance_runs
    set status = 'failed',
        result_json = jsonb_build_object('ok', false, 'error', sqlerrm),
        finished_at = now()
    where id = v_run_id;
    raise;
end;
$$;

commit;
-- <<< 0030_archive_scheduler_and_backfill_reconciliation.sql

-- >>> 0031_archive_approval_and_post_archive_checks.sql
begin;

create table if not exists ops.archive_execution_approvals (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  grace_days integer not null default 14,
  archive_before_date date not null,
  requested_by text not null default 'system',
  approved_by text,
  status text not null default 'pending' check (
    status in (
      'pending',
      'superseded',
      'stale',
      'expired',
      'executed',
      'failed_post_check',
      'failed'
    )
  ),
  plan_result_json jsonb not null default '{}'::jsonb,
  execution_result_json jsonb,
  post_check_json jsonb,
  request_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  approved_at timestamptz,
  executed_at timestamptz,
  invalidated_at timestamptz,
  stale_reason text
);

create index if not exists idx_archive_execution_approvals_cafe_status
  on ops.archive_execution_approvals(cafe_id, status, created_at desc);

create index if not exists idx_archive_execution_approvals_pending_expiry
  on ops.archive_execution_approvals(status, expires_at)
  where status = 'pending';

create or replace function public.ops_request_archive_execution_approval(
  p_cafe_id uuid,
  p_grace_days integer default 14,
  p_requested_by text default 'system',
  p_request_json jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, archive
as $$
declare
  v_cutoff date := current_date - greatest(coalesce(p_grace_days, 14), 0);
  v_plan jsonb;
  v_approval_id uuid;
  v_expires_at timestamptz;
begin
  if p_cafe_id is null then
    raise exception 'p_cafe_id is required';
  end if;

  update ops.archive_execution_approvals
  set status = 'expired',
      invalidated_at = now(),
      stale_reason = coalesce(stale_reason, 'expired_before_request')
  where cafe_id = p_cafe_id
    and status = 'pending'
    and expires_at < now();

  v_plan := public.ops_archive_closed_data(p_cafe_id, v_cutoff, true, true);

  if coalesce((v_plan ->> 'shift_count')::integer, 0) = 0 then
    return jsonb_build_object(
      'ok', true,
      'approval_required', false,
      'approval_id', null,
      'archive_before_date', v_cutoff,
      'grace_days', greatest(coalesce(p_grace_days, 14), 0),
      'plan', v_plan
    );
  end if;

  update ops.archive_execution_approvals
  set status = 'superseded',
      invalidated_at = now(),
      stale_reason = 'superseded_by_new_plan'
  where cafe_id = p_cafe_id
    and status = 'pending';

  insert into ops.archive_execution_approvals (
    cafe_id,
    grace_days,
    archive_before_date,
    requested_by,
    status,
    plan_result_json,
    request_json,
    expires_at
  ) values (
    p_cafe_id,
    greatest(coalesce(p_grace_days, 14), 0),
    v_cutoff,
    coalesce(nullif(btrim(p_requested_by), ''), 'system'),
    'pending',
    v_plan,
    coalesce(p_request_json, '{}'::jsonb),
    now() + interval '24 hours'
  ) returning id, expires_at into v_approval_id, v_expires_at;

  return jsonb_build_object(
    'ok', true,
    'approval_required', true,
    'approval_id', v_approval_id,
    'archive_before_date', v_cutoff,
    'grace_days', greatest(coalesce(p_grace_days, 14), 0),
    'expires_at', v_expires_at,
    'plan', v_plan
  );
end;
$$;

create or replace function public.ops_post_archive_runtime_check(
  p_cafe_id uuid,
  p_archive_before_date date,
  p_shift_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, archive
as $$
declare
  v_result jsonb;
begin
  with target_shifts as (
    select s.id, s.business_date
    from ops.shifts s
    where s.cafe_id = p_cafe_id
      and s.detail_archived_at is not null
      and s.business_date <= p_archive_before_date
      and (
        p_shift_ids is null
        or coalesce(array_length(p_shift_ids, 1), 0) = 0
        or s.id = any(p_shift_ids)
      )
  ),
  target_days as (
    select distinct business_date
    from target_shifts
  ),
  target_weeks as (
    select distinct date_trunc('week', business_date::timestamp)::date as week_start_date
    from target_days
  ),
  target_months as (
    select distinct date_trunc('month', business_date::timestamp)::date as month_start_date
    from target_days
  ),
  target_years as (
    select distinct date_trunc('year', business_date::timestamp)::date as year_start_date
    from target_days
  ),
  lingering as (
    select jsonb_build_object(
      'service_sessions', (
        select count(*)::int
        from ops.service_sessions ss
        join target_shifts ts on ts.id = ss.shift_id
        where ss.cafe_id = p_cafe_id
      ),
      'orders', (
        select count(*)::int
        from ops.orders o
        join target_shifts ts on ts.id = o.shift_id
        where o.cafe_id = p_cafe_id
      ),
      'order_items', (
        select count(*)::int
        from ops.order_items oi
        join target_shifts ts on ts.id = oi.shift_id
        where oi.cafe_id = p_cafe_id
      ),
      'fulfillment_events', (
        select count(*)::int
        from ops.fulfillment_events fe
        join target_shifts ts on ts.id = fe.shift_id
        where fe.cafe_id = p_cafe_id
      ),
      'payments', (
        select count(*)::int
        from ops.payments p
        join target_shifts ts on ts.id = p.shift_id
        where p.cafe_id = p_cafe_id
      ),
      'payment_allocations', (
        select count(*)::int
        from ops.payment_allocations pa
        join ops.payments p on p.cafe_id = pa.cafe_id and p.id = pa.payment_id
        join target_shifts ts on ts.id = p.shift_id
        where pa.cafe_id = p_cafe_id
      ),
      'complaints', (
        select count(*)::int
        from ops.complaints c
        join target_shifts ts on ts.id = c.shift_id
        where c.cafe_id = p_cafe_id
      ),
      'order_item_issues', (
        select count(*)::int
        from ops.order_item_issues i
        join target_shifts ts on ts.id = i.shift_id
        where i.cafe_id = p_cafe_id
      )
    ) as value
  ),
  missing_daily as (
    select coalesce(jsonb_agg(td.business_date order by td.business_date), '[]'::jsonb) as value
    from target_days td
    where not exists (
      select 1
      from ops.daily_snapshots ds
      where ds.cafe_id = p_cafe_id
        and ds.business_date = td.business_date
        and ds.is_finalized = true
    )
  ),
  missing_weekly as (
    select coalesce(jsonb_agg(tw.week_start_date order by tw.week_start_date), '[]'::jsonb) as value
    from target_weeks tw
    where not exists (
      select 1
      from ops.weekly_summaries ws
      where ws.cafe_id = p_cafe_id
        and ws.week_start_date = tw.week_start_date
    )
  ),
  missing_monthly as (
    select coalesce(jsonb_agg(tm.month_start_date order by tm.month_start_date), '[]'::jsonb) as value
    from target_months tm
    where not exists (
      select 1
      from ops.monthly_summaries ms
      where ms.cafe_id = p_cafe_id
        and ms.month_start_date = tm.month_start_date
    )
  ),
  missing_yearly as (
    select coalesce(jsonb_agg(ty.year_start_date order by ty.year_start_date), '[]'::jsonb) as value
    from target_years ty
    where not exists (
      select 1
      from ops.yearly_summaries ys
      where ys.cafe_id = p_cafe_id
        and ys.year_start_date = ty.year_start_date
    )
  ),
  counts as (
    select count(*)::int as target_shift_count from target_shifts
  ),
  day_counts as (
    select count(*)::int as target_day_count from target_days
  )
  select jsonb_build_object(
    'ok', (
      coalesce((select sum((value)::int) from jsonb_each_text((select value from lingering))), 0) = 0
      and jsonb_array_length((select value from missing_daily)) = 0
      and jsonb_array_length((select value from missing_weekly)) = 0
      and jsonb_array_length((select value from missing_monthly)) = 0
      and jsonb_array_length((select value from missing_yearly)) = 0
    ),
    'archive_before_date', p_archive_before_date,
    'target_shift_count', (select target_shift_count from counts),
    'target_day_count', (select target_day_count from day_counts),
    'lingering_runtime_rows', (select value from lingering),
    'missing_daily_finalized_snapshots', (select value from missing_daily),
    'missing_weekly_summaries', (select value from missing_weekly),
    'missing_monthly_summaries', (select value from missing_monthly),
    'missing_yearly_summaries', (select value from missing_yearly)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.ops_execute_archive_execution_approval(
  p_approval_id uuid,
  p_approved_by text default 'manual',
  p_request_json jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, archive
as $$
declare
  v_approval ops.archive_execution_approvals%rowtype;
  v_fresh_plan jsonb;
  v_execution jsonb;
  v_post_check jsonb;
  v_shift_ids uuid[];
  v_ok boolean;
begin
  if p_approval_id is null then
    raise exception 'p_approval_id is required';
  end if;

  select *
  into v_approval
  from ops.archive_execution_approvals
  where id = p_approval_id
  for update;

  if not found then
    raise exception 'ARCHIVE_APPROVAL_NOT_FOUND';
  end if;

  if v_approval.status <> 'pending' then
    raise exception 'ARCHIVE_APPROVAL_NOT_PENDING';
  end if;

  if v_approval.expires_at < now() then
    update ops.archive_execution_approvals
    set status = 'expired',
        invalidated_at = now(),
        stale_reason = 'approval_expired_before_execution'
    where id = p_approval_id;
    raise exception 'ARCHIVE_APPROVAL_EXPIRED';
  end if;

  v_fresh_plan := public.ops_archive_closed_data(
    v_approval.cafe_id,
    v_approval.archive_before_date,
    true,
    true
  );

  if coalesce((v_fresh_plan ->> 'shift_count')::integer, 0) <> coalesce((v_approval.plan_result_json ->> 'shift_count')::integer, 0)
     or coalesce(v_fresh_plan -> 'daily_snapshot_dates', '[]'::jsonb) <> coalesce(v_approval.plan_result_json -> 'daily_snapshot_dates', '[]'::jsonb)
     or coalesce(v_fresh_plan -> 'weekly_summary_weeks', '[]'::jsonb) <> coalesce(v_approval.plan_result_json -> 'weekly_summary_weeks', '[]'::jsonb)
     or coalesce(v_fresh_plan -> 'monthly_summary_months', '[]'::jsonb) <> coalesce(v_approval.plan_result_json -> 'monthly_summary_months', '[]'::jsonb)
     or coalesce(v_fresh_plan -> 'yearly_summary_years', '[]'::jsonb) <> coalesce(v_approval.plan_result_json -> 'yearly_summary_years', '[]'::jsonb)
  then
    update ops.archive_execution_approvals
    set status = 'stale',
        invalidated_at = now(),
        stale_reason = 'eligible_shift_window_changed_before_execution',
        request_json = coalesce(request_json, '{}'::jsonb) || jsonb_build_object(
          'fresh_plan', v_fresh_plan,
          'execute_request', coalesce(p_request_json, '{}'::jsonb)
        )
    where id = p_approval_id;

    return jsonb_build_object(
      'ok', false,
      'reason', 'APPROVAL_STALE_REPLAN_REQUIRED',
      'approval_id', p_approval_id,
      'stored_plan', v_approval.plan_result_json,
      'fresh_plan', v_fresh_plan
    );
  end if;

  select coalesce(array_agg(s.id order by s.business_date, s.opened_at), '{}'::uuid[])
  into v_shift_ids
  from ops.shifts s
  join ops.daily_snapshots ds
    on ds.cafe_id = s.cafe_id
   and ds.business_date = s.business_date
   and ds.is_finalized = true
  where s.cafe_id = v_approval.cafe_id
    and s.status = 'closed'
    and s.business_date <= v_approval.archive_before_date
    and s.detail_archived_at is null;

  v_execution := public.ops_archive_closed_data(
    v_approval.cafe_id,
    v_approval.archive_before_date,
    true,
    false
  );

  v_post_check := public.ops_post_archive_runtime_check(
    v_approval.cafe_id,
    v_approval.archive_before_date,
    v_shift_ids
  );

  v_ok := coalesce((v_execution ->> 'ok')::boolean, false)
    and coalesce((v_post_check ->> 'ok')::boolean, false);

  update ops.archive_execution_approvals
  set approved_by = coalesce(nullif(btrim(p_approved_by), ''), 'manual'),
      approved_at = now(),
      executed_at = now(),
      execution_result_json = v_execution,
      post_check_json = v_post_check,
      request_json = coalesce(request_json, '{}'::jsonb) || jsonb_build_object(
        'execute_request', coalesce(p_request_json, '{}'::jsonb)
      ),
      status = case when v_ok then 'executed' else 'failed_post_check' end
  where id = p_approval_id;

  return jsonb_build_object(
    'ok', v_ok,
    'approval_id', p_approval_id,
    'archive_before_date', v_approval.archive_before_date,
    'execution', v_execution,
    'post_check', v_post_check
  );
exception
  when others then
    update ops.archive_execution_approvals
    set status = 'failed',
        invalidated_at = now(),
        stale_reason = sqlerrm,
        request_json = coalesce(request_json, '{}'::jsonb) || jsonb_build_object(
          'execute_request', coalesce(p_request_json, '{}'::jsonb)
        )
    where id = p_approval_id;
    raise;
end;
$$;

commit;
-- <<< 0031_archive_approval_and_post_archive_checks.sql

-- >>> 0032_deferred_finance_non_archival_policy.sql
begin;

create or replace function public.ops_assert_deferred_finance_non_archival_policy()
returns jsonb
language plpgsql
security definer
set search_path = public, ops, archive
as $$
declare
  v_issues text[] := '{}'::text[];
  v_session_confdel "char";
  v_payment_confdel "char";
  v_result jsonb;
begin
  if to_regclass('ops.deferred_ledger_entries') is null then
    v_issues := array_append(v_issues, 'ops.deferred_ledger_entries_missing');
  end if;

  if to_regclass('ops.deferred_customer_balances') is null then
    v_issues := array_append(v_issues, 'ops.deferred_customer_balances_missing');
  end if;

  if to_regclass('archive.deferred_ledger_entries') is not null then
    v_issues := array_append(v_issues, 'archive.deferred_ledger_entries_must_not_exist');
  end if;

  if to_regclass('archive.deferred_customer_balances') is not null then
    v_issues := array_append(v_issues, 'archive.deferred_customer_balances_must_not_exist');
  end if;

  select c.confdeltype
  into v_session_confdel
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'ops'
    and t.relname = 'deferred_ledger_entries'
    and c.conname = 'fk_deferred_session';

  if coalesce(v_session_confdel::text, '') <> 'n' then
    v_issues := array_append(v_issues, 'fk_deferred_session_must_use_on_delete_set_null');
  end if;

  select c.confdeltype
  into v_payment_confdel
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'ops'
    and t.relname = 'deferred_ledger_entries'
    and c.conname = 'fk_deferred_payment';

  if coalesce(v_payment_confdel::text, '') <> 'n' then
    v_issues := array_append(v_issues, 'fk_deferred_payment_must_use_on_delete_set_null');
  end if;

  v_result := jsonb_build_object(
    'ok', coalesce(array_length(v_issues, 1), 0) = 0,
    'policy', 'deferred_ledger_live_non_archival',
    'issues', to_jsonb(coalesce(v_issues, '{}'::text[])),
    'deferred_ledger_entries_table', coalesce(to_regclass('ops.deferred_ledger_entries')::text, null),
    'deferred_customer_balances_table', coalesce(to_regclass('ops.deferred_customer_balances')::text, null),
    'archive_deferred_ledger_entries_table', coalesce(to_regclass('archive.deferred_ledger_entries')::text, null),
    'archive_deferred_customer_balances_table', coalesce(to_regclass('archive.deferred_customer_balances')::text, null),
    'fk_deferred_session_on_delete', case when v_session_confdel = 'n' then 'set_null' else coalesce(v_session_confdel::text, 'missing') end,
    'fk_deferred_payment_on_delete', case when v_payment_confdel = 'n' then 'set_null' else coalesce(v_payment_confdel::text, 'missing') end,
    'checked_at', now()
  );

  return v_result;
end;
$$;

create or replace function public.ops_post_archive_runtime_check(
  p_cafe_id uuid,
  p_archive_before_date date,
  p_shift_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, archive
as $$
declare
  v_result jsonb;
  v_policy jsonb;
begin
  v_policy := public.ops_assert_deferred_finance_non_archival_policy();

  with target_shifts as (
    select s.id, s.business_date
    from ops.shifts s
    where s.cafe_id = p_cafe_id
      and s.detail_archived_at is not null
      and s.business_date <= p_archive_before_date
      and (
        p_shift_ids is null
        or coalesce(array_length(p_shift_ids, 1), 0) = 0
        or s.id = any(p_shift_ids)
      )
  ),
  target_days as (
    select distinct business_date
    from target_shifts
  ),
  target_weeks as (
    select distinct date_trunc('week', business_date::timestamp)::date as week_start_date
    from target_days
  ),
  target_months as (
    select distinct date_trunc('month', business_date::timestamp)::date as month_start_date
    from target_days
  ),
  target_years as (
    select distinct date_trunc('year', business_date::timestamp)::date as year_start_date
    from target_days
  ),
  lingering as (
    select jsonb_build_object(
      'service_sessions', (
        select count(*)::int
        from ops.service_sessions ss
        join target_shifts ts on ts.id = ss.shift_id
        where ss.cafe_id = p_cafe_id
      ),
      'orders', (
        select count(*)::int
        from ops.orders o
        join target_shifts ts on ts.id = o.shift_id
        where o.cafe_id = p_cafe_id
      ),
      'order_items', (
        select count(*)::int
        from ops.order_items oi
        join target_shifts ts on ts.id = oi.shift_id
        where oi.cafe_id = p_cafe_id
      ),
      'fulfillment_events', (
        select count(*)::int
        from ops.fulfillment_events fe
        join target_shifts ts on ts.id = fe.shift_id
        where fe.cafe_id = p_cafe_id
      ),
      'payments', (
        select count(*)::int
        from ops.payments p
        join target_shifts ts on ts.id = p.shift_id
        where p.cafe_id = p_cafe_id
      ),
      'payment_allocations', (
        select count(*)::int
        from ops.payment_allocations pa
        join ops.payments p on p.cafe_id = pa.cafe_id and p.id = pa.payment_id
        join target_shifts ts on ts.id = p.shift_id
        where pa.cafe_id = p_cafe_id
      ),
      'complaints', (
        select count(*)::int
        from ops.complaints c
        join target_shifts ts on ts.id = c.shift_id
        where c.cafe_id = p_cafe_id
      ),
      'order_item_issues', (
        select count(*)::int
        from ops.order_item_issues i
        join target_shifts ts on ts.id = i.shift_id
        where i.cafe_id = p_cafe_id
      )
    ) as value
  ),
  missing_daily as (
    select coalesce(jsonb_agg(td.business_date order by td.business_date), '[]'::jsonb) as value
    from target_days td
    where not exists (
      select 1
      from ops.daily_snapshots ds
      where ds.cafe_id = p_cafe_id
        and ds.business_date = td.business_date
        and ds.is_finalized = true
    )
  ),
  missing_weekly as (
    select coalesce(jsonb_agg(tw.week_start_date order by tw.week_start_date), '[]'::jsonb) as value
    from target_weeks tw
    where not exists (
      select 1
      from ops.weekly_summaries ws
      where ws.cafe_id = p_cafe_id
        and ws.week_start_date = tw.week_start_date
    )
  ),
  missing_monthly as (
    select coalesce(jsonb_agg(tm.month_start_date order by tm.month_start_date), '[]'::jsonb) as value
    from target_months tm
    where not exists (
      select 1
      from ops.monthly_summaries ms
      where ms.cafe_id = p_cafe_id
        and ms.month_start_date = tm.month_start_date
    )
  ),
  missing_yearly as (
    select coalesce(jsonb_agg(ty.year_start_date order by ty.year_start_date), '[]'::jsonb) as value
    from target_years ty
    where not exists (
      select 1
      from ops.yearly_summaries ys
      where ys.cafe_id = p_cafe_id
        and ys.year_start_date = ty.year_start_date
    )
  ),
  counts as (
    select count(*)::int as target_shift_count from target_shifts
  ),
  day_counts as (
    select count(*)::int as target_day_count from target_days
  ),
  deferred_live_finance as (
    select jsonb_build_object(
      'deferred_ledger_entry_count', (
        select count(*)::int
        from ops.deferred_ledger_entries dle
        where dle.cafe_id = p_cafe_id
      ),
      'deferred_customer_balance_count', (
        select count(*)::int
        from ops.deferred_customer_balances dcb
        where dcb.cafe_id = p_cafe_id
      )
    ) as value
  )
  select jsonb_build_object(
    'ok', (
      coalesce((select sum((value)::int) from jsonb_each_text((select value from lingering))), 0) = 0
      and jsonb_array_length((select value from missing_daily)) = 0
      and jsonb_array_length((select value from missing_weekly)) = 0
      and jsonb_array_length((select value from missing_monthly)) = 0
      and jsonb_array_length((select value from missing_yearly)) = 0
      and coalesce((v_policy ->> 'ok')::boolean, false)
    ),
    'archive_before_date', p_archive_before_date,
    'target_shift_count', (select target_shift_count from counts),
    'target_day_count', (select target_day_count from day_counts),
    'lingering_runtime_rows', (select value from lingering),
    'missing_daily_finalized_snapshots', (select value from missing_daily),
    'missing_weekly_summaries', (select value from missing_weekly),
    'missing_monthly_summaries', (select value from missing_monthly),
    'missing_yearly_summaries', (select value from missing_yearly),
    'deferred_live_finance', (select value from deferred_live_finance),
    'deferred_finance_policy', v_policy
  ) into v_result;

  return v_result;
end;
$$;

commit;
-- <<< 0032_deferred_finance_non_archival_policy.sql

-- >>> 0033_search_path_security_hardening.sql
begin;

create or replace function app.current_cafe_id()
returns uuid
language sql
stable
set search_path = pg_catalog
as $$
  select nullif(
    coalesce(
      pg_catalog.current_setting('app.current_cafe_id', true),
      pg_catalog.current_setting('app.current_tenant_id', true)
    ),
    ''
  )::uuid
$$;

create or replace function ops.generate_session_label()
returns text
language sql
set search_path = pg_catalog
as $$
  select 'S-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 6));
$$;

commit;
-- <<< 0033_search_path_security_hardening.sql

-- >>> 0040_ops_atomic_shift_open_with_assignments.sql
begin;

create or replace function public.ops_open_shift_with_assignments(
  p_cafe_id uuid,
  p_shift_kind text,
  p_business_date date,
  p_opened_by_owner_id uuid,
  p_notes text default null,
  p_assignments jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_shift_payload jsonb;
  v_shift_id uuid;
  v_mode text;
  v_assignments jsonb := coalesce(p_assignments, '[]'::jsonb);
  v_item jsonb;
  v_role text;
  v_actor_type text;
  v_staff_member_id uuid;
  v_owner_user_id uuid;
  v_existing_assignment_id uuid;
  v_supervisor_count integer := 0;
  v_barista_count integer := 0;
  v_assignment_keys text[] := array[]::text[];
  v_assignment_key text;
begin
  if p_cafe_id is null then
    raise exception 'cafe_id_required';
  end if;

  if p_shift_kind not in ('morning', 'evening') then
    raise exception 'invalid_shift_kind';
  end if;

  if p_business_date is null then
    raise exception 'business_date_required';
  end if;

  if p_opened_by_owner_id is null then
    raise exception 'opened_by_owner_id_required';
  end if;

  if jsonb_typeof(v_assignments) <> 'array' then
    raise exception 'assignments_must_be_array';
  end if;

  if not exists (
    select 1
    from ops.owner_users ou
    where ou.cafe_id = p_cafe_id
      and ou.id = p_opened_by_owner_id
      and ou.is_active = true
  ) then
    raise exception 'opened_by_owner_not_active';
  end if;

  for v_item in select value from jsonb_array_elements(v_assignments)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'invalid_assignment_payload';
    end if;

    v_role := lower(nullif(btrim(v_item->>'role'), ''));
    v_actor_type := lower(coalesce(nullif(btrim(v_item->>'actorType'), ''), 'staff'));

    if v_role not in ('supervisor', 'waiter', 'barista', 'shisha') then
      raise exception 'invalid_role_code';
    end if;

    v_staff_member_id := nullif(
      btrim(
        coalesce(
          v_item->>'staff_member_id',
          case when v_actor_type = 'staff' then v_item->>'userId' else null end,
          ''
        )
      ),
      ''
    )::uuid;
    v_owner_user_id := nullif(
      btrim(
        coalesce(
          v_item->>'owner_user_id',
          case when v_actor_type = 'owner' then v_item->>'userId' else null end,
          ''
        )
      ),
      ''
    )::uuid;

    if (v_staff_member_id is null and v_owner_user_id is null)
      or (v_staff_member_id is not null and v_owner_user_id is not null) then
      raise exception 'exactly_one_actor_required';
    end if;

    if v_staff_member_id is not null then
      if not exists (
        select 1
        from ops.staff_members sm
        where sm.cafe_id = p_cafe_id
          and sm.id = v_staff_member_id
          and sm.is_active = true
          and sm.employment_status = 'active'
      ) then
        raise exception 'staff_member_not_active';
      end if;
    end if;

    if v_owner_user_id is not null then
      if not exists (
        select 1
        from ops.owner_users ou
        where ou.cafe_id = p_cafe_id
          and ou.id = v_owner_user_id
          and ou.is_active = true
      ) then
        raise exception 'owner_user_not_active';
      end if;
    end if;

    if v_role = 'supervisor' then
      v_supervisor_count := v_supervisor_count + 1;
    elsif v_role = 'barista' then
      v_barista_count := v_barista_count + 1;
    end if;

    v_assignment_key := v_role || ':' || coalesce(v_staff_member_id::text, 'owner:' || v_owner_user_id::text);
    if v_assignment_key = any(v_assignment_keys) then
      raise exception 'duplicate_shift_assignment';
    end if;
    v_assignment_keys := array_append(v_assignment_keys, v_assignment_key);
  end loop;

  if v_supervisor_count <> 1 then
    raise exception 'supervisor_required';
  end if;

  if v_barista_count > 1 then
    raise exception 'multiple_baristas_not_allowed';
  end if;

  v_shift_payload := public.ops_open_shift(
    p_cafe_id,
    p_shift_kind,
    p_business_date,
    p_opened_by_owner_id,
    p_notes
  );

  v_shift_id := nullif(v_shift_payload->>'shift_id', '')::uuid;
  v_mode := coalesce(nullif(v_shift_payload->>'mode', ''), 'created');

  if v_shift_id is null then
    raise exception 'shift_open_failed';
  end if;

  update ops.shift_role_assignments
  set is_active = false
  where cafe_id = p_cafe_id
    and shift_id = v_shift_id
    and is_active = true;

  for v_item in select value from jsonb_array_elements(v_assignments)
  loop
    v_role := lower(nullif(btrim(v_item->>'role'), ''));
    v_actor_type := lower(coalesce(nullif(btrim(v_item->>'actorType'), ''), 'staff'));

    v_staff_member_id := nullif(
      btrim(
        coalesce(
          v_item->>'staff_member_id',
          case when v_actor_type = 'staff' then v_item->>'userId' else null end,
          ''
        )
      ),
      ''
    )::uuid;
    v_owner_user_id := nullif(
      btrim(
        coalesce(
          v_item->>'owner_user_id',
          case when v_actor_type = 'owner' then v_item->>'userId' else null end,
          ''
        )
      ),
      ''
    )::uuid;

    select sra.id
    into v_existing_assignment_id
    from ops.shift_role_assignments sra
    where sra.cafe_id = p_cafe_id
      and sra.shift_id = v_shift_id
      and sra.role_code = v_role
      and sra.staff_member_id is not distinct from v_staff_member_id
      and sra.owner_user_id is not distinct from v_owner_user_id
    order by sra.assigned_at desc, sra.id desc
    limit 1;

    if v_existing_assignment_id is not null then
      update ops.shift_role_assignments
      set is_active = true,
          assigned_at = now()
      where id = v_existing_assignment_id;
    else
      insert into ops.shift_role_assignments (
        cafe_id,
        shift_id,
        role_code,
        staff_member_id,
        owner_user_id,
        is_active,
        assigned_at
      )
      values (
        p_cafe_id,
        v_shift_id,
        v_role,
        v_staff_member_id,
        v_owner_user_id,
        true,
        now()
      );
    end if;
  end loop;

  return jsonb_build_object(
    'shift_id', v_shift_id,
    'mode', v_mode,
    'assignment_count', jsonb_array_length(v_assignments)
  );
end;
$$;

commit;
-- <<< 0040_ops_atomic_shift_open_with_assignments.sql

-- >>> 0042_owner_password_setup_runtime_readiness.sql
begin;

alter table ops.owner_users
  alter column password_hash drop not null;

alter table ops.owner_users
  add column if not exists password_state text;

update ops.owner_users
set password_state = case
  when password_hash is null then 'setup_pending'
  else 'ready'
end
where password_state is null;

alter table ops.owner_users
  alter column password_state set default 'ready';

alter table ops.owner_users
  alter column password_state set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chk_ops_owner_users_password_state'
  ) then
    alter table ops.owner_users
      add constraint chk_ops_owner_users_password_state
      check (password_state in ('ready', 'setup_pending', 'reset_pending'));
  end if;
end;
$$;

create index if not exists idx_owner_users_cafe_password_state
  on ops.owner_users(cafe_id, password_state);

create or replace function public.ops_verify_owner_login(
  p_slug text,
  p_phone text,
  p_password text
)
returns table (
  cafe_id uuid,
  cafe_slug text,
  owner_user_id uuid,
  full_name text,
  owner_label text
)
language plpgsql
security definer
set search_path = public, ops
as $$
begin
  return query
  select
    c.id,
    c.slug,
    o.id,
    o.full_name,
    o.owner_label
  from ops.cafes c
  join ops.owner_users o
    on o.cafe_id = c.id
  where lower(btrim(c.slug)) = lower(btrim(p_slug))
    and c.is_active = true
    and o.is_active = true
    and o.password_state = 'ready'
    and o.password_hash is not null
    and btrim(o.phone) = btrim(p_phone)
    and extensions.crypt(p_password, o.password_hash) = o.password_hash
  limit 1;
end;
$$;

commit;
-- <<< 0042_owner_password_setup_runtime_readiness.sql

-- >>> 0045_remove_service_station_code.sql
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
-- <<< 0045_remove_service_station_code.sql

-- >>> 0046_owner_phone_normalization_uniqueness.sql
begin;

update ops.owner_users
set phone = btrim(phone)
where phone is distinct from btrim(phone);

do $$
begin
  if exists (
    select 1
    from ops.owner_users ou
    where ou.is_active = true
    group by ou.cafe_id, btrim(ou.phone)
    having count(*) > 1
  ) then
    raise exception 'owner_phone_normalization_conflict';
  end if;
end;
$$;

create unique index if not exists uq_owner_users_cafe_phone_trimmed_active
  on ops.owner_users (cafe_id, btrim(phone))
  where is_active = true;

commit;
-- <<< 0046_owner_phone_normalization_uniqueness.sql

-- >>> 0047_operational_api_grants.sql
begin;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema app to anon, authenticated, service_role;
grant usage on schema ops to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema ops to authenticated, service_role;
grant usage, select on all sequences in schema ops to authenticated, service_role;

grant execute on all functions in schema public to anon, authenticated, service_role;
grant execute on all functions in schema app to anon, authenticated, service_role;
grant execute on all functions in schema ops to anon, authenticated, service_role;

alter default privileges in schema ops
  grant select, insert, update, delete on tables to authenticated, service_role;

alter default privileges in schema ops
  grant usage, select on sequences to authenticated, service_role;

alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;

alter default privileges in schema app
  grant execute on functions to anon, authenticated, service_role;

alter default privileges in schema ops
  grant execute on functions to anon, authenticated, service_role;

commit;
-- <<< 0047_operational_api_grants.sql


-- >>> 0048_compound_billing_try_close.sql
begin;

create or replace function public.ops_try_close_service_session(
  p_cafe_id uuid,
  p_service_session_id uuid,
  p_by_staff_id uuid default null,
  p_by_owner_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_session ops.service_sessions%rowtype;
  v_waiting integer := 0;
  v_ready_undelivered integer := 0;
  v_billable integer := 0;
begin
  if (p_by_staff_id is null and p_by_owner_id is null)
     or (p_by_staff_id is not null and p_by_owner_id is not null) then
    raise exception 'Exactly one actor is required';
  end if;

  select *
  into v_session
  from ops.service_sessions
  where cafe_id = p_cafe_id
    and id = p_service_session_id
  for update;

  if not found then
    raise exception 'service_session not found';
  end if;

  select
    coalesce(sum(
      greatest(qty_submitted - least(qty_ready, qty_submitted) - qty_cancelled, 0)
      + greatest(qty_remade - greatest(qty_ready - least(qty_ready, qty_submitted), 0), 0)
    ), 0),
    coalesce(sum(
      greatest(least(qty_ready, qty_total - qty_cancelled) - qty_delivered, 0)
      + greatest(qty_ready - least(qty_ready, qty_total - qty_cancelled) - qty_replacement_delivered, 0)
    ), 0),
    coalesce(sum(greatest(qty_delivered - qty_paid - qty_deferred - qty_waived, 0)), 0)
  into v_waiting, v_ready_undelivered, v_billable
  from ops.order_items
  where cafe_id = p_cafe_id
    and service_session_id = p_service_session_id;

  if v_session.status <> 'open' then
    return jsonb_build_object(
      'ok', true,
      'closed', false,
      'service_session_id', p_service_session_id,
      'status', v_session.status,
      'waiting_qty', v_waiting,
      'ready_undelivered_qty', v_ready_undelivered,
      'billable_qty', v_billable,
      'reason', 'already_closed'
    );
  end if;

  if v_waiting > 0 or v_ready_undelivered > 0 or v_billable > 0 then
    return jsonb_build_object(
      'ok', true,
      'closed', false,
      'service_session_id', p_service_session_id,
      'status', 'open',
      'waiting_qty', v_waiting,
      'ready_undelivered_qty', v_ready_undelivered,
      'billable_qty', v_billable,
      'reason', 'blocked'
    );
  end if;

  update ops.service_sessions
  set status = 'closed',
      closed_at = now(),
      closed_by_staff_id = p_by_staff_id,
      closed_by_owner_id = p_by_owner_id,
      notes = coalesce(p_notes, notes)
  where cafe_id = p_cafe_id
    and id = p_service_session_id;

  update ops.orders
  set status = 'completed'
  where cafe_id = p_cafe_id
    and service_session_id = p_service_session_id
    and status <> 'cancelled';

  return jsonb_build_object(
    'ok', true,
    'closed', true,
    'service_session_id', p_service_session_id,
    'status', 'closed',
    'waiting_qty', 0,
    'ready_undelivered_qty', 0,
    'billable_qty', 0
  );
end;
$$;

create or replace function public.ops_settle_selected_quantities_and_try_close_session(
  p_cafe_id uuid,
  p_shift_id uuid,
  p_service_session_id uuid,
  p_lines jsonb,
  p_by_staff_id uuid default null,
  p_by_owner_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_payment jsonb;
  v_close jsonb;
begin
  v_payment := public.ops_settle_selected_quantities(
    p_cafe_id,
    p_shift_id,
    p_service_session_id,
    p_lines,
    p_by_staff_id,
    p_by_owner_id,
    p_notes
  );

  v_close := public.ops_try_close_service_session(
    p_cafe_id,
    p_service_session_id,
    p_by_staff_id,
    p_by_owner_id,
    p_notes
  );

  return jsonb_build_object(
    'ok', true,
    'payment_id', v_payment ->> 'payment_id',
    'total_quantity', coalesce((v_payment ->> 'total_quantity')::integer, 0),
    'total_amount', coalesce((v_payment ->> 'total_amount')::numeric(12,2), 0),
    'service_session_id', p_service_session_id,
    'session_closed', coalesce((v_close ->> 'closed')::boolean, false),
    'session_status', coalesce(v_close ->> 'status', 'open'),
    'waiting_qty', coalesce((v_close ->> 'waiting_qty')::integer, 0),
    'ready_undelivered_qty', coalesce((v_close ->> 'ready_undelivered_qty')::integer, 0),
    'billable_qty', coalesce((v_close ->> 'billable_qty')::integer, 0)
  );
end;
$$;

create or replace function public.ops_defer_selected_quantities_and_try_close_session(
  p_cafe_id uuid,
  p_shift_id uuid,
  p_service_session_id uuid,
  p_debtor_name text,
  p_lines jsonb,
  p_by_staff_id uuid default null,
  p_by_owner_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_payment jsonb;
  v_close jsonb;
begin
  v_payment := public.ops_defer_selected_quantities(
    p_cafe_id,
    p_shift_id,
    p_service_session_id,
    p_debtor_name,
    p_lines,
    p_by_staff_id,
    p_by_owner_id,
    p_notes
  );

  v_close := public.ops_try_close_service_session(
    p_cafe_id,
    p_service_session_id,
    p_by_staff_id,
    p_by_owner_id,
    p_notes
  );

  return jsonb_build_object(
    'ok', true,
    'payment_id', v_payment ->> 'payment_id',
    'debtor_name', coalesce(v_payment ->> 'debtor_name', p_debtor_name),
    'total_quantity', coalesce((v_payment ->> 'total_quantity')::integer, 0),
    'total_amount', coalesce((v_payment ->> 'total_amount')::numeric(12,2), 0),
    'service_session_id', p_service_session_id,
    'session_closed', coalesce((v_close ->> 'closed')::boolean, false),
    'session_status', coalesce(v_close ->> 'status', 'open'),
    'waiting_qty', coalesce((v_close ->> 'waiting_qty')::integer, 0),
    'ready_undelivered_qty', coalesce((v_close ->> 'ready_undelivered_qty')::integer, 0),
    'billable_qty', coalesce((v_close ->> 'billable_qty')::integer, 0)
  );
end;
$$;

commit;
-- <<< 0048_compound_billing_try_close.sql

-- >>> 0049_reporting_and_idempotency_rls.sql
begin;

alter table ops.idempotency_keys enable row level security;
drop policy if exists cafe_access_policy on ops.idempotency_keys;
create policy cafe_access_policy on ops.idempotency_keys
for all
using (app.can_access_cafe(cafe_id))
with check (app.can_access_cafe(cafe_id));

alter table ops.daily_snapshots enable row level security;
drop policy if exists cafe_access_policy on ops.daily_snapshots;
create policy cafe_access_policy on ops.daily_snapshots
for all
using (app.can_access_cafe(cafe_id))
with check (app.can_access_cafe(cafe_id));

alter table ops.weekly_summaries enable row level security;
drop policy if exists cafe_access_policy on ops.weekly_summaries;
create policy cafe_access_policy on ops.weekly_summaries
for all
using (app.can_access_cafe(cafe_id))
with check (app.can_access_cafe(cafe_id));

alter table ops.monthly_summaries enable row level security;
drop policy if exists cafe_access_policy on ops.monthly_summaries;
create policy cafe_access_policy on ops.monthly_summaries
for all
using (app.can_access_cafe(cafe_id))
with check (app.can_access_cafe(cafe_id));

alter table ops.yearly_summaries enable row level security;
drop policy if exists cafe_access_policy on ops.yearly_summaries;
create policy cafe_access_policy on ops.yearly_summaries
for all
using (app.can_access_cafe(cafe_id))
with check (app.can_access_cafe(cafe_id));

alter table ops.archive_execution_approvals enable row level security;
drop policy if exists cafe_access_policy on ops.archive_execution_approvals;
create policy cafe_access_policy on ops.archive_execution_approvals
for all
using (app.can_access_cafe(cafe_id))
with check (app.can_access_cafe(cafe_id));

alter table ops.deferred_customer_balances enable row level security;
drop policy if exists cafe_access_policy on ops.deferred_customer_balances;
create policy cafe_access_policy on ops.deferred_customer_balances
for all
using (app.can_access_cafe(cafe_id))
with check (app.can_access_cafe(cafe_id));

alter table ops.reporting_maintenance_runs enable row level security;
drop policy if exists cafe_access_policy on ops.reporting_maintenance_runs;
create policy cafe_access_policy on ops.reporting_maintenance_runs
for all
using (cafe_id is not null and app.can_access_cafe(cafe_id))
with check (cafe_id is not null and app.can_access_cafe(cafe_id));

commit;
-- <<< 0049_reporting_and_idempotency_rls.sql
