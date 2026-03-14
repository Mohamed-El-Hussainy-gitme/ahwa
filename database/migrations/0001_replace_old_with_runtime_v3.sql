begin;

create extension if not exists pgcrypto;

drop schema if exists app cascade;
drop schema if exists platform cascade;
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
  station_code text not null check (station_code in ('barista', 'shisha', 'service')),
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
  station_code text not null check (station_code in ('barista', 'shisha', 'service')),
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
  station_code text not null check (station_code in ('barista', 'shisha', 'service')),
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
  station_code text not null check (station_code in ('barista', 'shisha', 'service')),
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
