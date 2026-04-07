-- AUTO-GENERATED FILE. DO NOT EDIT DIRECTLY.
-- Regenerate with: npm run build:db-baselines

-- >>> 0001_replace_old_with_runtime_v3.sql
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
-- <<< 0001_replace_old_with_runtime_v3.sql

-- >>> 0002_phase2_bootstrap_and_ops.sql
create extension if not exists pgcrypto;

create or replace function public.ops_bootstrap_cafe_owner(
  p_slug text,
  p_display_name text,
  p_owner_name text,
  p_owner_phone text,
  p_owner_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_cafe_id uuid;
  v_owner_id uuid;
begin
  if coalesce(trim(p_slug), '') = '' then
    raise exception 'slug_required';
  end if;
  if coalesce(trim(p_display_name), '') = '' then
    raise exception 'display_name_required';
  end if;
  if coalesce(trim(p_owner_name), '') = '' then
    raise exception 'owner_name_required';
  end if;
  if coalesce(trim(p_owner_phone), '') = '' then
    raise exception 'owner_phone_required';
  end if;
  if coalesce(trim(p_owner_password), '') = '' then
    raise exception 'owner_password_required';
  end if;

  insert into ops.cafes (slug, display_name)
  values (trim(lower(p_slug)), trim(p_display_name))
  returning id into v_cafe_id;

  insert into ops.owner_users (cafe_id, full_name, phone, password_hash)
  values (
    v_cafe_id,
    trim(p_owner_name),
    trim(p_owner_phone),
    crypt(p_owner_password, gen_salt('bf'))
  )
  returning id into v_owner_id;

  return jsonb_build_object(
    'cafe_id', v_cafe_id,
    'owner_user_id', v_owner_id,
    'slug', trim(lower(p_slug))
  );
end;
$$;

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
  if p_station_code not in ('barista', 'shisha', 'service') then
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
  if p_station_code not in ('barista', 'shisha', 'service') then
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

create schema if not exists platform;

create table if not exists platform.super_admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text not null,
  password_hash text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists platform.support_access_grants (
  id uuid primary key default gen_random_uuid(),
  super_admin_user_id uuid not null references platform.super_admin_users(id) on delete cascade,
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  is_active boolean not null default true,
  notes text,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_platform_support_access_cafe
  on platform.support_access_grants(cafe_id, is_active, created_at desc);

create or replace function public.platform_create_super_admin_user(
  p_email text,
  p_display_name text,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, platform
as $$
declare
  v_email text;
  v_id uuid;
begin
  v_email := lower(nullif(btrim(p_email), ''));

  if v_email is null then
    raise exception 'p_email is required';
  end if;

  if nullif(btrim(p_display_name), '') is null then
    raise exception 'p_display_name is required';
  end if;

  if nullif(p_password, '') is null then
    raise exception 'p_password is required';
  end if;

  insert into platform.super_admin_users (
    email,
    display_name,
    password_hash
  )
  values (
    v_email,
    p_display_name,
    crypt(p_password, gen_salt('bf'))
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'super_admin_user_id', v_id,
    'email', v_email
  );
end;
$$;

create or replace function public.platform_create_cafe_with_owner(
  p_super_admin_user_id uuid,
  p_cafe_slug text,
  p_cafe_display_name text,
  p_owner_full_name text,
  p_owner_phone text,
  p_owner_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, platform
as $$
declare
  v_admin platform.super_admin_users%rowtype;
  v_cafe_id uuid;
  v_owner_id uuid;
  v_slug text;
begin
  select *
  into v_admin
  from platform.super_admin_users
  where id = p_super_admin_user_id
    and is_active = true;

  if not found then
    raise exception 'active super admin not found';
  end if;

  v_slug := lower(nullif(btrim(p_cafe_slug), ''));

  if v_slug is null then
    raise exception 'p_cafe_slug is required';
  end if;

  if nullif(btrim(p_cafe_display_name), '') is null then
    raise exception 'p_cafe_display_name is required';
  end if;

  if nullif(btrim(p_owner_full_name), '') is null then
    raise exception 'p_owner_full_name is required';
  end if;

  if nullif(btrim(p_owner_phone), '') is null then
    raise exception 'p_owner_phone is required';
  end if;

  if nullif(p_owner_password, '') is null then
    raise exception 'p_owner_password is required';
  end if;

  insert into ops.cafes (
    slug,
    display_name,
    is_active
  )
  values (
    v_slug,
    p_cafe_display_name,
    true
  )
  returning id into v_cafe_id;

  insert into ops.owner_users (
    cafe_id,
    full_name,
    phone,
    password_hash,
    is_active
  )
  values (
    v_cafe_id,
    p_owner_full_name,
    p_owner_phone,
    crypt(p_owner_password, gen_salt('bf')),
    true
  )
  returning id into v_owner_id;

  insert into ops.audit_events (
    cafe_id,
    actor_type,
    actor_label,
    event_code,
    entity_type,
    entity_id,
    payload
  )
  values (
    v_cafe_id,
    'super_admin',
    v_admin.email,
    'platform_create_cafe_with_owner',
    'cafe',
    v_cafe_id,
    jsonb_build_object(
      'owner_user_id', v_owner_id,
      'owner_phone', p_owner_phone
    )
  );

  return jsonb_build_object(
    'ok', true,
    'cafe_id', v_cafe_id,
    'owner_user_id', v_owner_id,
    'slug', v_slug
  );
end;
$$;

create or replace function public.platform_reset_owner_password(
  p_super_admin_user_id uuid,
  p_cafe_id uuid,
  p_owner_user_id uuid,
  p_new_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, platform
as $$
declare
  v_admin platform.super_admin_users%rowtype;
begin
  select *
  into v_admin
  from platform.super_admin_users
  where id = p_super_admin_user_id
    and is_active = true;

  if not found then
    raise exception 'active super admin not found';
  end if;

  if nullif(p_new_password, '') is null then
    raise exception 'p_new_password is required';
  end if;

  update ops.owner_users
  set password_hash = crypt(p_new_password, gen_salt('bf'))
  where cafe_id = p_cafe_id
    and id = p_owner_user_id;

  if not found then
    raise exception 'owner user not found';
  end if;

  insert into ops.audit_events (
    cafe_id,
    actor_type,
    actor_label,
    event_code,
    entity_type,
    entity_id,
    payload
  )
  values (
    p_cafe_id,
    'super_admin',
    v_admin.email,
    'platform_reset_owner_password',
    'owner_user',
    p_owner_user_id,
    '{}'::jsonb
  );

  return jsonb_build_object(
    'ok', true,
    'owner_user_id', p_owner_user_id
  );
end;
$$;

create or replace function public.platform_grant_support_access(
  p_super_admin_user_id uuid,
  p_cafe_id uuid,
  p_notes text default null,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, platform
as $$
declare
  v_admin platform.super_admin_users%rowtype;
  v_grant_id uuid;
begin
  select *
  into v_admin
  from platform.super_admin_users
  where id = p_super_admin_user_id
    and is_active = true;

  if not found then
    raise exception 'active super admin not found';
  end if;

  insert into platform.support_access_grants (
    super_admin_user_id,
    cafe_id,
    is_active,
    notes,
    expires_at
  )
  values (
    p_super_admin_user_id,
    p_cafe_id,
    true,
    p_notes,
    p_expires_at
  )
  returning id into v_grant_id;

  return jsonb_build_object(
    'ok', true,
    'support_access_grant_id', v_grant_id
  );
end;
$$;

create or replace function public.platform_list_cafes()
returns jsonb
language sql
security definer
set search_path = public, ops, platform
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
  from (
    select
      c.id,
      c.slug,
      c.display_name,
      c.is_active,
      c.created_at,
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', ou.id,
            'full_name', ou.full_name,
            'phone', ou.phone,
            'is_active', ou.is_active,
            'created_at', ou.created_at
          ) order by ou.created_at asc
        )
        from ops.owner_users ou
        where ou.cafe_id = c.id
      ) as owners
    from ops.cafes c
  ) x;
$$;

commit;
-- <<< 0004_complete_remaining_database.sql

-- >>> 0005_platform_auth_and_owner_listing.sql
begin;

create or replace function public.platform_verify_super_admin_login(
  p_email text,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, platform
as $$
declare
  v_user platform.super_admin_users%rowtype;
  v_email text;
begin
  v_email := lower(nullif(btrim(p_email), ''));

  if v_email is null then
    raise exception 'p_email is required';
  end if;

  if nullif(p_password, '') is null then
    raise exception 'p_password is required';
  end if;

  select *
  into v_user
  from platform.super_admin_users
  where email = v_email
    and is_active = true;

  if not found then
    raise exception 'BAD_CREDENTIALS';
  end if;

  if v_user.password_hash <> crypt(p_password, v_user.password_hash) then
    raise exception 'BAD_CREDENTIALS';
  end if;

  return jsonb_build_object(
    'ok', true,
    'super_admin_user_id', v_user.id,
    'email', v_user.email,
    'display_name', v_user.display_name
  );
end;
$$;

create or replace function public.platform_get_super_admin(
  p_super_admin_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, platform
as $$
declare
  v_user platform.super_admin_users%rowtype;
begin
  select *
  into v_user
  from platform.super_admin_users
  where id = p_super_admin_user_id
    and is_active = true;

  if not found then
    raise exception 'SUPER_ADMIN_NOT_FOUND';
  end if;

  return jsonb_build_object(
    'ok', true,
    'super_admin_user_id', v_user.id,
    'email', v_user.email,
    'display_name', v_user.display_name,
    'is_active', v_user.is_active,
    'created_at', v_user.created_at
  );
end;
$$;

create or replace function public.platform_list_owner_users(
  p_super_admin_user_id uuid,
  p_cafe_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, platform
as $$
declare
  v_admin platform.super_admin_users%rowtype;
begin
  select *
  into v_admin
  from platform.super_admin_users
  where id = p_super_admin_user_id
    and is_active = true;

  if not found then
    raise exception 'active super admin not found';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'owner_user_id', ou.id,
        'cafe_id', ou.cafe_id,
        'full_name', ou.full_name,
        'phone', ou.phone,
        'is_active', ou.is_active,
        'created_at', ou.created_at
      )
      order by ou.created_at desc
    )
    from ops.owner_users ou
    where ou.cafe_id = p_cafe_id
  ), '[]'::jsonb);
end;
$$;

commit;
-- <<< 0005_platform_auth_and_owner_listing.sql

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

create or replace function app.current_super_admin_user_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('platform.current_super_admin_user_id', true), '')::uuid
$$;

create or replace function app.has_platform_support_access(
  p_cafe_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, ops, platform, app
as $$
  select exists (
    select 1
    from platform.support_access_grants g
    where g.super_admin_user_id = app.current_super_admin_user_id()
      and g.cafe_id = p_cafe_id
      and g.is_active = true
      and g.revoked_at is null
      and (g.expires_at is null or g.expires_at > now())
  )
$$;

create or replace function app.can_access_cafe(
  p_cafe_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, ops, platform, app
as $$
  select p_cafe_id is not null
    and (
      app.current_cafe_id() = p_cafe_id
      or app.has_platform_support_access(p_cafe_id)
    )
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

  execute 'alter table platform.super_admin_users enable row level security';
  execute 'drop policy if exists super_admin_self_access on platform.super_admin_users';
  execute 'create policy super_admin_self_access on platform.super_admin_users for all using (id = app.current_super_admin_user_id()) with check (id = app.current_super_admin_user_id())';

  execute 'alter table platform.support_access_grants enable row level security';
  execute 'drop policy if exists super_admin_support_access on platform.support_access_grants';
  execute 'create policy super_admin_support_access on platform.support_access_grants for all using (super_admin_user_id = app.current_super_admin_user_id()) with check (super_admin_user_id = app.current_super_admin_user_id())';
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

create extension if not exists pgcrypto;

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

create extension if not exists pgcrypto;

create or replace function public.ops_bootstrap_cafe_owner(
  p_slug text,
  p_display_name text,
  p_owner_name text,
  p_owner_phone text,
  p_owner_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_cafe_id uuid;
  v_owner_id uuid;
begin
  if coalesce(trim(p_slug), '') = '' then
    raise exception 'slug_required';
  end if;
  if coalesce(trim(p_display_name), '') = '' then
    raise exception 'display_name_required';
  end if;
  if coalesce(trim(p_owner_name), '') = '' then
    raise exception 'owner_name_required';
  end if;
  if coalesce(trim(p_owner_phone), '') = '' then
    raise exception 'owner_phone_required';
  end if;
  if coalesce(trim(p_owner_password), '') = '' then
    raise exception 'owner_password_required';
  end if;

  insert into ops.cafes (slug, display_name)
  values (trim(lower(p_slug)), trim(p_display_name))
  returning id into v_cafe_id;

  insert into ops.owner_users (cafe_id, full_name, phone, password_hash)
  values (
    v_cafe_id,
    trim(p_owner_name),
    trim(p_owner_phone),
    extensions.crypt(p_owner_password, extensions.gen_salt('bf'))
  )
  returning id into v_owner_id;

  return jsonb_build_object(
    'cafe_id', v_cafe_id,
    'owner_user_id', v_owner_id,
    'slug', trim(lower(p_slug))
  );
end;
$$;

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

create or replace function public.platform_create_super_admin_user(
  p_email text,
  p_display_name text,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, platform
as $$
declare
  v_email text;
  v_id uuid;
begin
  v_email := lower(nullif(btrim(p_email), ''));

  if v_email is null then
    raise exception 'p_email is required';
  end if;

  if nullif(btrim(p_display_name), '') is null then
    raise exception 'p_display_name is required';
  end if;

  if nullif(p_password, '') is null then
    raise exception 'p_password is required';
  end if;

  insert into platform.super_admin_users (
    email,
    display_name,
    password_hash
  )
  values (
    v_email,
    p_display_name,
    extensions.crypt(p_password, extensions.gen_salt('bf'))
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'super_admin_user_id', v_id,
    'email', v_email
  );
end;
$$;

create or replace function public.platform_create_cafe_with_owner(
  p_super_admin_user_id uuid,
  p_cafe_slug text,
  p_cafe_display_name text,
  p_owner_full_name text,
  p_owner_phone text,
  p_owner_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, platform
as $$
declare
  v_admin platform.super_admin_users%rowtype;
  v_cafe_id uuid;
  v_owner_id uuid;
  v_slug text;
begin
  select *
  into v_admin
  from platform.super_admin_users
  where id = p_super_admin_user_id
    and is_active = true;

  if not found then
    raise exception 'active super admin not found';
  end if;

  v_slug := lower(nullif(btrim(p_cafe_slug), ''));

  if v_slug is null then
    raise exception 'p_cafe_slug is required';
  end if;

  if nullif(btrim(p_cafe_display_name), '') is null then
    raise exception 'p_cafe_display_name is required';
  end if;

  if nullif(btrim(p_owner_full_name), '') is null then
    raise exception 'p_owner_full_name is required';
  end if;

  if nullif(btrim(p_owner_phone), '') is null then
    raise exception 'p_owner_phone is required';
  end if;

  if nullif(p_owner_password, '') is null then
    raise exception 'p_owner_password is required';
  end if;

  insert into ops.cafes (
    slug,
    display_name,
    is_active
  )
  values (
    v_slug,
    p_cafe_display_name,
    true
  )
  returning id into v_cafe_id;

  insert into ops.owner_users (
    cafe_id,
    full_name,
    phone,
    password_hash,
    is_active
  )
  values (
    v_cafe_id,
    p_owner_full_name,
    p_owner_phone,
    extensions.crypt(p_owner_password, extensions.gen_salt('bf')),
    true
  )
  returning id into v_owner_id;

  insert into ops.audit_events (
    cafe_id,
    actor_type,
    actor_label,
    event_code,
    entity_type,
    entity_id,
    payload
  )
  values (
    v_cafe_id,
    'super_admin',
    v_admin.email,
    'platform_create_cafe_with_owner',
    'cafe',
    v_cafe_id,
    jsonb_build_object(
      'owner_user_id', v_owner_id,
      'owner_phone', p_owner_phone
    )
  );

  return jsonb_build_object(
    'ok', true,
    'cafe_id', v_cafe_id,
    'owner_user_id', v_owner_id,
    'slug', v_slug
  );
end;
$$;

create or replace function public.platform_reset_owner_password(
  p_super_admin_user_id uuid,
  p_cafe_id uuid,
  p_owner_user_id uuid,
  p_new_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, platform
as $$
declare
  v_admin platform.super_admin_users%rowtype;
begin
  select *
  into v_admin
  from platform.super_admin_users
  where id = p_super_admin_user_id
    and is_active = true;

  if not found then
    raise exception 'active super admin not found';
  end if;

  if nullif(p_new_password, '') is null then
    raise exception 'p_new_password is required';
  end if;

  update ops.owner_users
  set password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf'))
  where cafe_id = p_cafe_id
    and id = p_owner_user_id;

  if not found then
    raise exception 'owner user not found';
  end if;

  insert into ops.audit_events (
    cafe_id,
    actor_type,
    actor_label,
    event_code,
    entity_type,
    entity_id,
    payload
  )
  values (
    p_cafe_id,
    'super_admin',
    v_admin.email,
    'platform_reset_owner_password',
    'owner_user',
    p_owner_user_id,
    jsonb_build_object('reset', true)
  );

  return jsonb_build_object(
    'ok', true,
    'owner_user_id', p_owner_user_id
  );
end;
$$;

drop function if exists public.platform_verify_super_admin_login(text, text);

create function public.platform_verify_super_admin_login(
  p_email text,
  p_password text
)
returns table (
  super_admin_user_id uuid,
  email text,
  display_name text
)
language sql
security definer
set search_path = public, platform, pg_catalog
as $$
  select
    u.id as super_admin_user_id,
    u.email,
    u.display_name
  from platform.super_admin_users u
  where lower(u.email) = lower(trim(p_email))
    and u.is_active = true
    and u.password_hash is not null
    and u.password_hash = extensions.crypt(p_password, u.password_hash)
  limit 1
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
  station_code text check (station_code in ('barista', 'shisha', 'service')),
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

create table if not exists platform.cafe_subscriptions (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  grace_days integer not null default 0 check (grace_days >= 0),
  status text not null check (status in ('trial', 'active', 'expired', 'suspended')),
  notes text,
  created_by_super_admin_user_id uuid not null references platform.super_admin_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_platform_cafe_subscriptions_cafe_created
  on platform.cafe_subscriptions(cafe_id, created_at desc);

create or replace function public.platform_create_cafe_with_owner(
  p_super_admin_user_id uuid,
  p_cafe_slug text,
  p_cafe_display_name text,
  p_owner_full_name text,
  p_owner_phone text,
  p_owner_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, platform
as $$
declare
  v_admin platform.super_admin_users%rowtype;
  v_cafe_id uuid;
  v_owner_id uuid;
  v_slug text;
begin
  select *
  into v_admin
  from platform.super_admin_users
  where id = p_super_admin_user_id
    and is_active = true;

  if not found then
    raise exception 'active super admin not found';
  end if;

  v_slug := lower(nullif(btrim(p_cafe_slug), ''));

  if v_slug is null then
    raise exception 'p_cafe_slug is required';
  end if;

  if nullif(btrim(p_cafe_display_name), '') is null then
    raise exception 'p_cafe_display_name is required';
  end if;

  if nullif(btrim(p_owner_full_name), '') is null then
    raise exception 'p_owner_full_name is required';
  end if;

  if nullif(btrim(p_owner_phone), '') is null then
    raise exception 'p_owner_phone is required';
  end if;

  if nullif(p_owner_password, '') is null then
    raise exception 'p_owner_password is required';
  end if;

  insert into ops.cafes (
    slug,
    display_name,
    is_active
  )
  values (
    v_slug,
    btrim(p_cafe_display_name),
    true
  )
  returning id into v_cafe_id;

  insert into ops.owner_users (
    cafe_id,
    full_name,
    phone,
    password_hash,
    owner_label,
    is_active
  )
  values (
    v_cafe_id,
    btrim(p_owner_full_name),
    btrim(p_owner_phone),
    extensions.crypt(p_owner_password, extensions.gen_salt('bf')),
    'owner',
    true
  )
  returning id into v_owner_id;

  insert into ops.audit_events (
    cafe_id,
    actor_type,
    actor_label,
    event_code,
    entity_type,
    entity_id,
    payload
  )
  values (
    v_cafe_id,
    'super_admin',
    v_admin.email,
    'platform_create_cafe_with_owner',
    'cafe',
    v_cafe_id,
    jsonb_build_object(
      'owner_user_id', v_owner_id,
      'owner_phone', btrim(p_owner_phone),
      'owner_label', 'owner'
    )
  );

  return jsonb_build_object(
    'ok', true,
    'cafe_id', v_cafe_id,
    'owner_user_id', v_owner_id,
    'slug', v_slug
  );
end;
$$;

create or replace function public.platform_list_cafes()
returns jsonb
language sql
security definer
set search_path = public, ops, platform
as $$
  with latest_subscription as (
    select distinct on (s.cafe_id)
      s.cafe_id,
      s.id,
      s.starts_at,
      s.ends_at,
      s.grace_days,
      s.status,
      s.notes,
      s.created_at,
      s.updated_at,
      case
        when s.status = 'suspended' then 'suspended'
        when now() > s.ends_at + make_interval(days => s.grace_days) then 'expired'
        else s.status
      end as effective_status,
      greatest(0, floor(extract(epoch from (s.ends_at - now()))))::bigint as countdown_seconds
    from platform.cafe_subscriptions s
    order by s.cafe_id, s.created_at desc, s.id desc
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
  from (
    select
      c.id,
      c.slug,
      c.display_name,
      c.is_active,
      c.created_at,
      (
        select count(*)::integer
        from ops.owner_users ou
        where ou.cafe_id = c.id
      ) as owner_count,
      (
        select count(*)::integer
        from ops.owner_users ou
        where ou.cafe_id = c.id
          and ou.is_active = true
      ) as active_owner_count,
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', ou.id,
            'full_name', ou.full_name,
            'phone', ou.phone,
            'owner_label', ou.owner_label,
            'is_active', ou.is_active,
            'created_at', ou.created_at
          ) order by ou.created_at asc
        )
        from ops.owner_users ou
        where ou.cafe_id = c.id
      ) as owners,
      case
        when ls.cafe_id is null then null
        else jsonb_build_object(
          'id', ls.id,
          'starts_at', ls.starts_at,
          'ends_at', ls.ends_at,
          'grace_days', ls.grace_days,
          'status', ls.status,
          'effective_status', ls.effective_status,
          'notes', ls.notes,
          'created_at', ls.created_at,
          'updated_at', ls.updated_at,
          'countdown_seconds', ls.countdown_seconds
        )
      end as current_subscription
    from ops.cafes c
    left join latest_subscription ls
      on ls.cafe_id = c.id
  ) x;
$$;

create or replace function public.platform_list_owner_users(
  p_super_admin_user_id uuid,
  p_cafe_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, platform
as $$
declare
  v_admin platform.super_admin_users%rowtype;
begin
  select *
  into v_admin
  from platform.super_admin_users
  where id = p_super_admin_user_id
    and is_active = true;

  if not found then
    raise exception 'active super admin not found';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'owner_user_id', ou.id,
        'cafe_id', ou.cafe_id,
        'full_name', ou.full_name,
        'phone', ou.phone,
        'owner_label', ou.owner_label,
        'is_active', ou.is_active,
        'created_at', ou.created_at
      )
      order by ou.created_at desc
    )
    from ops.owner_users ou
    where ou.cafe_id = p_cafe_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.platform_create_owner_user(
  p_super_admin_user_id uuid,
  p_cafe_id uuid,
  p_full_name text,
  p_phone text,
  p_password text,
  p_owner_label text default 'partner'
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, platform
as $$
declare
  v_admin platform.super_admin_users%rowtype;
  v_cafe ops.cafes%rowtype;
  v_owner_id uuid;
  v_owner_label text;
begin
  select *
  into v_admin
  from platform.super_admin_users
  where id = p_super_admin_user_id
    and is_active = true;

  if not found then
    raise exception 'active super admin not found';
  end if;

  select *
  into v_cafe
  from ops.cafes
  where id = p_cafe_id;

  if not found then
    raise exception 'cafe not found';
  end if;

  if nullif(btrim(p_full_name), '') is null then
    raise exception 'p_full_name is required';
  end if;

  if nullif(btrim(p_phone), '') is null then
    raise exception 'p_phone is required';
  end if;

  if nullif(p_password, '') is null then
    raise exception 'p_password is required';
  end if;

  v_owner_label := lower(coalesce(nullif(btrim(p_owner_label), ''), 'partner'));

  if v_owner_label not in ('owner', 'partner') then
    raise exception 'invalid owner label';
  end if;

  insert into ops.owner_users (
    cafe_id,
    full_name,
    phone,
    password_hash,
    owner_label,
    is_active
  )
  values (
    p_cafe_id,
    btrim(p_full_name),
    btrim(p_phone),
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    v_owner_label,
    true
  )
  returning id into v_owner_id;

  insert into ops.audit_events (
    cafe_id,
    actor_type,
    actor_label,
    event_code,
    entity_type,
    entity_id,
    payload
  )
  values (
    p_cafe_id,
    'super_admin',
    v_admin.email,
    'platform_create_owner_user',
    'owner_user',
    v_owner_id,
    jsonb_build_object(
      'phone', btrim(p_phone),
      'owner_label', v_owner_label
    )
  );

  return jsonb_build_object(
    'ok', true,
    'owner_user_id', v_owner_id,
    'owner_label', v_owner_label
  );
end;
$$;

create or replace function public.platform_update_owner_user(
  p_super_admin_user_id uuid,
  p_cafe_id uuid,
  p_owner_user_id uuid,
  p_full_name text default null,
  p_phone text default null,
  p_owner_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, platform
as $$
declare
  v_admin platform.super_admin_users%rowtype;
  v_owner ops.owner_users%rowtype;
  v_next_full_name text;
  v_next_phone text;
  v_next_owner_label text;
begin
  select *
  into v_admin
  from platform.super_admin_users
  where id = p_super_admin_user_id
    and is_active = true;

  if not found then
    raise exception 'active super admin not found';
  end if;

  select *
  into v_owner
  from ops.owner_users
  where cafe_id = p_cafe_id
    and id = p_owner_user_id;

  if not found then
    raise exception 'owner user not found';
  end if;

  v_next_full_name := coalesce(nullif(btrim(p_full_name), ''), v_owner.full_name);
  v_next_phone := coalesce(nullif(btrim(p_phone), ''), v_owner.phone);
  v_next_owner_label := lower(coalesce(nullif(btrim(p_owner_label), ''), v_owner.owner_label));

  if v_next_owner_label not in ('owner', 'partner') then
    raise exception 'invalid owner label';
  end if;

  update ops.owner_users
  set full_name = v_next_full_name,
      phone = v_next_phone,
      owner_label = v_next_owner_label
  where cafe_id = p_cafe_id
    and id = p_owner_user_id;

  insert into ops.audit_events (
    cafe_id,
    actor_type,
    actor_label,
    event_code,
    entity_type,
    entity_id,
    payload
  )
  values (
    p_cafe_id,
    'super_admin',
    v_admin.email,
    'platform_update_owner_user',
    'owner_user',
    p_owner_user_id,
    jsonb_build_object(
      'full_name', v_next_full_name,
      'phone', v_next_phone,
      'owner_label', v_next_owner_label
    )
  );

  return jsonb_build_object(
    'ok', true,
    'owner_user_id', p_owner_user_id,
    'owner_label', v_next_owner_label
  );
end;
$$;

create or replace function public.platform_set_owner_user_active(
  p_super_admin_user_id uuid,
  p_cafe_id uuid,
  p_owner_user_id uuid,
  p_is_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, platform
as $$
declare
  v_admin platform.super_admin_users%rowtype;
  v_owner_label text;
begin
  select *
  into v_admin
  from platform.super_admin_users
  where id = p_super_admin_user_id
    and is_active = true;

  if not found then
    raise exception 'active super admin not found';
  end if;

  update ops.owner_users
  set is_active = coalesce(p_is_active, false)
  where cafe_id = p_cafe_id
    and id = p_owner_user_id
  returning owner_label into v_owner_label;

  if not found then
    raise exception 'owner user not found';
  end if;

  insert into ops.audit_events (
    cafe_id,
    actor_type,
    actor_label,
    event_code,
    entity_type,
    entity_id,
    payload
  )
  values (
    p_cafe_id,
    'super_admin',
    v_admin.email,
    'platform_set_owner_user_active',
    'owner_user',
    p_owner_user_id,
    jsonb_build_object(
      'is_active', coalesce(p_is_active, false),
      'owner_label', v_owner_label
    )
  );

  return jsonb_build_object(
    'ok', true,
    'owner_user_id', p_owner_user_id,
    'is_active', coalesce(p_is_active, false)
  );
end;
$$;

create or replace function public.platform_set_cafe_active(
  p_super_admin_user_id uuid,
  p_cafe_id uuid,
  p_is_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, platform
as $$
declare
  v_admin platform.super_admin_users%rowtype;
  v_slug text;
begin
  select *
  into v_admin
  from platform.super_admin_users
  where id = p_super_admin_user_id
    and is_active = true;

  if not found then
    raise exception 'active super admin not found';
  end if;

  update ops.cafes
  set is_active = coalesce(p_is_active, false)
  where id = p_cafe_id
  returning slug into v_slug;

  if not found then
    raise exception 'cafe not found';
  end if;

  insert into ops.audit_events (
    cafe_id,
    actor_type,
    actor_label,
    event_code,
    entity_type,
    entity_id,
    payload
  )
  values (
    p_cafe_id,
    'super_admin',
    v_admin.email,
    'platform_set_cafe_active',
    'cafe',
    p_cafe_id,
    jsonb_build_object(
      'slug', v_slug,
      'is_active', coalesce(p_is_active, false)
    )
  );

  return jsonb_build_object(
    'ok', true,
    'cafe_id', p_cafe_id,
    'is_active', coalesce(p_is_active, false)
  );
end;
$$;

create or replace function public.platform_record_cafe_subscription(
  p_super_admin_user_id uuid,
  p_cafe_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_grace_days integer default 0,
  p_status text default 'active',
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, platform
as $$
declare
  v_admin platform.super_admin_users%rowtype;
  v_subscription_id uuid;
  v_status text;
begin
  select *
  into v_admin
  from platform.super_admin_users
  where id = p_super_admin_user_id
    and is_active = true;

  if not found then
    raise exception 'active super admin not found';
  end if;

  perform 1
  from ops.cafes
  where id = p_cafe_id;

  if not found then
    raise exception 'cafe not found';
  end if;

  if p_starts_at is null or p_ends_at is null then
    raise exception 'subscription dates are required';
  end if;

  if p_ends_at <= p_starts_at then
    raise exception 'subscription end must be after start';
  end if;

  if coalesce(p_grace_days, 0) < 0 then
    raise exception 'grace_days must be >= 0';
  end if;

  v_status := lower(coalesce(nullif(btrim(p_status), ''), 'active'));

  if v_status not in ('trial', 'active', 'expired', 'suspended') then
    raise exception 'invalid subscription status';
  end if;

  insert into platform.cafe_subscriptions (
    cafe_id,
    starts_at,
    ends_at,
    grace_days,
    status,
    notes,
    created_by_super_admin_user_id,
    created_at,
    updated_at
  )
  values (
    p_cafe_id,
    p_starts_at,
    p_ends_at,
    coalesce(p_grace_days, 0),
    v_status,
    nullif(btrim(coalesce(p_notes, '')), ''),
    p_super_admin_user_id,
    now(),
    now()
  )
  returning id into v_subscription_id;

  insert into ops.audit_events (
    cafe_id,
    actor_type,
    actor_label,
    event_code,
    entity_type,
    entity_id,
    payload
  )
  values (
    p_cafe_id,
    'super_admin',
    v_admin.email,
    'platform_record_cafe_subscription',
    'cafe_subscription',
    v_subscription_id,
    jsonb_build_object(
      'starts_at', p_starts_at,
      'ends_at', p_ends_at,
      'grace_days', coalesce(p_grace_days, 0),
      'status', v_status,
      'notes', nullif(btrim(coalesce(p_notes, '')), '')
    )
  );

  return jsonb_build_object(
    'ok', true,
    'subscription_id', v_subscription_id,
    'status', v_status
  );
end;
$$;

create or replace function public.platform_list_cafe_subscriptions(
  p_super_admin_user_id uuid,
  p_cafe_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, platform
as $$
declare
  v_admin platform.super_admin_users%rowtype;
begin
  select *
  into v_admin
  from platform.super_admin_users
  where id = p_super_admin_user_id
    and is_active = true;

  if not found then
    raise exception 'active super admin not found';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'cafe_id', s.cafe_id,
        'starts_at', s.starts_at,
        'ends_at', s.ends_at,
        'grace_days', s.grace_days,
        'status', s.status,
        'effective_status', case
          when s.status = 'suspended' then 'suspended'
          when now() > s.ends_at + make_interval(days => s.grace_days) then 'expired'
          else s.status
        end,
        'notes', s.notes,
        'created_at', s.created_at,
        'updated_at', s.updated_at,
        'countdown_seconds', greatest(0, floor(extract(epoch from (s.ends_at - now()))))::bigint
      )
      order by s.created_at desc, s.id desc
    )
    from platform.cafe_subscriptions s
    where s.cafe_id = p_cafe_id
  ), '[]'::jsonb);
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

-- >>> 0016_phaseA_platform_portfolio_overview.sql
begin;

create table if not exists platform.runtime_settings (
  setting_key text primary key,
  setting_value_text text,
  updated_by_super_admin_user_id uuid references platform.super_admin_users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create or replace function public.platform_set_database_capacity_bytes(
  p_super_admin_user_id uuid,
  p_database_capacity_bytes bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, platform
as $$
declare
  v_admin platform.super_admin_users%rowtype;
  v_capacity bigint;
begin
  select *
  into v_admin
  from platform.super_admin_users
  where id = p_super_admin_user_id
    and is_active = true;

  if not found then
    raise exception 'active super admin not found';
  end if;

  if p_database_capacity_bytes is not null and p_database_capacity_bytes <= 0 then
    raise exception 'p_database_capacity_bytes must be null or > 0';
  end if;

  v_capacity := p_database_capacity_bytes;

  if v_capacity is null then
    delete from platform.runtime_settings
    where setting_key = 'database_capacity_bytes';
  else
    insert into platform.runtime_settings (
      setting_key,
      setting_value_text,
      updated_by_super_admin_user_id,
      updated_at
    )
    values (
      'database_capacity_bytes',
      v_capacity::text,
      p_super_admin_user_id,
      now()
    )
    on conflict (setting_key)
    do update set
      setting_value_text = excluded.setting_value_text,
      updated_by_super_admin_user_id = excluded.updated_by_super_admin_user_id,
      updated_at = excluded.updated_at;
  end if;

  return jsonb_build_object(
    'database_capacity_bytes', v_capacity,
    'database_capacity_pretty', case when v_capacity is null then null else pg_size_pretty(v_capacity) end
  );
end;
$$;

create or replace function public.platform_dashboard_overview(
  p_super_admin_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, platform
as $$
declare
  v_admin platform.super_admin_users%rowtype;
  v_now timestamptz := now();
  v_today date := timezone('Africa/Cairo', now())::date;
  v_capacity_bytes bigint := null;
  v_used_bytes bigint := 0;
begin
  select *
  into v_admin
  from platform.super_admin_users
  where id = p_super_admin_user_id
    and is_active = true;

  if not found then
    raise exception 'active super admin not found';
  end if;

  select case
    when setting_value_text ~ '^[0-9]+$' then setting_value_text::bigint
    else null
  end
  into v_capacity_bytes
  from platform.runtime_settings
  where setting_key = 'database_capacity_bytes';

  v_used_bytes := pg_database_size(current_database());

  return (
    with latest_subscription as (
      select distinct on (s.cafe_id)
        s.cafe_id,
        s.id,
        s.starts_at,
        s.ends_at,
        s.grace_days,
        s.status,
        s.notes,
        s.created_at,
        s.updated_at,
        case
          when s.status = 'suspended' then 'suspended'
          when v_now > s.ends_at + make_interval(days => s.grace_days) then 'expired'
          else s.status
        end as effective_status,
        greatest(0, floor(extract(epoch from (s.ends_at - v_now))))::bigint as countdown_seconds
      from platform.cafe_subscriptions s
      order by s.cafe_id, s.created_at desc, s.id desc
    ),
    owner_counts as (
      select
        ou.cafe_id,
        count(*)::int as owner_count,
        count(*) filter (where ou.is_active)::int as active_owner_count,
        jsonb_agg(
          jsonb_build_object(
            'id', ou.id,
            'full_name', ou.full_name,
            'phone', ou.phone,
            'owner_label', ou.owner_label,
            'is_active', ou.is_active,
            'created_at', ou.created_at
          )
          order by ou.created_at asc
        ) as owners
      from ops.owner_users ou
      group by ou.cafe_id
    ),
    open_shift_now as (
      select
        s.cafe_id,
        true as has_open_shift,
        min(s.business_date) as open_shift_business_date,
        max(s.opened_at) as open_shift_started_at
      from ops.shifts s
      where s.status = 'open'
      group by s.cafe_id
    ),
    shift_days as (
      select
        s.cafe_id,
        count(distinct s.business_date) filter (where s.business_date between v_today - 6 and v_today)::int as usage_days_7,
        count(distinct s.business_date) filter (where s.business_date between v_today - 29 and v_today)::int as usage_days_30,
        count(*) filter (where s.business_date = v_today)::int as shifts_today
      from ops.shifts s
      group by s.cafe_id
    ),
    session_metrics as (
      select
        s.cafe_id,
        count(ss.id) filter (where s.business_date = v_today)::int as sessions_today
      from ops.shifts s
      join ops.service_sessions ss
        on ss.cafe_id = s.cafe_id
       and ss.shift_id = s.id
      group by s.cafe_id
    ),
    item_metrics as (
      select
        s.cafe_id,
        coalesce(sum((oi.qty_delivered + oi.qty_replacement_delivered)) filter (where s.business_date = v_today), 0)::int as served_qty_today,
        coalesce(sum((oi.qty_paid + oi.qty_deferred) * oi.unit_price) filter (where s.business_date = v_today), 0)::numeric(12,2) as net_sales_today,
        coalesce(sum(oi.qty_remade) filter (where s.business_date = v_today), 0)::int as remake_qty_today,
        coalesce(sum(oi.qty_cancelled) filter (where s.business_date = v_today), 0)::int as cancelled_qty_today
      from ops.shifts s
      join ops.order_items oi
        on oi.cafe_id = s.cafe_id
       and oi.shift_id = s.id
      group by s.cafe_id
    ),
    complaint_metrics as (
      select
        s.cafe_id,
        count(c.id) filter (where s.business_date = v_today)::int as complaints_today,
        count(c.id) filter (where c.status = 'open')::int as open_complaints_count
      from ops.shifts s
      join ops.complaints c
        on c.cafe_id = s.cafe_id
       and c.shift_id = s.id
      group by s.cafe_id
    ),
    active_staff_today as (
      select
        s.cafe_id,
        count(distinct coalesce(a.staff_member_id::text, 'owner:' || a.owner_user_id::text))::int as active_staff_today
      from ops.shifts s
      join ops.shift_role_assignments a
        on a.cafe_id = s.cafe_id
       and a.shift_id = s.id
      where s.business_date = v_today
        and a.is_active = true
      group by s.cafe_id
    ),
    deferred_balances as (
      select
        dle.cafe_id,
        coalesce(sum(
          case dle.entry_kind
            when 'debt' then dle.amount
            when 'repayment' then -dle.amount
            else 0
          end
        ), 0)::numeric(12,2) as deferred_outstanding
      from ops.deferred_ledger_entries dle
      group by dle.cafe_id
    ),
    last_activity as (
      select
        activity.cafe_id,
        max(activity.activity_at) as last_activity_at
      from (
        select cafe_id, max(created_at) as activity_at from ops.audit_events group by cafe_id
        union all
        select cafe_id, max(opened_at) as activity_at from ops.shifts group by cafe_id
        union all
        select cafe_id, max(opened_at) as activity_at from ops.service_sessions group by cafe_id
        union all
        select cafe_id, max(created_at) as activity_at from ops.orders group by cafe_id
        union all
        select cafe_id, max(created_at) as activity_at from ops.fulfillment_events group by cafe_id
        union all
        select cafe_id, max(created_at) as activity_at from ops.payments group by cafe_id
        union all
        select cafe_id, max(created_at) as activity_at from ops.complaints group by cafe_id
      ) activity
      group by activity.cafe_id
    ),
    portfolio as (
      select
        c.id,
        c.slug,
        c.display_name,
        c.is_active,
        c.created_at,
        coalesce(oc.owner_count, 0) as owner_count,
        coalesce(oc.active_owner_count, 0) as active_owner_count,
        coalesce(oc.owners, '[]'::jsonb) as owners,
        ls.id as subscription_id,
        ls.starts_at as subscription_starts_at,
        ls.ends_at as subscription_ends_at,
        ls.grace_days as subscription_grace_days,
        ls.status as subscription_status,
        ls.effective_status as subscription_effective_status,
        ls.notes as subscription_notes,
        ls.created_at as subscription_created_at,
        ls.updated_at as subscription_updated_at,
        ls.countdown_seconds as subscription_countdown_seconds,
        coalesce(os.has_open_shift, false) as has_open_shift,
        os.open_shift_business_date,
        os.open_shift_started_at,
        coalesce(sd.usage_days_7, 0) as usage_days_7,
        coalesce(sd.usage_days_30, 0) as usage_days_30,
        coalesce(sd.shifts_today, 0) as shifts_today,
        coalesce(sm.sessions_today, 0) as sessions_today,
        coalesce(im.served_qty_today, 0) as served_qty_today,
        coalesce(im.net_sales_today, 0)::numeric(12,2) as net_sales_today,
        coalesce(im.remake_qty_today, 0) as remake_qty_today,
        coalesce(im.cancelled_qty_today, 0) as cancelled_qty_today,
        coalesce(cm.complaints_today, 0) as complaints_today,
        coalesce(cm.open_complaints_count, 0) as open_complaints_count,
        coalesce(ast.active_staff_today, 0) as active_staff_today,
        coalesce(db.deferred_outstanding, 0)::numeric(12,2) as deferred_outstanding,
        la.last_activity_at,
        case
          when ls.cafe_id is null then 'none'
          else ls.effective_status
        end as subscription_state,
        case
          when ls.cafe_id is null then 'trial_or_free'
          when ls.effective_status = 'active' then 'paid_current'
          when ls.effective_status = 'expired' then 'overdue'
          when ls.effective_status = 'suspended' then 'suspended'
          else 'trial_or_free'
        end as payment_state,
        case
          when coalesce(os.has_open_shift, false) then 'active_now'
          when coalesce(sd.shifts_today, 0) > 0
            or coalesce(sm.sessions_today, 0) > 0
            or coalesce(im.served_qty_today, 0) > 0
            or coalesce(cm.complaints_today, 0) > 0 then 'active_today'
          when la.last_activity_at is not null and la.last_activity_at >= v_now - interval '7 days' then 'active_recently'
          else 'inactive'
        end as usage_state,
        array_remove(array[
          case when c.is_active = false then 'cafe_disabled' end,
          case when coalesce(oc.active_owner_count, 0) = 0 then 'no_active_owner' end,
          case when ls.cafe_id is null then 'no_subscription' end,
          case when ls.effective_status = 'expired'
            and (coalesce(os.has_open_shift, false) or coalesce(sd.usage_days_7, 0) > 0 or (la.last_activity_at is not null and la.last_activity_at >= v_now - interval '7 days'))
            then 'expired_but_active' end,
          case when ls.effective_status = 'suspended'
            and (coalesce(os.has_open_shift, false) or (la.last_activity_at is not null and la.last_activity_at >= v_now - interval '7 days'))
            then 'suspended_but_active' end,
          case when coalesce(os.has_open_shift, false) and os.open_shift_started_at <= v_now - interval '18 hours' then 'open_shift_too_long' end,
          case when coalesce(cm.open_complaints_count, 0) > 0 then 'open_complaints' end,
          case when ls.effective_status = 'active'
            and coalesce(sd.usage_days_7, 0) = 0
            and c.created_at <= v_now - interval '14 days'
            then 'paid_but_inactive' end
        ], null::text) as attention_reasons
      from ops.cafes c
      left join owner_counts oc on oc.cafe_id = c.id
      left join latest_subscription ls on ls.cafe_id = c.id
      left join open_shift_now os on os.cafe_id = c.id
      left join shift_days sd on sd.cafe_id = c.id
      left join session_metrics sm on sm.cafe_id = c.id
      left join item_metrics im on im.cafe_id = c.id
      left join complaint_metrics cm on cm.cafe_id = c.id
      left join active_staff_today ast on ast.cafe_id = c.id
      left join deferred_balances db on db.cafe_id = c.id
      left join last_activity la on la.cafe_id = c.id
    ),
    attention_queue as (
      select *
      from portfolio p
      where cardinality(p.attention_reasons) > 0
      order by cardinality(p.attention_reasons) desc, p.has_open_shift desc, p.last_activity_at desc nulls last, p.created_at desc
      limit 12
    )
    select jsonb_build_object(
      'generated_at', v_now,
      'database_usage', jsonb_build_object(
        'used_bytes', v_used_bytes,
        'used_pretty', pg_size_pretty(v_used_bytes),
        'capacity_bytes', v_capacity_bytes,
        'capacity_pretty', case when v_capacity_bytes is null then null else pg_size_pretty(v_capacity_bytes) end,
        'usage_percent', case when v_capacity_bytes is null or v_capacity_bytes <= 0 then null else round((v_used_bytes::numeric * 100) / v_capacity_bytes::numeric, 2) end,
        'database_name', current_database()
      ),
      'summary', jsonb_build_object(
        'cafes_total', count(*)::int,
        'cafes_active', count(*) filter (where p.is_active)::int,
        'paid_current', count(*) filter (where p.payment_state = 'paid_current')::int,
        'trial_or_free', count(*) filter (where p.payment_state = 'trial_or_free')::int,
        'overdue', count(*) filter (where p.payment_state = 'overdue')::int,
        'suspended', count(*) filter (where p.payment_state = 'suspended')::int,
        'no_subscription', count(*) filter (where p.subscription_state = 'none')::int,
        'active_now', count(*) filter (where p.usage_state = 'active_now')::int,
        'active_today', count(*) filter (where p.usage_state in ('active_now', 'active_today'))::int,
        'inactive', count(*) filter (where p.usage_state = 'inactive')::int,
        'needs_attention', count(*) filter (where cardinality(p.attention_reasons) > 0)::int,
        'net_sales_today', coalesce(sum(p.net_sales_today), 0)::numeric(12,2),
        'served_qty_today', coalesce(sum(p.served_qty_today), 0)::int,
        'complaints_today', coalesce(sum(p.complaints_today), 0)::int
      ),
      'cafes', coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'slug', p.slug,
            'display_name', p.display_name,
            'is_active', p.is_active,
            'created_at', p.created_at,
            'owner_count', p.owner_count,
            'active_owner_count', p.active_owner_count,
            'owners', p.owners,
            'current_subscription', case when p.subscription_id is null then null else jsonb_build_object(
              'id', p.subscription_id,
              'starts_at', p.subscription_starts_at,
              'ends_at', p.subscription_ends_at,
              'grace_days', p.subscription_grace_days,
              'status', p.subscription_status,
              'effective_status', p.subscription_effective_status,
              'notes', p.subscription_notes,
              'created_at', p.subscription_created_at,
              'updated_at', p.subscription_updated_at,
              'countdown_seconds', p.subscription_countdown_seconds
            ) end,
            'subscription_state', p.subscription_state,
            'payment_state', p.payment_state,
            'usage_state', p.usage_state,
            'last_activity_at', p.last_activity_at,
            'has_open_shift', p.has_open_shift,
            'open_shift_business_date', p.open_shift_business_date,
            'open_shift_started_at', p.open_shift_started_at,
            'usage_days_7', p.usage_days_7,
            'usage_days_30', p.usage_days_30,
            'shifts_today', p.shifts_today,
            'sessions_today', p.sessions_today,
            'served_qty_today', p.served_qty_today,
            'net_sales_today', p.net_sales_today,
            'remake_qty_today', p.remake_qty_today,
            'cancelled_qty_today', p.cancelled_qty_today,
            'complaints_today', p.complaints_today,
            'open_complaints_count', p.open_complaints_count,
            'active_staff_today', p.active_staff_today,
            'deferred_outstanding', p.deferred_outstanding,
            'attention_reasons', to_jsonb(p.attention_reasons)
          )
          order by p.has_open_shift desc, p.net_sales_today desc, p.created_at desc
        ),
        '[]'::jsonb
      ),
      'attention_queue', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', aq.id,
              'slug', aq.slug,
              'display_name', aq.display_name,
              'usage_state', aq.usage_state,
              'payment_state', aq.payment_state,
              'last_activity_at', aq.last_activity_at,
              'attention_reasons', to_jsonb(aq.attention_reasons)
            )
            order by cardinality(aq.attention_reasons) desc, aq.last_activity_at desc nulls last
          ),
          '[]'::jsonb
        )
        from attention_queue aq
      )
    )
    from portfolio p
  );
end;
$$;

commit;
-- <<< 0016_phaseA_platform_portfolio_overview.sql

-- >>> 0017_phaseB_platform_cafe_detail.sql
begin;

create or replace function public.platform_get_cafe_detail(
  p_super_admin_user_id uuid,
  p_cafe_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, platform
as $$
declare
  v_admin platform.super_admin_users%rowtype;
  v_cafe ops.cafes%rowtype;
  v_now timestamptz := now();
  v_today date := timezone('Africa/Cairo', now())::date;
  v_result jsonb;
begin
  select * into v_admin from platform.super_admin_users where id = p_super_admin_user_id and is_active = true;
  if not found then raise exception 'active super admin not found'; end if;

  select * into v_cafe from ops.cafes where id = p_cafe_id;
  if not found then raise exception 'cafe_not_found'; end if;

  with latest_subscription as (
    select distinct on (s.cafe_id)
      s.cafe_id, s.id, s.starts_at, s.ends_at, s.grace_days, s.status, s.notes, s.created_at, s.updated_at,
      case when s.status = 'suspended' then 'suspended' when v_now > s.ends_at + make_interval(days => s.grace_days) then 'expired' else s.status end as effective_status,
      greatest(0, floor(extract(epoch from (s.ends_at - v_now))))::bigint as countdown_seconds
    from platform.cafe_subscriptions s
    where s.cafe_id = p_cafe_id
    order by s.cafe_id, s.created_at desc, s.id desc
  ), owner_rows as (
    select ou.id, ou.full_name, ou.phone, ou.owner_label, ou.is_active, ou.created_at
    from ops.owner_users ou where ou.cafe_id = p_cafe_id order by ou.created_at asc
  ), last_activity as (
    select max(activity_at) as last_activity_at from (
      select max(created_at) as activity_at from ops.audit_events where cafe_id = p_cafe_id
      union all select max(opened_at) from ops.shifts where cafe_id = p_cafe_id
      union all select max(opened_at) from ops.service_sessions where cafe_id = p_cafe_id
      union all select max(created_at) from ops.orders where cafe_id = p_cafe_id
      union all select max(created_at) from ops.fulfillment_events where cafe_id = p_cafe_id
      union all select max(created_at) from ops.payments where cafe_id = p_cafe_id
      union all select max(created_at) from ops.complaints where cafe_id = p_cafe_id
    ) activities
  ), open_shift as (
    select s.id, s.shift_kind, s.business_date, s.opened_at
    from ops.shifts s where s.cafe_id = p_cafe_id and s.status = 'open'
    order by s.opened_at desc nulls last limit 1
  ), shift_today as (
    select count(*)::int as shifts_count, max(closed_at) as last_closed_at
    from ops.shifts s where s.cafe_id = p_cafe_id and s.business_date = v_today
  ), metrics_today as (
    select
      coalesce(count(distinct ss.id), 0)::int as sessions_count,
      coalesce(sum(oi.qty_delivered + oi.qty_replacement_delivered), 0)::int as served_qty,
      coalesce(sum((oi.qty_paid + oi.qty_deferred) * oi.unit_price), 0)::numeric(12,2) as net_sales,
      coalesce(sum(oi.qty_remade), 0)::int as remake_qty,
      coalesce(sum(oi.qty_cancelled), 0)::int as cancelled_qty,
      coalesce(count(distinct c.id), 0)::int as complaints_count,
      coalesce(count(distinct case when c.status = 'open' then c.id end), 0)::int as open_complaints_count,
      coalesce(count(distinct coalesce(sra.staff_member_id::text, 'owner:' || sra.owner_user_id::text)), 0)::int as active_staff_count,
      coalesce(sum(case when p.payment_kind = 'cash' then p.total_amount else 0 end), 0)::numeric(12,2) as cash_collected,
      coalesce(sum(case when p.payment_kind = 'deferred' then p.total_amount else 0 end), 0)::numeric(12,2) as deferred_sold,
      coalesce(sum(case when p.payment_kind = 'repayment' then p.total_amount else 0 end), 0)::numeric(12,2) as repayments_total
    from ops.shifts s
    left join ops.service_sessions ss on ss.cafe_id = s.cafe_id and ss.shift_id = s.id
    left join ops.order_items oi on oi.cafe_id = s.cafe_id and oi.shift_id = s.id
    left join ops.complaints c on c.cafe_id = s.cafe_id and c.shift_id = s.id
    left join ops.shift_role_assignments sra on sra.cafe_id = s.cafe_id and sra.shift_id = s.id and sra.is_active = true
    left join ops.payments p on p.cafe_id = s.cafe_id and p.shift_id = s.id
    where s.cafe_id = p_cafe_id and s.business_date = v_today
  ), metrics_7d as (
    select count(distinct s.business_date)::int as active_days, count(distinct s.id)::int as shifts_count,
      coalesce(count(distinct ss.id),0)::int as sessions_count,
      coalesce(sum(oi.qty_delivered + oi.qty_replacement_delivered),0)::int as served_qty,
      coalesce(sum((oi.qty_paid + oi.qty_deferred) * oi.unit_price),0)::numeric(12,2) as net_sales,
      coalesce(sum(oi.qty_remade),0)::int as remake_qty,
      coalesce(sum(oi.qty_cancelled),0)::int as cancelled_qty,
      coalesce(count(distinct c.id),0)::int as complaints_count
    from ops.shifts s
    left join ops.service_sessions ss on ss.cafe_id = s.cafe_id and ss.shift_id = s.id
    left join ops.order_items oi on oi.cafe_id = s.cafe_id and oi.shift_id = s.id
    left join ops.complaints c on c.cafe_id = s.cafe_id and c.shift_id = s.id
    where s.cafe_id = p_cafe_id and s.business_date between v_today - 6 and v_today
  ), metrics_30d as (
    select count(distinct s.business_date)::int as active_days, count(distinct s.id)::int as shifts_count,
      coalesce(count(distinct ss.id),0)::int as sessions_count,
      coalesce(sum(oi.qty_delivered + oi.qty_replacement_delivered),0)::int as served_qty,
      coalesce(sum((oi.qty_paid + oi.qty_deferred) * oi.unit_price),0)::numeric(12,2) as net_sales,
      coalesce(sum(oi.qty_remade),0)::int as remake_qty,
      coalesce(sum(oi.qty_cancelled),0)::int as cancelled_qty,
      coalesce(count(distinct c.id),0)::int as complaints_count
    from ops.shifts s
    left join ops.service_sessions ss on ss.cafe_id = s.cafe_id and ss.shift_id = s.id
    left join ops.order_items oi on oi.cafe_id = s.cafe_id and oi.shift_id = s.id
    left join ops.complaints c on c.cafe_id = s.cafe_id and c.shift_id = s.id
    where s.cafe_id = p_cafe_id and s.business_date between v_today - 29 and v_today
  ), deferred_balance as (
    select coalesce(sum(case dle.entry_kind when 'debt' then dle.amount when 'repayment' then -dle.amount else 0 end),0)::numeric(12,2) as outstanding
    from ops.deferred_ledger_entries dle where dle.cafe_id = p_cafe_id
  ), open_sessions as (
    select count(*)::int as count from ops.service_sessions ss where ss.cafe_id = p_cafe_id and ss.status = 'open'
  ), active_staff_all as (
    select count(*)::int as count from ops.staff_members sm where sm.cafe_id = p_cafe_id and sm.is_active = true
  ), attention as (
    select array_remove(array[
      case when v_cafe.is_active = false then 'cafe_disabled' end,
      case when (select count(*) from owner_rows where is_active = true) = 0 then 'no_active_owner' end,
      case when (select count(*) from latest_subscription) = 0 then 'no_subscription' end,
      case when exists (select 1 from latest_subscription ls where ls.effective_status = 'expired') and ((select id from open_shift) is not null or (select active_days from metrics_7d) > 0) then 'expired_but_active' end,
      case when exists (select 1 from latest_subscription ls where ls.effective_status = 'suspended') and ((select id from open_shift) is not null or (select active_days from metrics_7d) > 0) then 'suspended_but_active' end,
      case when exists (select 1 from open_shift os where os.opened_at <= v_now - interval '18 hours') then 'open_shift_too_long' end,
      case when (select open_complaints_count from metrics_today) > 0 then 'open_complaints' end,
      case when exists (select 1 from latest_subscription ls where ls.effective_status = 'active') and (select active_days from metrics_7d) = 0 and v_cafe.created_at <= v_now - interval '14 days' then 'paid_but_inactive' end
    ], null::text) as reasons
  )
  select jsonb_build_object(
    'generated_at', v_now,
    'cafe', jsonb_build_object(
      'id', v_cafe.id, 'slug', v_cafe.slug, 'display_name', v_cafe.display_name, 'is_active', v_cafe.is_active, 'created_at', v_cafe.created_at,
      'owner_count', (select count(*)::int from owner_rows),
      'active_owner_count', (select count(*)::int from owner_rows where is_active = true),
      'owners', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'full_name', full_name, 'phone', phone, 'owner_label', owner_label, 'is_active', is_active, 'created_at', created_at) order by created_at asc) from owner_rows), '[]'::jsonb)
    ),
    'subscription', jsonb_build_object(
      'current', (select case when ls.id is null then null else jsonb_build_object('id', ls.id, 'starts_at', ls.starts_at, 'ends_at', ls.ends_at, 'grace_days', ls.grace_days, 'status', ls.status, 'effective_status', ls.effective_status, 'notes', ls.notes, 'created_at', ls.created_at, 'updated_at', ls.updated_at, 'countdown_seconds', ls.countdown_seconds) end from latest_subscription ls),
      'history', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'starts_at', s.starts_at, 'ends_at', s.ends_at, 'grace_days', s.grace_days, 'status', s.status, 'effective_status', case when s.status = 'suspended' then 'suspended' when v_now > s.ends_at + make_interval(days => s.grace_days) then 'expired' else s.status end, 'notes', s.notes, 'created_at', s.created_at, 'updated_at', s.updated_at, 'countdown_seconds', greatest(0, floor(extract(epoch from (s.ends_at - v_now))))::bigint) order by s.created_at desc, s.id desc) from (select * from platform.cafe_subscriptions s where s.cafe_id = p_cafe_id order by s.created_at desc, s.id desc limit 12) s), '[]'::jsonb)
    ),
    'usage', jsonb_build_object(
      'last_activity_at', (select last_activity_at from last_activity),
      'today', (select jsonb_build_object('business_date', v_today, 'shifts_count', shifts_count, 'sessions_count', sessions_count, 'served_qty', served_qty, 'net_sales', net_sales, 'remake_qty', remake_qty, 'cancelled_qty', cancelled_qty, 'complaints_count', complaints_count, 'open_complaints_count', open_complaints_count, 'active_staff_count', active_staff_count, 'cash_collected', cash_collected, 'deferred_sold', deferred_sold, 'repayments_total', repayments_total) from (select * from shift_today cross join metrics_today) t),
      'trailing_7d', (select jsonb_build_object('active_days', active_days, 'shifts_count', shifts_count, 'sessions_count', sessions_count, 'served_qty', served_qty, 'net_sales', net_sales, 'remake_qty', remake_qty, 'cancelled_qty', cancelled_qty, 'complaints_count', complaints_count) from metrics_7d),
      'trailing_30d', (select jsonb_build_object('active_days', active_days, 'shifts_count', shifts_count, 'sessions_count', sessions_count, 'served_qty', served_qty, 'net_sales', net_sales, 'remake_qty', remake_qty, 'cancelled_qty', cancelled_qty, 'complaints_count', complaints_count) from metrics_30d)
    ),
    'health', jsonb_build_object(
      'has_open_shift', exists(select 1 from open_shift),
      'open_shift', (select case when os.id is null then null else jsonb_build_object('id', os.id, 'shift_kind', os.shift_kind, 'business_date', os.business_date, 'opened_at', os.opened_at) end from open_shift os),
      'open_sessions_count', (select count from open_sessions),
      'open_complaints_count', (select open_complaints_count from metrics_today),
      'deferred_outstanding', (select outstanding from deferred_balance),
      'active_owner_count', (select count(*)::int from owner_rows where is_active = true),
      'active_staff_count', (select count from active_staff_all),
      'last_shift_closed_at', (select max(s.closed_at) from ops.shifts s where s.cafe_id = p_cafe_id and s.status = 'closed'),
      'attention_reasons', to_jsonb((select reasons from attention))
    ),
    'support', jsonb_build_object(
      'recent_grants', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'is_active', g.is_active, 'notes', g.notes, 'expires_at', g.expires_at, 'revoked_at', g.revoked_at, 'created_at', g.created_at) order by g.created_at desc) from (select * from platform.support_access_grants g where g.cafe_id = p_cafe_id order by g.created_at desc limit 10) g), '[]'::jsonb)
    ),
    'recent', jsonb_build_object(
      'shifts', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'shift_kind', s.shift_kind, 'business_date', s.business_date, 'status', s.status, 'opened_at', s.opened_at, 'closed_at', s.closed_at, 'snapshot_created_at', ss.created_at, 'snapshot_summary', ss.snapshot_json -> 'summary') order by s.business_date desc, s.opened_at desc nulls last) from (select * from ops.shifts s where s.cafe_id = p_cafe_id order by s.business_date desc, s.opened_at desc nulls last limit 12) s left join ops.shift_snapshots ss on ss.cafe_id = s.cafe_id and ss.shift_id = s.id), '[]'::jsonb),
      'complaints', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'complaint_kind', c.complaint_kind, 'status', c.status, 'resolution_kind', c.resolution_kind, 'requested_quantity', c.requested_quantity, 'resolved_quantity', c.resolved_quantity, 'notes', c.notes, 'created_at', c.created_at, 'resolved_at', c.resolved_at, 'session_label', ss.session_label, 'product_name', mp.product_name) order by c.created_at desc) from (select * from ops.complaints c where c.cafe_id = p_cafe_id order by c.created_at desc limit 12) c left join ops.service_sessions ss on ss.cafe_id = c.cafe_id and ss.id = c.service_session_id left join ops.order_items oi on oi.cafe_id = c.cafe_id and oi.id = c.order_item_id left join ops.menu_products mp on mp.cafe_id = oi.cafe_id and mp.id = oi.product_id), '[]'::jsonb),
      'audit_events', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'actor_type', a.actor_type, 'actor_label', a.actor_label, 'event_code', a.event_code, 'entity_type', a.entity_type, 'entity_id', a.entity_id, 'payload', a.payload, 'created_at', a.created_at) order by a.created_at desc) from (select * from ops.audit_events a where a.cafe_id = p_cafe_id order by a.created_at desc limit 20) a), '[]'::jsonb)
    )
  ) into v_result;

  return v_result;
end;
$$;

commit;
-- <<< 0017_phaseB_platform_cafe_detail.sql

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
  station_code text check (station_code in ('barista', 'shisha', 'service')),
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

-- >>> 0021_platform_privacy_refactor_and_admin_views.sql
begin;

create or replace function public.platform_dashboard_overview(
  p_super_admin_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, platform
as $$
declare
  v_admin platform.super_admin_users%rowtype;
  v_now timestamptz := now();
  v_capacity_bytes bigint := null;
  v_used_bytes bigint := 0;
begin
  select *
  into v_admin
  from platform.super_admin_users
  where id = p_super_admin_user_id
    and is_active = true;

  if not found then
    raise exception 'active super admin not found';
  end if;

  select case
    when setting_value_text ~ '^[0-9]+$' then setting_value_text::bigint
    else null
  end
  into v_capacity_bytes
  from platform.runtime_settings
  where setting_key = 'database_capacity_bytes';

  v_used_bytes := pg_database_size(current_database());

  return (
    with latest_subscription as (
      select distinct on (s.cafe_id)
        s.cafe_id,
        s.id,
        s.starts_at,
        s.ends_at,
        s.grace_days,
        s.status,
        s.notes,
        s.created_at,
        s.updated_at,
        case
          when s.status = 'suspended' then 'suspended'
          when v_now > s.ends_at + make_interval(days => s.grace_days) then 'expired'
          else s.status
        end as effective_status,
        greatest(0, floor(extract(epoch from (s.ends_at - v_now))))::bigint as countdown_seconds
      from platform.cafe_subscriptions s
      order by s.cafe_id, s.created_at desc, s.id desc
    ),
    owner_counts as (
      select
        ou.cafe_id,
        count(*)::int as owner_count,
        count(*) filter (where ou.is_active)::int as active_owner_count
      from ops.owner_users ou
      group by ou.cafe_id
    ),
    open_shift_now as (
      select
        s.cafe_id,
        true as has_open_shift,
        min(s.business_date) as open_shift_business_date,
        max(s.opened_at) as open_shift_started_at
      from ops.shifts s
      where s.status = 'open'
      group by s.cafe_id
    ),
    last_activity as (
      select
        activity.cafe_id,
        max(activity.activity_at) as last_activity_at
      from (
        select cafe_id, max(created_at) as activity_at from ops.audit_events group by cafe_id
        union all
        select cafe_id, max(opened_at) as activity_at from ops.shifts group by cafe_id
        union all
        select cafe_id, max(opened_at) as activity_at from ops.service_sessions group by cafe_id
        union all
        select cafe_id, max(created_at) as activity_at from ops.orders group by cafe_id
        union all
        select cafe_id, max(created_at) as activity_at from ops.payments group by cafe_id
        union all
        select cafe_id, max(created_at) as activity_at from ops.complaints group by cafe_id
        union all
        select cafe_id, max(created_at) as activity_at from ops.order_item_issues group by cafe_id
      ) activity
      group by activity.cafe_id
    ),
    portfolio as (
      select
        c.id,
        c.slug,
        c.display_name,
        c.is_active,
        c.created_at,
        coalesce(oc.owner_count, 0) as owner_count,
        coalesce(oc.active_owner_count, 0) as active_owner_count,
        ls.id as subscription_id,
        ls.starts_at as subscription_starts_at,
        ls.ends_at as subscription_ends_at,
        ls.grace_days as subscription_grace_days,
        ls.status as subscription_status,
        ls.effective_status as subscription_effective_status,
        ls.notes as subscription_notes,
        ls.created_at as subscription_created_at,
        ls.updated_at as subscription_updated_at,
        ls.countdown_seconds as subscription_countdown_seconds,
        case
          when ls.id is null then 'none'
          else ls.effective_status
        end as subscription_state,
        case
          when ls.id is null then 'trial_or_free'
          when ls.effective_status = 'suspended' then 'suspended'
          when ls.effective_status = 'expired' then 'overdue'
          when ls.effective_status = 'trial' then 'trial_or_free'
          else 'paid_current'
        end as payment_state,
        case
          when coalesce(os.has_open_shift, false) then 'active_now'
          when la.last_activity_at is not null and la.last_activity_at >= v_now - interval '24 hours' then 'active_today'
          when la.last_activity_at is not null and la.last_activity_at >= v_now - interval '7 days' then 'active_recently'
          else 'inactive'
        end as usage_state,
        la.last_activity_at,
        coalesce(os.has_open_shift, false) as has_open_shift,
        os.open_shift_business_date,
        os.open_shift_started_at,
        array_remove(array[
          case when c.is_active = false then 'cafe_disabled' end,
          case when coalesce(oc.active_owner_count, 0) = 0 then 'no_active_owner' end,
          case when ls.id is null then 'no_subscription' end,
          case when ls.effective_status = 'expired'
            and (coalesce(os.has_open_shift, false) or (la.last_activity_at is not null and la.last_activity_at >= v_now - interval '7 days'))
            then 'expired_but_active'
          end,
          case when ls.effective_status = 'suspended'
            and (coalesce(os.has_open_shift, false) or (la.last_activity_at is not null and la.last_activity_at >= v_now - interval '7 days'))
            then 'suspended_but_active'
          end,
          case when coalesce(os.has_open_shift, false) and os.open_shift_started_at <= v_now - interval '18 hours' then 'open_shift_too_long' end,
          case when ls.effective_status = 'active'
            and coalesce(os.has_open_shift, false) = false
            and (la.last_activity_at is null or la.last_activity_at < v_now - interval '14 days')
            and c.created_at <= v_now - interval '14 days'
            then 'paid_but_inactive'
          end
        ], null::text) as attention_reasons
      from ops.cafes c
      left join owner_counts oc
        on oc.cafe_id = c.id
      left join latest_subscription ls
        on ls.cafe_id = c.id
      left join open_shift_now os
        on os.cafe_id = c.id
      left join last_activity la
        on la.cafe_id = c.id
    )
    select jsonb_build_object(
      'generated_at', v_now,
      'database_usage', jsonb_build_object(
        'used_bytes', v_used_bytes,
        'used_pretty', pg_size_pretty(v_used_bytes),
        'capacity_bytes', v_capacity_bytes,
        'capacity_pretty', case when v_capacity_bytes is null then null else pg_size_pretty(v_capacity_bytes) end,
        'usage_percent', case when v_capacity_bytes is null or v_capacity_bytes = 0 then null else round((v_used_bytes::numeric / v_capacity_bytes::numeric) * 100, 2) end,
        'database_name', current_database()
      ),
      'summary', jsonb_build_object(
        'cafes_total', (select count(*)::int from portfolio),
        'cafes_active', (select count(*)::int from portfolio where is_active),
        'paid_current', (select count(*)::int from portfolio where payment_state = 'paid_current'),
        'trial_or_free', (select count(*)::int from portfolio where payment_state = 'trial_or_free'),
        'overdue', (select count(*)::int from portfolio where payment_state = 'overdue'),
        'suspended', (select count(*)::int from portfolio where payment_state = 'suspended'),
        'no_subscription', (select count(*)::int from portfolio where subscription_state = 'none'),
        'active_now', (select count(*)::int from portfolio where usage_state = 'active_now'),
        'active_today', (select count(*)::int from portfolio where usage_state = 'active_today'),
        'inactive', (select count(*)::int from portfolio where usage_state = 'inactive'),
        'needs_attention', (select count(*)::int from portfolio where coalesce(array_length(attention_reasons, 1), 0) > 0),
        'open_shifts_now', (select count(*)::int from portfolio where has_open_shift)
      ),
      'cafes', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'slug', p.slug,
            'display_name', p.display_name,
            'is_active', p.is_active,
            'created_at', p.created_at,
            'owner_count', p.owner_count,
            'active_owner_count', p.active_owner_count,
            'current_subscription', case
              when p.subscription_id is null then null
              else jsonb_build_object(
                'id', p.subscription_id,
                'starts_at', p.subscription_starts_at,
                'ends_at', p.subscription_ends_at,
                'grace_days', p.subscription_grace_days,
                'status', p.subscription_status,
                'effective_status', p.subscription_effective_status,
                'notes', p.subscription_notes,
                'created_at', p.subscription_created_at,
                'updated_at', p.subscription_updated_at,
                'countdown_seconds', p.subscription_countdown_seconds
              )
            end,
            'subscription_state', p.subscription_state,
            'payment_state', p.payment_state,
            'usage_state', p.usage_state,
            'last_activity_at', p.last_activity_at,
            'has_open_shift', p.has_open_shift,
            'open_shift_business_date', p.open_shift_business_date,
            'open_shift_started_at', p.open_shift_started_at,
            'attention_reasons', to_jsonb(p.attention_reasons)
          )
          order by p.last_activity_at desc nulls last, p.created_at desc
        )
        from portfolio p
      ), '[]'::jsonb),
      'attention_queue', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'slug', p.slug,
            'display_name', p.display_name,
            'usage_state', p.usage_state,
            'payment_state', p.payment_state,
            'last_activity_at', p.last_activity_at,
            'attention_reasons', to_jsonb(p.attention_reasons)
          )
          order by p.last_activity_at desc nulls last, p.created_at desc
        )
        from portfolio p
        where coalesce(array_length(p.attention_reasons, 1), 0) > 0
      ), '[]'::jsonb)
    )
  );
end;
$$;

create or replace function public.platform_get_cafe_detail(
  p_super_admin_user_id uuid,
  p_cafe_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, platform
as $$
declare
  v_admin platform.super_admin_users%rowtype;
  v_cafe ops.cafes%rowtype;
  v_now timestamptz := now();
  v_result jsonb;
begin
  select *
  into v_admin
  from platform.super_admin_users
  where id = p_super_admin_user_id
    and is_active = true;

  if not found then
    raise exception 'active super admin not found';
  end if;

  select *
  into v_cafe
  from ops.cafes
  where id = p_cafe_id;

  if not found then
    raise exception 'cafe_not_found';
  end if;

  with latest_subscription as (
    select distinct on (s.cafe_id)
      s.cafe_id,
      s.id,
      s.starts_at,
      s.ends_at,
      s.grace_days,
      s.status,
      s.notes,
      s.created_at,
      s.updated_at,
      case
        when s.status = 'suspended' then 'suspended'
        when v_now > s.ends_at + make_interval(days => s.grace_days) then 'expired'
        else s.status
      end as effective_status,
      greatest(0, floor(extract(epoch from (s.ends_at - v_now))))::bigint as countdown_seconds
    from platform.cafe_subscriptions s
    where s.cafe_id = p_cafe_id
    order by s.cafe_id, s.created_at desc, s.id desc
  ),
  owner_rows as (
    select
      ou.id,
      ou.full_name,
      ou.phone,
      ou.owner_label,
      ou.is_active,
      ou.created_at
    from ops.owner_users ou
    where ou.cafe_id = p_cafe_id
    order by ou.created_at asc
  ),
  last_activity as (
    select max(activity_at) as last_activity_at
    from (
      select max(created_at) as activity_at from ops.audit_events where cafe_id = p_cafe_id
      union all
      select max(opened_at) as activity_at from ops.shifts where cafe_id = p_cafe_id
      union all
      select max(opened_at) as activity_at from ops.service_sessions where cafe_id = p_cafe_id
      union all
      select max(created_at) as activity_at from ops.orders where cafe_id = p_cafe_id
      union all
      select max(created_at) as activity_at from ops.payments where cafe_id = p_cafe_id
      union all
      select max(created_at) as activity_at from ops.complaints where cafe_id = p_cafe_id
      union all
      select max(created_at) as activity_at from ops.order_item_issues where cafe_id = p_cafe_id
    ) activity
  ),
  open_shift as (
    select
      s.id,
      s.shift_kind,
      s.business_date,
      s.opened_at
    from ops.shifts s
    where s.cafe_id = p_cafe_id
      and s.status = 'open'
    order by s.business_date desc, s.opened_at desc nulls last
    limit 1
  ),
  usage_state as (
    select case
      when exists(select 1 from open_shift) then 'active_now'
      when (select last_activity_at from last_activity) is not null and (select last_activity_at from last_activity) >= v_now - interval '24 hours' then 'active_today'
      when (select last_activity_at from last_activity) is not null and (select last_activity_at from last_activity) >= v_now - interval '7 days' then 'active_recently'
      else 'inactive'
    end as value
  ),
  attention as (
    select array_remove(array[
      case when v_cafe.is_active = false then 'cafe_disabled' end,
      case when (select count(*) from owner_rows where is_active = true) = 0 then 'no_active_owner' end,
      case when (select count(*) from latest_subscription) = 0 then 'no_subscription' end,
      case when exists (select 1 from latest_subscription ls where ls.effective_status = 'expired')
        and (exists (select 1 from open_shift) or ((select last_activity_at from last_activity) is not null and (select last_activity_at from last_activity) >= v_now - interval '7 days'))
        then 'expired_but_active'
      end,
      case when exists (select 1 from latest_subscription ls where ls.effective_status = 'suspended')
        and (exists (select 1 from open_shift) or ((select last_activity_at from last_activity) is not null and (select last_activity_at from last_activity) >= v_now - interval '7 days'))
        then 'suspended_but_active'
      end,
      case when exists (select 1 from open_shift os where os.opened_at <= v_now - interval '18 hours') then 'open_shift_too_long' end,
      case when exists (select 1 from latest_subscription ls where ls.effective_status = 'active')
        and not exists (select 1 from open_shift)
        and ((select last_activity_at from last_activity) is null or (select last_activity_at from last_activity) < v_now - interval '14 days')
        and v_cafe.created_at <= v_now - interval '14 days'
        then 'paid_but_inactive'
      end
    ], null::text) as reasons
  )
  select jsonb_build_object(
    'generated_at', v_now,
    'cafe', jsonb_build_object(
      'id', v_cafe.id,
      'slug', v_cafe.slug,
      'display_name', v_cafe.display_name,
      'is_active', v_cafe.is_active,
      'created_at', v_cafe.created_at,
      'owner_count', (select count(*)::int from owner_rows),
      'active_owner_count', (select count(*)::int from owner_rows where is_active = true),
      'owners', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', r.id,
            'full_name', r.full_name,
            'phone', r.phone,
            'owner_label', r.owner_label,
            'is_active', r.is_active,
            'created_at', r.created_at
          )
          order by r.created_at asc
        )
        from owner_rows r
      ), '[]'::jsonb)
    ),
    'subscription', jsonb_build_object(
      'current', (
        select case
          when ls.id is null then null
          else jsonb_build_object(
            'id', ls.id,
            'starts_at', ls.starts_at,
            'ends_at', ls.ends_at,
            'grace_days', ls.grace_days,
            'status', ls.status,
            'effective_status', ls.effective_status,
            'notes', ls.notes,
            'created_at', ls.created_at,
            'updated_at', ls.updated_at,
            'countdown_seconds', ls.countdown_seconds
          )
        end
        from latest_subscription ls
      ),
      'history', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', s.id,
            'starts_at', s.starts_at,
            'ends_at', s.ends_at,
            'grace_days', s.grace_days,
            'status', s.status,
            'effective_status', case
              when s.status = 'suspended' then 'suspended'
              when v_now > s.ends_at + make_interval(days => s.grace_days) then 'expired'
              else s.status
            end,
            'notes', s.notes,
            'created_at', s.created_at,
            'updated_at', s.updated_at,
            'countdown_seconds', greatest(0, floor(extract(epoch from (s.ends_at - v_now))))::bigint
          )
          order by s.created_at desc, s.id desc
        )
        from (
          select *
          from platform.cafe_subscriptions s
          where s.cafe_id = p_cafe_id
          order by s.created_at desc, s.id desc
          limit 12
        ) s
      ), '[]'::jsonb)
    ),
    'activity', jsonb_build_object(
      'last_activity_at', (select last_activity_at from last_activity),
      'usage_state', (select value from usage_state),
      'has_open_shift', exists(select 1 from open_shift),
      'open_shift', (
        select case
          when os.id is null then null
          else jsonb_build_object(
            'id', os.id,
            'shift_kind', os.shift_kind,
            'business_date', os.business_date,
            'opened_at', os.opened_at
          )
        end
        from open_shift os
      ),
      'last_shift_closed_at', (
        select max(s.closed_at)
        from ops.shifts s
        where s.cafe_id = p_cafe_id
          and s.status = 'closed'
      )
    ),
    'billing_follow', jsonb_build_object(
      'payment_state', case
        when (select count(*) from latest_subscription) = 0 then 'trial_or_free'
        when exists (select 1 from latest_subscription ls where ls.effective_status = 'suspended') then 'suspended'
        when exists (select 1 from latest_subscription ls where ls.effective_status = 'expired') then 'overdue'
        when exists (select 1 from latest_subscription ls where ls.effective_status = 'trial') then 'trial_or_free'
        else 'paid_current'
      end,
      'current_subscription_effective_status', (select effective_status from latest_subscription limit 1),
      'subscription_expires_at', (select ends_at from latest_subscription limit 1)
    ),
    'attention', jsonb_build_object(
      'reasons', to_jsonb((select reasons from attention)),
      'scope', 'administrative_only'
    )
  ) into v_result;

  return v_result;
end;
$$;

commit;
-- <<< 0021_platform_privacy_refactor_and_admin_views.sql

-- >>> 0022_remove_support_grants_and_lock_final_access.sql
begin;

create or replace function app.has_platform_support_access(
  p_cafe_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, ops, platform, app
as $$
  select false
$$;

create or replace function app.can_access_cafe(
  p_cafe_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, ops, platform, app
as $$
  select p_cafe_id is not null
    and app.current_cafe_id() = p_cafe_id
$$;

drop function if exists public.platform_grant_support_access(uuid, uuid, text, timestamptz);

comment on table platform.support_access_grants is
  'legacy archive only after 0022; new support grants are no longer part of the canonical platform access model';

commit;
-- <<< 0022_remove_support_grants_and_lock_final_access.sql

-- >>> 0023_platform_subscription_money_follow_and_create_flow.sql
begin;

alter table platform.cafe_subscriptions
  add column if not exists amount_paid numeric(12,2) not null default 0;

alter table platform.cafe_subscriptions
  add column if not exists is_complimentary boolean not null default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chk_platform_cafe_subscriptions_amount_paid_nonnegative'
  ) then
    alter table platform.cafe_subscriptions
      add constraint chk_platform_cafe_subscriptions_amount_paid_nonnegative
      check (amount_paid >= 0);
  end if;
end;
$$;

drop function if exists public.platform_create_cafe_with_owner(uuid, text, text, text, text, text);

create or replace function public.platform_create_cafe_with_owner(
  p_super_admin_user_id uuid,
  p_cafe_slug text,
  p_cafe_display_name text,
  p_owner_full_name text,
  p_owner_phone text,
  p_owner_password text,
  p_subscription_starts_at timestamptz default null,
  p_subscription_ends_at timestamptz default null,
  p_subscription_grace_days integer default 0,
  p_subscription_status text default 'trial',
  p_subscription_amount_paid numeric default 0,
  p_subscription_is_complimentary boolean default false,
  p_subscription_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, platform
as $$
declare
  v_admin platform.super_admin_users%rowtype;
  v_cafe_id uuid;
  v_owner_id uuid;
  v_slug text;
  v_subscription_id uuid;
  v_subscription_status text;
  v_should_create_subscription boolean := p_subscription_starts_at is not null or p_subscription_ends_at is not null;
begin
  select *
  into v_admin
  from platform.super_admin_users
  where id = p_super_admin_user_id
    and is_active = true;

  if not found then
    raise exception 'active super admin not found';
  end if;

  v_slug := lower(nullif(btrim(p_cafe_slug), ''));

  if v_slug is null then
    raise exception 'p_cafe_slug is required';
  end if;

  if nullif(btrim(p_cafe_display_name), '') is null then
    raise exception 'p_cafe_display_name is required';
  end if;

  if nullif(btrim(p_owner_full_name), '') is null then
    raise exception 'p_owner_full_name is required';
  end if;

  if nullif(btrim(p_owner_phone), '') is null then
    raise exception 'p_owner_phone is required';
  end if;

  if nullif(p_owner_password, '') is null then
    raise exception 'p_owner_password is required';
  end if;

  if v_should_create_subscription then
    if p_subscription_starts_at is null or p_subscription_ends_at is null then
      raise exception 'subscription dates are required';
    end if;

    if p_subscription_ends_at <= p_subscription_starts_at then
      raise exception 'subscription end must be after start';
    end if;

    if coalesce(p_subscription_grace_days, 0) < 0 then
      raise exception 'subscription grace_days must be >= 0';
    end if;

    if coalesce(p_subscription_amount_paid, 0) < 0 then
      raise exception 'subscription amount_paid must be >= 0';
    end if;

    v_subscription_status := lower(coalesce(nullif(btrim(p_subscription_status), ''), 'trial'));
    if v_subscription_status not in ('trial', 'active', 'expired', 'suspended') then
      raise exception 'invalid subscription status';
    end if;
  end if;

  insert into ops.cafes (
    slug,
    display_name,
    is_active
  )
  values (
    v_slug,
    btrim(p_cafe_display_name),
    true
  )
  returning id into v_cafe_id;

  insert into ops.owner_users (
    cafe_id,
    full_name,
    phone,
    password_hash,
    owner_label,
    is_active
  )
  values (
    v_cafe_id,
    btrim(p_owner_full_name),
    btrim(p_owner_phone),
    extensions.crypt(p_owner_password, extensions.gen_salt('bf')),
    'owner',
    true
  )
  returning id into v_owner_id;

  if v_should_create_subscription then
    insert into platform.cafe_subscriptions (
      cafe_id,
      starts_at,
      ends_at,
      grace_days,
      status,
      amount_paid,
      is_complimentary,
      notes,
      created_by_super_admin_user_id,
      created_at,
      updated_at
    )
    values (
      v_cafe_id,
      p_subscription_starts_at,
      p_subscription_ends_at,
      coalesce(p_subscription_grace_days, 0),
      v_subscription_status,
      coalesce(p_subscription_amount_paid, 0),
      coalesce(p_subscription_is_complimentary, false),
      nullif(btrim(coalesce(p_subscription_notes, '')), ''),
      p_super_admin_user_id,
      now(),
      now()
    )
    returning id into v_subscription_id;
  end if;

  insert into ops.audit_events (
    cafe_id,
    actor_type,
    actor_label,
    event_code,
    entity_type,
    entity_id,
    payload
  )
  values (
    v_cafe_id,
    'super_admin',
    v_admin.email,
    'platform_create_cafe_with_owner',
    'cafe',
    v_cafe_id,
    jsonb_build_object(
      'owner_user_id', v_owner_id,
      'owner_phone', btrim(p_owner_phone),
      'owner_label', 'owner',
      'subscription', case
        when v_subscription_id is null then null
        else jsonb_build_object(
          'subscription_id', v_subscription_id,
          'starts_at', p_subscription_starts_at,
          'ends_at', p_subscription_ends_at,
          'grace_days', coalesce(p_subscription_grace_days, 0),
          'status', v_subscription_status,
          'amount_paid', coalesce(p_subscription_amount_paid, 0),
          'is_complimentary', coalesce(p_subscription_is_complimentary, false),
          'notes', nullif(btrim(coalesce(p_subscription_notes, '')), '')
        )
      end
    )
  );

  return jsonb_build_object(
    'ok', true,
    'cafe_id', v_cafe_id,
    'owner_user_id', v_owner_id,
    'subscription_id', v_subscription_id,
    'slug', v_slug
  );
end;
$$;

create or replace function public.platform_record_cafe_subscription(
  p_super_admin_user_id uuid,
  p_cafe_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_grace_days integer default 0,
  p_status text default 'active',
  p_amount_paid numeric default 0,
  p_is_complimentary boolean default false,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, platform
as $$
declare
  v_admin platform.super_admin_users%rowtype;
  v_subscription_id uuid;
  v_status text;
begin
  select *
  into v_admin
  from platform.super_admin_users
  where id = p_super_admin_user_id
    and is_active = true;

  if not found then
    raise exception 'active super admin not found';
  end if;

  perform 1
  from ops.cafes
  where id = p_cafe_id;

  if not found then
    raise exception 'cafe not found';
  end if;

  if p_starts_at is null or p_ends_at is null then
    raise exception 'subscription dates are required';
  end if;

  if p_ends_at <= p_starts_at then
    raise exception 'subscription end must be after start';
  end if;

  if coalesce(p_grace_days, 0) < 0 then
    raise exception 'grace_days must be >= 0';
  end if;

  if coalesce(p_amount_paid, 0) < 0 then
    raise exception 'amount_paid must be >= 0';
  end if;

  v_status := lower(coalesce(nullif(btrim(p_status), ''), 'active'));

  if v_status not in ('trial', 'active', 'expired', 'suspended') then
    raise exception 'invalid subscription status';
  end if;

  insert into platform.cafe_subscriptions (
    cafe_id,
    starts_at,
    ends_at,
    grace_days,
    status,
    amount_paid,
    is_complimentary,
    notes,
    created_by_super_admin_user_id,
    created_at,
    updated_at
  )
  values (
    p_cafe_id,
    p_starts_at,
    p_ends_at,
    coalesce(p_grace_days, 0),
    v_status,
    coalesce(p_amount_paid, 0),
    coalesce(p_is_complimentary, false),
    nullif(btrim(coalesce(p_notes, '')), ''),
    p_super_admin_user_id,
    now(),
    now()
  )
  returning id into v_subscription_id;

  insert into ops.audit_events (
    cafe_id,
    actor_type,
    actor_label,
    event_code,
    entity_type,
    entity_id,
    payload
  )
  values (
    p_cafe_id,
    'super_admin',
    v_admin.email,
    'platform_record_cafe_subscription',
    'cafe_subscription',
    v_subscription_id,
    jsonb_build_object(
      'starts_at', p_starts_at,
      'ends_at', p_ends_at,
      'grace_days', coalesce(p_grace_days, 0),
      'status', v_status,
      'amount_paid', coalesce(p_amount_paid, 0),
      'is_complimentary', coalesce(p_is_complimentary, false),
      'notes', nullif(btrim(coalesce(p_notes, '')), '')
    )
  );

  return jsonb_build_object(
    'ok', true,
    'subscription_id', v_subscription_id,
    'status', v_status
  );
end;
$$;

create or replace function public.platform_list_cafes()
returns jsonb
language sql
security definer
set search_path = public, ops, platform
as $$
  with latest_subscription as (
    select distinct on (s.cafe_id)
      s.cafe_id,
      s.id,
      s.starts_at,
      s.ends_at,
      s.grace_days,
      s.status,
      s.amount_paid,
      s.is_complimentary,
      s.notes,
      s.created_at,
      s.updated_at,
      case
        when s.status = 'suspended' then 'suspended'
        when now() > s.ends_at + make_interval(days => s.grace_days) then 'expired'
        else s.status
      end as effective_status,
      greatest(0, floor(extract(epoch from (s.ends_at - now()))))::bigint as countdown_seconds
    from platform.cafe_subscriptions s
    order by s.cafe_id, s.created_at desc, s.id desc
  ),
  last_activity as (
    select
      activity.cafe_id,
      max(activity.activity_at) as last_activity_at
    from (
      select cafe_id, max(created_at) as activity_at from ops.audit_events group by cafe_id
      union all
      select cafe_id, max(opened_at) as activity_at from ops.shifts group by cafe_id
      union all
      select cafe_id, max(opened_at) as activity_at from ops.service_sessions group by cafe_id
      union all
      select cafe_id, max(created_at) as activity_at from ops.orders group by cafe_id
      union all
      select cafe_id, max(created_at) as activity_at from ops.payments group by cafe_id
      union all
      select cafe_id, max(created_at) as activity_at from ops.complaints group by cafe_id
      union all
      select cafe_id, max(created_at) as activity_at from ops.order_item_issues group by cafe_id
    ) activity
    group by activity.cafe_id
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by x.last_activity_at desc nulls last, x.created_at desc), '[]'::jsonb)
  from (
    select
      c.id,
      c.slug,
      c.display_name,
      c.is_active,
      c.created_at,
      la.last_activity_at,
      (
        select count(*)::integer
        from ops.owner_users ou
        where ou.cafe_id = c.id
      ) as owner_count,
      (
        select count(*)::integer
        from ops.owner_users ou
        where ou.cafe_id = c.id
          and ou.is_active = true
      ) as active_owner_count,
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', ou.id,
            'full_name', ou.full_name,
            'phone', ou.phone,
            'owner_label', ou.owner_label,
            'is_active', ou.is_active,
            'created_at', ou.created_at
          ) order by ou.created_at asc
        )
        from ops.owner_users ou
        where ou.cafe_id = c.id
      ) as owners,
      case
        when ls.cafe_id is null then null
        else jsonb_build_object(
          'id', ls.id,
          'starts_at', ls.starts_at,
          'ends_at', ls.ends_at,
          'grace_days', ls.grace_days,
          'status', ls.status,
          'effective_status', ls.effective_status,
          'amount_paid', ls.amount_paid,
          'is_complimentary', ls.is_complimentary,
          'notes', ls.notes,
          'created_at', ls.created_at,
          'updated_at', ls.updated_at,
          'countdown_seconds', ls.countdown_seconds
        )
      end as current_subscription
    from ops.cafes c
    left join latest_subscription ls
      on ls.cafe_id = c.id
    left join last_activity la
      on la.cafe_id = c.id
  ) x;
$$;

create or replace function public.platform_list_cafe_subscriptions(
  p_super_admin_user_id uuid,
  p_cafe_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, platform
as $$
declare
  v_admin platform.super_admin_users%rowtype;
begin
  select *
  into v_admin
  from platform.super_admin_users
  where id = p_super_admin_user_id
    and is_active = true;

  if not found then
    raise exception 'active super admin not found';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'cafe_id', s.cafe_id,
        'starts_at', s.starts_at,
        'ends_at', s.ends_at,
        'grace_days', s.grace_days,
        'status', s.status,
        'effective_status', case
          when s.status = 'suspended' then 'suspended'
          when now() > s.ends_at + make_interval(days => s.grace_days) then 'expired'
          else s.status
        end,
        'amount_paid', s.amount_paid,
        'is_complimentary', s.is_complimentary,
        'notes', s.notes,
        'created_at', s.created_at,
        'updated_at', s.updated_at,
        'countdown_seconds', greatest(0, floor(extract(epoch from (s.ends_at - now()))))::bigint
      )
      order by s.created_at desc, s.id desc
    )
    from platform.cafe_subscriptions s
    where s.cafe_id = p_cafe_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.platform_get_cafe_detail(
  p_super_admin_user_id uuid,
  p_cafe_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, platform
as $$
declare
  v_admin platform.super_admin_users%rowtype;
  v_cafe ops.cafes%rowtype;
  v_now timestamptz := now();
  v_result jsonb;
begin
  select *
  into v_admin
  from platform.super_admin_users
  where id = p_super_admin_user_id
    and is_active = true;

  if not found then
    raise exception 'active super admin not found';
  end if;

  select *
  into v_cafe
  from ops.cafes
  where id = p_cafe_id;

  if not found then
    raise exception 'cafe_not_found';
  end if;

  with latest_subscription as (
    select distinct on (s.cafe_id)
      s.cafe_id,
      s.id,
      s.starts_at,
      s.ends_at,
      s.grace_days,
      s.status,
      s.amount_paid,
      s.is_complimentary,
      s.notes,
      s.created_at,
      s.updated_at,
      case
        when s.status = 'suspended' then 'suspended'
        when v_now > s.ends_at + make_interval(days => s.grace_days) then 'expired'
        else s.status
      end as effective_status,
      greatest(0, floor(extract(epoch from (s.ends_at - v_now))))::bigint as countdown_seconds
    from platform.cafe_subscriptions s
    where s.cafe_id = p_cafe_id
    order by s.cafe_id, s.created_at desc, s.id desc
  ),
  owner_rows as (
    select
      ou.id,
      ou.full_name,
      ou.phone,
      ou.owner_label,
      ou.is_active,
      ou.created_at
    from ops.owner_users ou
    where ou.cafe_id = p_cafe_id
    order by ou.created_at asc
  ),
  last_activity as (
    select max(activity_at) as last_activity_at
    from (
      select max(created_at) as activity_at from ops.audit_events where cafe_id = p_cafe_id
      union all
      select max(opened_at) as activity_at from ops.shifts where cafe_id = p_cafe_id
      union all
      select max(opened_at) as activity_at from ops.service_sessions where cafe_id = p_cafe_id
      union all
      select max(created_at) as activity_at from ops.orders where cafe_id = p_cafe_id
      union all
      select max(created_at) as activity_at from ops.payments where cafe_id = p_cafe_id
      union all
      select max(created_at) as activity_at from ops.complaints where cafe_id = p_cafe_id
      union all
      select max(created_at) as activity_at from ops.order_item_issues where cafe_id = p_cafe_id
    ) activity
  ),
  open_shift as (
    select
      s.id,
      s.shift_kind,
      s.business_date,
      s.opened_at
    from ops.shifts s
    where s.cafe_id = p_cafe_id
      and s.status = 'open'
    order by s.business_date desc, s.opened_at desc nulls last
    limit 1
  ),
  usage_state as (
    select case
      when exists(select 1 from open_shift) then 'active_now'
      when (select last_activity_at from last_activity) is not null and (select last_activity_at from last_activity) >= v_now - interval '24 hours' then 'active_today'
      when (select last_activity_at from last_activity) is not null and (select last_activity_at from last_activity) >= v_now - interval '7 days' then 'active_recently'
      else 'inactive'
    end as value
  ),
  attention as (
    select array_remove(array[
      case when v_cafe.is_active = false then 'cafe_disabled' end,
      case when (select count(*) from owner_rows where is_active = true) = 0 then 'no_active_owner' end,
      case when (select count(*) from latest_subscription) = 0 then 'no_subscription' end,
      case when exists (select 1 from latest_subscription ls where ls.effective_status = 'expired')
        and (exists (select 1 from open_shift) or ((select last_activity_at from last_activity) is not null and (select last_activity_at from last_activity) >= v_now - interval '7 days'))
        then 'expired_but_active'
      end,
      case when exists (select 1 from latest_subscription ls where ls.effective_status = 'suspended')
        and (exists (select 1 from open_shift) or ((select last_activity_at from last_activity) is not null and (select last_activity_at from last_activity) >= v_now - interval '7 days'))
        then 'suspended_but_active'
      end,
      case when exists (select 1 from open_shift os where os.opened_at <= v_now - interval '18 hours') then 'open_shift_too_long' end,
      case when exists (select 1 from latest_subscription ls where ls.effective_status = 'active')
        and not exists (select 1 from open_shift)
        and ((select last_activity_at from last_activity) is null or (select last_activity_at from last_activity) < v_now - interval '14 days')
        and v_cafe.created_at <= v_now - interval '14 days'
        then 'paid_but_inactive'
      end
    ], null::text) as reasons
  )
  select jsonb_build_object(
    'generated_at', v_now,
    'cafe', jsonb_build_object(
      'id', v_cafe.id,
      'slug', v_cafe.slug,
      'display_name', v_cafe.display_name,
      'is_active', v_cafe.is_active,
      'created_at', v_cafe.created_at,
      'owner_count', (select count(*)::int from owner_rows),
      'active_owner_count', (select count(*)::int from owner_rows where is_active = true),
      'owners', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', r.id,
            'full_name', r.full_name,
            'phone', r.phone,
            'owner_label', r.owner_label,
            'is_active', r.is_active,
            'created_at', r.created_at
          )
          order by r.created_at asc
        )
        from owner_rows r
      ), '[]'::jsonb)
    ),
    'subscription', jsonb_build_object(
      'current', (
        select case
          when ls.id is null then null
          else jsonb_build_object(
            'id', ls.id,
            'starts_at', ls.starts_at,
            'ends_at', ls.ends_at,
            'grace_days', ls.grace_days,
            'status', ls.status,
            'effective_status', ls.effective_status,
            'amount_paid', ls.amount_paid,
            'is_complimentary', ls.is_complimentary,
            'notes', ls.notes,
            'created_at', ls.created_at,
            'updated_at', ls.updated_at,
            'countdown_seconds', ls.countdown_seconds
          )
        end
        from latest_subscription ls
      ),
      'history', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', s.id,
            'starts_at', s.starts_at,
            'ends_at', s.ends_at,
            'grace_days', s.grace_days,
            'status', s.status,
            'effective_status', case
              when s.status = 'suspended' then 'suspended'
              when v_now > s.ends_at + make_interval(days => s.grace_days) then 'expired'
              else s.status
            end,
            'amount_paid', s.amount_paid,
            'is_complimentary', s.is_complimentary,
            'notes', s.notes,
            'created_at', s.created_at,
            'updated_at', s.updated_at,
            'countdown_seconds', greatest(0, floor(extract(epoch from (s.ends_at - v_now))))::bigint
          )
          order by s.created_at desc, s.id desc
        )
        from (
          select *
          from platform.cafe_subscriptions s
          where s.cafe_id = p_cafe_id
          order by s.created_at desc, s.id desc
          limit 12
        ) s
      ), '[]'::jsonb)
    ),
    'activity', jsonb_build_object(
      'last_activity_at', (select last_activity_at from last_activity),
      'usage_state', (select value from usage_state),
      'has_open_shift', exists(select 1 from open_shift),
      'open_shift', (
        select case
          when os.id is null then null
          else jsonb_build_object(
            'id', os.id,
            'shift_kind', os.shift_kind,
            'business_date', os.business_date,
            'opened_at', os.opened_at
          )
        end
        from open_shift os
      ),
      'last_shift_closed_at', (
        select max(s.closed_at)
        from ops.shifts s
        where s.cafe_id = p_cafe_id
          and s.status = 'closed'
      )
    ),
    'billing_follow', jsonb_build_object(
      'payment_state', case
        when (select count(*) from latest_subscription) = 0 then 'trial_or_free'
        when exists (select 1 from latest_subscription ls where ls.effective_status = 'suspended') then 'suspended'
        when exists (select 1 from latest_subscription ls where ls.effective_status = 'expired') then 'overdue'
        when exists (select 1 from latest_subscription ls where ls.effective_status = 'trial') then 'trial_or_free'
        else 'paid_current'
      end,
      'current_subscription_effective_status', (select effective_status from latest_subscription limit 1),
      'subscription_expires_at', (select ends_at from latest_subscription limit 1)
    ),
    'attention', jsonb_build_object(
      'reasons', to_jsonb((select reasons from attention)),
      'scope', 'administrative_only'
    )
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.platform_money_follow_overview(
  p_super_admin_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, platform
as $$
declare
  v_admin platform.super_admin_users%rowtype;
  v_now timestamptz := now();
  v_result jsonb;
begin
  select *
  into v_admin
  from platform.super_admin_users
  where id = p_super_admin_user_id
    and is_active = true;

  if not found then
    raise exception 'active super admin not found';
  end if;

  with latest_subscription as (
    select distinct on (s.cafe_id)
      s.cafe_id,
      s.id,
      s.starts_at,
      s.ends_at,
      s.grace_days,
      s.status,
      s.amount_paid,
      s.is_complimentary,
      s.notes,
      s.created_at,
      case
        when s.status = 'suspended' then 'suspended'
        when v_now > s.ends_at + make_interval(days => s.grace_days) then 'expired'
        else s.status
      end as effective_status,
      greatest(0, floor(extract(epoch from (s.ends_at - v_now))))::bigint as countdown_seconds
    from platform.cafe_subscriptions s
    order by s.cafe_id, s.created_at desc, s.id desc
  ),
  last_activity as (
    select
      activity.cafe_id,
      max(activity.activity_at) as last_activity_at
    from (
      select cafe_id, max(created_at) as activity_at from ops.audit_events group by cafe_id
      union all
      select cafe_id, max(opened_at) as activity_at from ops.shifts group by cafe_id
      union all
      select cafe_id, max(opened_at) as activity_at from ops.service_sessions group by cafe_id
      union all
      select cafe_id, max(created_at) as activity_at from ops.orders group by cafe_id
      union all
      select cafe_id, max(created_at) as activity_at from ops.payments group by cafe_id
    ) activity
    group by activity.cafe_id
  ),
  open_shift_now as (
    select s.cafe_id, true as has_open_shift
    from ops.shifts s
    where s.status = 'open'
    group by s.cafe_id
  ),
  current_watchlist as (
    select
      c.id as cafe_id,
      c.slug,
      c.display_name,
      c.is_active,
      ls.id as subscription_id,
      ls.starts_at,
      ls.ends_at,
      ls.status,
      ls.effective_status,
      ls.amount_paid,
      ls.is_complimentary,
      ls.notes,
      ls.countdown_seconds,
      la.last_activity_at,
      coalesce(os.has_open_shift, false) as has_open_shift,
      case
        when ls.id is null then 'trial_or_free'
        when ls.effective_status = 'suspended' then 'suspended'
        when ls.effective_status = 'expired' then 'overdue'
        when ls.effective_status = 'trial' then 'trial_or_free'
        else 'paid_current'
      end as payment_state
    from ops.cafes c
    left join latest_subscription ls on ls.cafe_id = c.id
    left join last_activity la on la.cafe_id = c.id
    left join open_shift_now os on os.cafe_id = c.id
  )
  select jsonb_build_object(
    'generated_at', v_now,
    'summary', jsonb_build_object(
      'subscriptions_total', (select count(*)::int from platform.cafe_subscriptions),
      'paid_entries', (select count(*)::int from platform.cafe_subscriptions where is_complimentary = false and amount_paid > 0),
      'complimentary_entries', (select count(*)::int from platform.cafe_subscriptions where is_complimentary = true),
      'collected_total', coalesce((select sum(amount_paid) from platform.cafe_subscriptions where is_complimentary = false), 0)::numeric(12,2),
      'overdue_count', (select count(*)::int from current_watchlist where payment_state = 'overdue'),
      'due_soon_count', (select count(*)::int from current_watchlist where effective_status in ('active', 'trial') and ends_at <= v_now + interval '7 days' and ends_at >= v_now),
      'suspended_count', (select count(*)::int from current_watchlist where payment_state = 'suspended')
    ),
    'watchlist', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'cafe_id', w.cafe_id,
          'slug', w.slug,
          'display_name', w.display_name,
          'is_active', w.is_active,
          'payment_state', w.payment_state,
          'effective_status', w.effective_status,
          'ends_at', w.ends_at,
          'countdown_seconds', w.countdown_seconds,
          'amount_paid', w.amount_paid,
          'is_complimentary', w.is_complimentary,
          'last_activity_at', w.last_activity_at,
          'has_open_shift', w.has_open_shift,
          'notes', w.notes
        )
        order by w.ends_at asc nulls last, w.last_activity_at desc nulls last
      )
      from current_watchlist w
      where w.payment_state in ('overdue', 'suspended')
         or (w.effective_status in ('active', 'trial') and w.ends_at <= v_now + interval '7 days')
    ), '[]'::jsonb),
    'recent_entries', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'subscription_id', s.id,
          'cafe_id', c.id,
          'slug', c.slug,
          'display_name', c.display_name,
          'starts_at', s.starts_at,
          'ends_at', s.ends_at,
          'status', s.status,
          'effective_status', case
            when s.status = 'suspended' then 'suspended'
            when v_now > s.ends_at + make_interval(days => s.grace_days) then 'expired'
            else s.status
          end,
          'amount_paid', s.amount_paid,
          'is_complimentary', s.is_complimentary,
          'notes', s.notes,
          'created_at', s.created_at
        )
        order by s.created_at desc, s.id desc
      )
      from (
        select *
        from platform.cafe_subscriptions
        order by created_at desc, id desc
        limit 60
      ) s
      join ops.cafes c on c.id = s.cafe_id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

commit;
-- <<< 0023_platform_subscription_money_follow_and_create_flow.sql

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

-- >>> 0026_platform_support_inbox_and_dashboard_refactor.sql
begin;

create table if not exists platform.support_messages (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid null references ops.cafes(id) on delete set null,
  cafe_slug_snapshot text null,
  cafe_display_name_snapshot text null,
  sender_name text not null,
  sender_phone text not null,
  actor_kind text null,
  source text not null,
  page_path text null,
  issue_type text not null,
  message text not null,
  status text not null default 'new',
  priority text not null default 'normal',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  constraint chk_platform_support_messages_source check (source in ('login', 'in_app')),
  constraint chk_platform_support_messages_status check (status in ('new', 'in_progress', 'closed')),
  constraint chk_platform_support_messages_priority check (priority in ('low', 'normal', 'high')),
  constraint chk_platform_support_messages_actor_kind check (actor_kind is null or actor_kind in ('owner', 'partner', 'supervisor', 'waiter', 'barista', 'shisha', 'staff', 'guest'))
);

create table if not exists platform.support_message_replies (
  id uuid primary key default gen_random_uuid(),
  support_message_id uuid not null references platform.support_messages(id) on delete cascade,
  author_super_admin_user_id uuid not null references platform.super_admin_users(id) on delete cascade,
  reply_note text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_platform_support_messages_status_created_at
  on platform.support_messages(status, created_at desc);

create index if not exists idx_platform_support_messages_cafe_id_created_at
  on platform.support_messages(cafe_id, created_at desc);

create index if not exists idx_platform_support_messages_source_created_at
  on platform.support_messages(source, created_at desc);

create index if not exists idx_platform_support_message_replies_message_id_created_at
  on platform.support_message_replies(support_message_id, created_at asc);

create or replace function public.platform_touch_support_message()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if new.status = 'closed' and old.status is distinct from 'closed' then
    new.closed_at := now();
  elsif new.status <> 'closed' then
    new.closed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_platform_support_messages_touch on platform.support_messages;
create trigger trg_platform_support_messages_touch
before update on platform.support_messages
for each row
execute function public.platform_touch_support_message();

commit;
-- <<< 0026_platform_support_inbox_and_dashboard_refactor.sql

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

create or replace function app.current_super_admin_user_id()
returns uuid
language sql
stable
set search_path = pg_catalog
as $$
  select nullif(pg_catalog.current_setting('platform.current_super_admin_user_id', true), '')::uuid
$$;

create or replace function ops.generate_session_label()
returns text
language sql
set search_path = pg_catalog
as $$
  select 'S-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(public.gen_random_uuid()::text, '-', ''), 1, 6));
$$;

create or replace function public.platform_touch_support_message()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := pg_catalog.now();
  if new.status = 'closed' and old.status is distinct from 'closed' then
    new.closed_at := pg_catalog.now();
  elsif new.status <> 'closed' then
    new.closed_at := null;
  end if;
  return new;
end;
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

-- >>> 0047_ops_outbox_and_realtime_dispatch.sql
begin;

create table if not exists ops.outbox_events (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  shift_id uuid null references ops.shifts(id) on delete set null,
  stream_name text not null default 'ops',
  event_type text not null,
  scope_codes text[] not null default '{}'::text[],
  entity_type text null,
  entity_id text null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  available_at timestamptz not null default now(),
  claimed_at timestamptz null,
  claim_token uuid null,
  publish_attempts integer not null default 0,
  published_at timestamptz null,
  last_error text null,
  dead_lettered_at timestamptz null,
  dead_letter_reason text null,
  created_at timestamptz not null default now()
);

create index if not exists outbox_events_pending_idx
  on ops.outbox_events (available_at asc, created_at asc)
  where published_at is null and dead_lettered_at is null;

create index if not exists outbox_events_cafe_created_idx
  on ops.outbox_events (cafe_id, created_at desc);

create index if not exists outbox_events_claim_idx
  on ops.outbox_events (claim_token)
  where claim_token is not null;

alter table ops.outbox_events enable row level security;

drop policy if exists cafe_access_policy on ops.outbox_events;
create policy cafe_access_policy on ops.outbox_events
for all
using (app.can_access_cafe(cafe_id))
with check (app.can_access_cafe(cafe_id));

grant select, insert, update, delete on ops.outbox_events to authenticated, service_role;

create or replace function public.ops_stage_outbox_event(
  p_cafe_id uuid,
  p_shift_id uuid default null,
  p_event_type text default null,
  p_entity_id text default null,
  p_payload jsonb default '{}'::jsonb,
  p_scope_codes text[] default null,
  p_stream_name text default 'ops'
)
returns uuid
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_event_id uuid;
  v_type text;
  v_stream text;
begin
  if p_cafe_id is null then
    raise exception 'p_cafe_id is required';
  end if;

  v_type := nullif(btrim(coalesce(p_event_type, '')), '');
  if v_type is null then
    raise exception 'p_event_type is required';
  end if;

  v_stream := nullif(btrim(coalesce(p_stream_name, '')), '');
  if v_stream is null then
    v_stream := 'ops';
  end if;

  insert into ops.outbox_events (
    cafe_id,
    shift_id,
    stream_name,
    event_type,
    scope_codes,
    entity_id,
    payload,
    occurred_at,
    available_at,
    created_at
  )
  values (
    p_cafe_id,
    p_shift_id,
    v_stream,
    v_type,
    coalesce(p_scope_codes, '{}'::text[]),
    nullif(btrim(coalesce(p_entity_id, '')), ''),
    coalesce(p_payload, '{}'::jsonb),
    now(),
    now(),
    now()
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

grant execute on function public.ops_stage_outbox_event(uuid, uuid, text, text, jsonb, text[], text) to authenticated, service_role;

create or replace function public.ops_claim_outbox_events(
  p_limit integer default 100,
  p_claim_token uuid default null,
  p_cafe_id uuid default null
)
returns table (
  id uuid,
  cafe_id uuid,
  shift_id uuid,
  stream_name text,
  event_type text,
  scope_codes text[],
  entity_id text,
  payload jsonb,
  occurred_at timestamptz,
  publish_attempts integer
)
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_limit integer := greatest(least(coalesce(p_limit, 100), 500), 1);
  v_claim_token uuid := coalesce(p_claim_token, gen_random_uuid());
begin
  return query
  with next_rows as (
    select e.id
    from ops.outbox_events e
    where e.published_at is null
      and e.dead_lettered_at is null
      and e.available_at <= now()
      and (e.claimed_at is null or e.claimed_at < now() - interval '5 minutes')
      and (p_cafe_id is null or e.cafe_id = p_cafe_id)
    order by e.created_at asc
    for update skip locked
    limit v_limit
  )
  update ops.outbox_events e
  set claim_token = v_claim_token,
      claimed_at = now(),
      publish_attempts = e.publish_attempts + 1,
      last_error = null
  from next_rows
  where e.id = next_rows.id
  returning e.id, e.cafe_id, e.shift_id, e.stream_name, e.event_type, e.scope_codes, e.entity_id, e.payload, e.occurred_at, e.publish_attempts;
end;
$$;

grant execute on function public.ops_claim_outbox_events(integer, uuid, uuid) to service_role;

create or replace function public.ops_mark_outbox_events_published(
  p_ids uuid[],
  p_claim_token uuid
)
returns integer
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_count integer := 0;
begin
  if p_claim_token is null then
    raise exception 'p_claim_token is required';
  end if;

  if coalesce(array_length(p_ids, 1), 0) = 0 then
    return 0;
  end if;

  update ops.outbox_events
  set published_at = now(),
      claim_token = null,
      claimed_at = null,
      last_error = null
  where id = any(p_ids)
    and claim_token = p_claim_token;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.ops_mark_outbox_events_published(uuid[], uuid) to service_role;

create or replace function public.ops_mark_outbox_events_failed(
  p_ids uuid[],
  p_claim_token uuid,
  p_error text,
  p_retry_after_seconds integer default 15,
  p_max_attempts integer default 20
)
returns table (id uuid, dead_lettered boolean)
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_retry_after interval := make_interval(secs => greatest(coalesce(p_retry_after_seconds, 15), 1));
  v_max_attempts integer := greatest(coalesce(p_max_attempts, 20), 1);
  v_error text := left(coalesce(nullif(btrim(coalesce(p_error, '')), ''), 'OUTBOX_PUBLISH_FAILED'), 4000);
begin
  if p_claim_token is null then
    raise exception 'p_claim_token is required';
  end if;

  if coalesce(array_length(p_ids, 1), 0) = 0 then
    return;
  end if;

  return query
  update ops.outbox_events e
  set claim_token = null,
      claimed_at = null,
      available_at = case when e.publish_attempts >= v_max_attempts then e.available_at else now() + v_retry_after end,
      last_error = v_error,
      dead_lettered_at = case when e.publish_attempts >= v_max_attempts then now() else null end,
      dead_letter_reason = case when e.publish_attempts >= v_max_attempts then v_error else null end
  where e.id = any(p_ids)
    and e.claim_token = p_claim_token
  returning e.id, (e.publish_attempts >= v_max_attempts) as dead_lettered;
end;
$$;

grant execute on function public.ops_mark_outbox_events_failed(uuid[], uuid, text, integer, integer) to service_role;

create or replace function public.ops_reap_outbox_events(
  p_published_older_than_hours integer default 72,
  p_dead_lettered_older_than_hours integer default 168,
  p_limit integer default 5000
)
returns integer
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_limit integer := greatest(least(coalesce(p_limit, 5000), 20000), 1);
  v_count integer := 0;
begin
  with doomed as (
    select id
    from ops.outbox_events e
    where (e.published_at is not null and e.published_at < now() - make_interval(hours => greatest(coalesce(p_published_older_than_hours, 72), 1)))
       or (e.dead_lettered_at is not null and e.dead_lettered_at < now() - make_interval(hours => greatest(coalesce(p_dead_lettered_older_than_hours, 168), 1)))
    order by coalesce(e.published_at, e.dead_lettered_at) asc nulls last, e.created_at asc
    limit v_limit
  )
  delete from ops.outbox_events e
  using doomed
  where e.id = doomed.id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.ops_reap_outbox_events(integer, integer, integer) to service_role;

create or replace function public.ops_open_or_resume_service_session_with_outbox(
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
  v_result jsonb;
  v_event_id uuid;
  v_reused boolean;
begin
  v_result := public.ops_open_or_resume_service_session(
    p_cafe_id,
    p_shift_id,
    p_session_label,
    p_staff_member_id,
    p_owner_user_id
  );

  v_reused := coalesce((v_result ->> 'reused')::boolean, false);
  v_event_id := public.ops_stage_outbox_event(
    p_cafe_id,
    p_shift_id,
    case when v_reused then 'session.resumed' else 'session.opened' end,
    v_result ->> 'service_session_id',
    jsonb_build_object('label', v_result ->> 'session_label', 'reused', v_reused),
    array['waiter', 'billing', 'dashboard', 'nav-summary'],
    'ops'
  );

  return v_result || jsonb_build_object('outbox_event_id', v_event_id);
end;
$$;

grant execute on function public.ops_open_or_resume_service_session_with_outbox(uuid, uuid, text, uuid, uuid) to authenticated, service_role;

create or replace function public.ops_create_order_with_items_with_outbox(
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
  v_result jsonb;
  v_event_id uuid;
begin
  v_result := public.ops_create_order_with_items(
    p_cafe_id,
    p_shift_id,
    p_service_session_id,
    p_session_label,
    p_created_by_staff_id,
    p_created_by_owner_id,
    p_items,
    p_notes
  );

  v_event_id := public.ops_stage_outbox_event(
    p_cafe_id,
    p_shift_id,
    'order.submitted',
    v_result ->> 'order_id',
    jsonb_build_object(
      'serviceSessionId', v_result ->> 'service_session_id',
      'sessionLabel', v_result ->> 'session_label',
      'itemsCount', coalesce((v_result ->> 'items_count')::integer, 0),
      'status', v_result ->> 'status'
    ),
    array['waiter', 'barista', 'shisha', 'dashboard', 'nav-summary'],
    'ops'
  );

  return v_result || jsonb_build_object('outbox_event_id', v_event_id);
end;
$$;

grant execute on function public.ops_create_order_with_items_with_outbox(uuid, uuid, uuid, text, uuid, uuid, jsonb, text) to authenticated, service_role;

create or replace function public.ops_mark_partial_ready_with_outbox(
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
  v_result jsonb;
  v_item ops.order_items%rowtype;
  v_event_id uuid;
begin
  v_result := public.ops_mark_partial_ready(
    p_cafe_id,
    p_order_item_id,
    p_quantity,
    p_by_staff_id,
    p_by_owner_id,
    p_notes
  );

  select * into v_item
  from ops.order_items
  where cafe_id = p_cafe_id and id = p_order_item_id;

  v_event_id := public.ops_stage_outbox_event(
    p_cafe_id,
    v_item.shift_id,
    'station.partial_ready',
    v_item.id::text,
    jsonb_build_object(
      'quantity', p_quantity,
      'stationCode', v_item.station_code,
      'serviceSessionId', v_item.service_session_id
    ),
    array['waiter', 'barista', 'shisha', 'dashboard', 'nav-summary'],
    'ops'
  );

  return v_result || jsonb_build_object('outbox_event_id', v_event_id);
end;
$$;

grant execute on function public.ops_mark_partial_ready_with_outbox(uuid, uuid, integer, uuid, uuid, text) to authenticated, service_role;

create or replace function public.ops_mark_ready_with_outbox(
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
  v_result jsonb;
  v_item ops.order_items%rowtype;
  v_event_id uuid;
begin
  v_result := public.ops_mark_ready(
    p_cafe_id,
    p_order_item_id,
    p_quantity,
    p_by_staff_id,
    p_by_owner_id,
    p_notes
  );

  select * into v_item
  from ops.order_items
  where cafe_id = p_cafe_id and id = p_order_item_id;

  v_event_id := public.ops_stage_outbox_event(
    p_cafe_id,
    v_item.shift_id,
    'station.ready',
    v_item.id::text,
    jsonb_build_object(
      'quantity', p_quantity,
      'stationCode', v_item.station_code,
      'serviceSessionId', v_item.service_session_id
    ),
    array['waiter', 'barista', 'shisha', 'dashboard', 'nav-summary'],
    'ops'
  );

  return v_result || jsonb_build_object('outbox_event_id', v_event_id);
end;
$$;

grant execute on function public.ops_mark_ready_with_outbox(uuid, uuid, integer, uuid, uuid, text) to authenticated, service_role;

create or replace function public.ops_request_remake_with_outbox(
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
  v_result jsonb;
  v_item ops.order_items%rowtype;
  v_event_id uuid;
begin
  v_result := public.ops_request_remake(
    p_cafe_id,
    p_order_item_id,
    p_quantity,
    p_by_staff_id,
    p_by_owner_id,
    p_notes
  );

  select * into v_item
  from ops.order_items
  where cafe_id = p_cafe_id and id = p_order_item_id;

  v_event_id := public.ops_stage_outbox_event(
    p_cafe_id,
    v_item.shift_id,
    'station.remake_requested',
    v_item.id::text,
    jsonb_build_object(
      'quantity', p_quantity,
      'stationCode', v_item.station_code,
      'serviceSessionId', v_item.service_session_id
    ),
    array['waiter', 'barista', 'shisha', 'billing', 'dashboard', 'nav-summary', 'complaints'],
    'ops'
  );

  return v_result || jsonb_build_object('outbox_event_id', v_event_id);
end;
$$;

grant execute on function public.ops_request_remake_with_outbox(uuid, uuid, integer, uuid, uuid, text) to authenticated, service_role;

create or replace function public.ops_deliver_available_quantities_with_outbox(
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
  v_result jsonb;
  v_item ops.order_items%rowtype;
  v_event_id uuid;
begin
  v_result := public.ops_deliver_available_quantities(
    p_cafe_id,
    p_order_item_id,
    p_quantity,
    p_by_staff_id,
    p_by_owner_id,
    p_notes
  );

  select * into v_item
  from ops.order_items
  where cafe_id = p_cafe_id and id = p_order_item_id;

  v_event_id := public.ops_stage_outbox_event(
    p_cafe_id,
    v_item.shift_id,
    'delivery.delivered',
    v_item.id::text,
    jsonb_build_object(
      'quantity', coalesce((v_result ->> 'quantity')::integer, p_quantity),
      'deliveredQty', coalesce((v_result ->> 'delivered_qty')::integer, 0),
      'replacementDeliveredQty', coalesce((v_result ->> 'replacement_delivered_qty')::integer, 0),
      'serviceSessionId', v_item.service_session_id
    ),
    array['waiter', 'barista', 'shisha', 'billing', 'dashboard', 'nav-summary'],
    'ops'
  );

  return v_result || jsonb_build_object('outbox_event_id', v_event_id);
end;
$$;

grant execute on function public.ops_deliver_available_quantities_with_outbox(uuid, uuid, integer, uuid, uuid, text) to authenticated, service_role;

create or replace function public.ops_settle_selected_quantities_with_outbox(
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
  v_result jsonb;
  v_event_id uuid;
begin
  v_result := public.ops_settle_selected_quantities(
    p_cafe_id,
    p_shift_id,
    p_service_session_id,
    p_lines,
    p_by_staff_id,
    p_by_owner_id,
    p_notes
  );

  v_event_id := public.ops_stage_outbox_event(
    p_cafe_id,
    p_shift_id,
    'billing.settled',
    v_result ->> 'payment_id',
    jsonb_build_object(
      'serviceSessionId', p_service_session_id,
      'totalAmount', coalesce((v_result ->> 'total_amount')::numeric, 0),
      'totalQuantity', coalesce((v_result ->> 'total_quantity')::integer, 0)
    ),
    array['waiter', 'billing', 'dashboard', 'nav-summary'],
    'ops'
  );

  return v_result || jsonb_build_object('outbox_event_id', v_event_id);
end;
$$;

grant execute on function public.ops_settle_selected_quantities_with_outbox(uuid, uuid, uuid, jsonb, uuid, uuid, text) to authenticated, service_role;

create or replace function public.ops_defer_selected_quantities_with_outbox(
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
  v_result jsonb;
  v_event_id uuid;
begin
  v_result := public.ops_defer_selected_quantities(
    p_cafe_id,
    p_shift_id,
    p_service_session_id,
    p_debtor_name,
    p_lines,
    p_by_staff_id,
    p_by_owner_id,
    p_notes
  );

  v_event_id := public.ops_stage_outbox_event(
    p_cafe_id,
    p_shift_id,
    'billing.deferred',
    v_result ->> 'payment_id',
    jsonb_build_object(
      'serviceSessionId', p_service_session_id,
      'debtorName', coalesce(v_result ->> 'debtor_name', p_debtor_name),
      'totalAmount', coalesce((v_result ->> 'total_amount')::numeric, 0),
      'totalQuantity', coalesce((v_result ->> 'total_quantity')::integer, 0)
    ),
    array['waiter', 'billing', 'dashboard', 'nav-summary', 'deferred'],
    'ops'
  );

  return v_result || jsonb_build_object('outbox_event_id', v_event_id);
end;
$$;

grant execute on function public.ops_defer_selected_quantities_with_outbox(uuid, uuid, uuid, text, jsonb, uuid, uuid, text) to authenticated, service_role;

create or replace function public.ops_record_repayment_with_outbox(
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
  v_result jsonb;
  v_event_id uuid;
begin
  v_result := public.ops_record_repayment(
    p_cafe_id,
    p_shift_id,
    p_debtor_name,
    p_amount,
    p_by_staff_id,
    p_by_owner_id,
    p_notes
  );

  v_event_id := public.ops_stage_outbox_event(
    p_cafe_id,
    p_shift_id,
    'deferred.repaid',
    v_result ->> 'payment_id',
    jsonb_build_object(
      'debtorName', coalesce(v_result ->> 'debtor_name', p_debtor_name),
      'amount', coalesce((v_result ->> 'repayment_amount')::numeric, p_amount),
      'notes', p_notes,
      'balanceAfter', coalesce((v_result ->> 'balance_after')::numeric, 0)
    ),
    array['billing', 'deferred', 'dashboard', 'nav-summary'],
    'ops'
  );

  return v_result || jsonb_build_object('outbox_event_id', v_event_id);
end;
$$;

grant execute on function public.ops_record_repayment_with_outbox(uuid, uuid, text, numeric, uuid, uuid, text) to authenticated, service_role;

create or replace function public.ops_close_service_session_with_outbox(
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
  v_result jsonb;
  v_event_id uuid;
begin
  v_result := public.ops_close_service_session(
    p_cafe_id,
    p_service_session_id,
    p_by_staff_id,
    p_by_owner_id,
    p_notes
  );

  v_event_id := public.ops_stage_outbox_event(
    p_cafe_id,
    null,
    'session.closed',
    p_service_session_id::text,
    jsonb_build_object('serviceSessionId', p_service_session_id, 'status', v_result ->> 'status'),
    array['waiter', 'billing', 'dashboard', 'nav-summary'],
    'ops'
  );

  return v_result || jsonb_build_object('outbox_event_id', v_event_id);
end;
$$;

grant execute on function public.ops_close_service_session_with_outbox(uuid, uuid, uuid, uuid, text) to authenticated, service_role;

create or replace function public.ops_add_deferred_debt_with_outbox(
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
  v_entry_id uuid;
  v_name text;
  v_event_id uuid;
begin
  v_name := nullif(btrim(coalesce(p_debtor_name, '')), '');
  if p_cafe_id is null then
    raise exception 'p_cafe_id is required';
  end if;
  if p_shift_id is null then
    raise exception 'p_shift_id is required';
  end if;
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

  insert into ops.deferred_ledger_entries (
    cafe_id,
    shift_id,
    debtor_name,
    entry_kind,
    amount,
    notes,
    by_staff_id,
    by_owner_id
  ) values (
    p_cafe_id,
    p_shift_id,
    v_name,
    'debt',
    p_amount,
    p_notes,
    p_by_staff_id,
    p_by_owner_id
  ) returning id into v_entry_id;

  v_event_id := public.ops_stage_outbox_event(
    p_cafe_id,
    p_shift_id,
    'deferred.debt_added',
    v_entry_id::text,
    jsonb_build_object('debtorName', v_name, 'amount', p_amount, 'notes', p_notes),
    array['billing', 'deferred', 'dashboard', 'nav-summary'],
    'ops'
  );

  return jsonb_build_object(
    'ok', true,
    'entry_id', v_entry_id,
    'outbox_event_id', v_event_id
  );
end;
$$;

grant execute on function public.ops_add_deferred_debt_with_outbox(uuid, uuid, text, numeric, uuid, uuid, text) to authenticated, service_role;

commit;
-- <<< 0047_ops_outbox_and_realtime_dispatch.sql

-- >>> 0049_ops_observability_snapshots.sql
begin;

create table if not exists ops.outbox_dispatch_runs (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid null references ops.cafes(id) on delete cascade,
  trigger_source text not null default 'unknown',
  claimed_count integer not null default 0 check (claimed_count >= 0),
  published_count integer not null default 0 check (published_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  dead_lettered_count integer not null default 0 check (dead_lettered_count >= 0),
  duration_ms integer not null default 0 check (duration_ms >= 0),
  notes jsonb not null default '{}'::jsonb,
  run_started_at timestamptz not null default now(),
  run_finished_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_outbox_dispatch_runs_finished_at
  on ops.outbox_dispatch_runs (run_finished_at desc);

create index if not exists idx_outbox_dispatch_runs_cafe_finished_at
  on ops.outbox_dispatch_runs (cafe_id, run_finished_at desc)
  where cafe_id is not null;

alter table ops.outbox_dispatch_runs enable row level security;

drop policy if exists cafe_access_policy on ops.outbox_dispatch_runs;
create policy cafe_access_policy on ops.outbox_dispatch_runs
for all
using (cafe_id is not null and app.can_access_cafe(cafe_id))
with check (cafe_id is not null and app.can_access_cafe(cafe_id));

grant select, insert, update, delete on ops.outbox_dispatch_runs to authenticated, service_role;

create or replace function public.ops_record_outbox_dispatch_run(
  p_trigger_source text default 'unknown',
  p_cafe_id uuid default null,
  p_claimed_count integer default 0,
  p_published_count integer default 0,
  p_failed_count integer default 0,
  p_dead_lettered_count integer default 0,
  p_duration_ms integer default 0,
  p_notes jsonb default '{}'::jsonb,
  p_run_started_at timestamptz default null,
  p_run_finished_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_id uuid;
  v_started timestamptz := coalesce(p_run_started_at, now());
  v_finished timestamptz := coalesce(p_run_finished_at, now());
  v_trigger text := coalesce(nullif(btrim(coalesce(p_trigger_source, '')), ''), 'unknown');
begin
  insert into ops.outbox_dispatch_runs (
    cafe_id,
    trigger_source,
    claimed_count,
    published_count,
    failed_count,
    dead_lettered_count,
    duration_ms,
    notes,
    run_started_at,
    run_finished_at,
    created_at
  )
  values (
    p_cafe_id,
    v_trigger,
    greatest(coalesce(p_claimed_count, 0), 0),
    greatest(coalesce(p_published_count, 0), 0),
    greatest(coalesce(p_failed_count, 0), 0),
    greatest(coalesce(p_dead_lettered_count, 0), 0),
    greatest(coalesce(p_duration_ms, 0), 0),
    coalesce(p_notes, '{}'::jsonb),
    least(v_started, v_finished),
    greatest(v_started, v_finished),
    now()
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.ops_record_outbox_dispatch_run(text, uuid, integer, integer, integer, integer, integer, jsonb, timestamptz, timestamptz) to service_role;

create or replace function public.ops_list_recent_outbox_dispatch_runs(
  p_limit integer default 25
)
returns table (
  id uuid,
  cafe_id uuid,
  trigger_source text,
  claimed_count integer,
  published_count integer,
  failed_count integer,
  dead_lettered_count integer,
  duration_ms integer,
  notes jsonb,
  run_started_at timestamptz,
  run_finished_at timestamptz
)
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_limit integer := greatest(least(coalesce(p_limit, 25), 200), 1);
begin
  return query
  select
    r.id,
    r.cafe_id,
    r.trigger_source,
    r.claimed_count,
    r.published_count,
    r.failed_count,
    r.dead_lettered_count,
    r.duration_ms,
    r.notes,
    r.run_started_at,
    r.run_finished_at
  from ops.outbox_dispatch_runs r
  order by r.run_finished_at desc, r.id desc
  limit v_limit;
end;
$$;

grant execute on function public.ops_list_recent_outbox_dispatch_runs(integer) to service_role;

create or replace function public.ops_reap_outbox_dispatch_runs(
  p_older_than_hours integer default 168,
  p_limit integer default 5000
)
returns integer
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_limit integer := greatest(least(coalesce(p_limit, 5000), 20000), 1);
  v_count integer := 0;
begin
  with doomed as (
    select id
    from ops.outbox_dispatch_runs
    where run_finished_at < now() - make_interval(hours => greatest(coalesce(p_older_than_hours, 168), 1))
    order by run_finished_at asc, id asc
    limit v_limit
  )
  delete from ops.outbox_dispatch_runs r
  using doomed
  where r.id = doomed.id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.ops_reap_outbox_dispatch_runs(integer, integer) to service_role;

create or replace function public.ops_get_observability_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_result jsonb;
begin
  with shift_rollup as (
    select
      count(*) filter (where closed_at is null)::integer as open_shift_count,
      count(distinct cafe_id) filter (where closed_at is null)::integer as active_cafe_count
    from ops.shifts
  ), session_rollup as (
    select count(*) filter (where status = 'open')::integer as open_session_count
    from ops.service_sessions
  ), item_source as (
    select
      greatest(
        qty_submitted - least(qty_ready, qty_submitted) - qty_cancelled,
        0
      )
      + greatest(
          qty_remade - greatest(qty_ready - least(qty_ready, qty_submitted), 0),
          0
        ) as pending_qty,
      greatest(least(qty_ready, qty_total - qty_cancelled) - qty_delivered, 0)
      + greatest(qty_ready - least(qty_ready, qty_total - qty_cancelled) - qty_replacement_delivered, 0) as ready_qty,
      greatest(qty_delivered - qty_paid - qty_deferred - qty_waived, 0) as billable_qty,
      created_at
    from ops.order_items
  ), item_rollup as (
    select
      count(*) filter (where pending_qty > 0)::integer as pending_item_count,
      count(*) filter (where ready_qty > 0)::integer as ready_item_count,
      coalesce(sum(pending_qty), 0)::bigint as waiting_qty,
      coalesce(sum(ready_qty), 0)::bigint as ready_qty,
      coalesce(sum(billable_qty), 0)::bigint as billable_qty,
      min(created_at) filter (where pending_qty > 0) as oldest_pending_created_at,
      min(created_at) filter (where ready_qty > 0) as oldest_ready_created_at
    from item_source
  ), deferred_rollup as (
    select
      count(*) filter (where balance > 0)::integer as customer_count,
      coalesce(sum(balance), 0)::numeric(14,2) as outstanding_amount,
      max(last_entry_at) as last_entry_at
    from ops.deferred_customer_balances
  ), outbox_rollup as (
    select
      count(*) filter (where published_at is null and dead_lettered_at is null and claim_token is null and available_at <= now())::integer as pending_count,
      count(*) filter (where published_at is null and dead_lettered_at is null and claim_token is not null)::integer as inflight_count,
      count(*) filter (where published_at is null and dead_lettered_at is null and last_error is not null)::integer as retrying_count,
      count(*) filter (where dead_lettered_at is not null)::integer as dead_letter_count,
      coalesce(max(publish_attempts), 0)::integer as max_publish_attempts,
      min(created_at) filter (where published_at is null and dead_lettered_at is null and available_at <= now()) as oldest_pending_created_at,
      max(published_at) as last_published_at
    from ops.outbox_events
  ), dispatch_rollup as (
    select
      count(*) filter (where run_finished_at >= now() - interval '1 hour')::integer as last_hour_runs,
      coalesce(sum(claimed_count) filter (where run_finished_at >= now() - interval '1 hour'), 0)::integer as last_hour_claimed,
      coalesce(sum(published_count) filter (where run_finished_at >= now() - interval '1 hour'), 0)::integer as last_hour_published,
      coalesce(sum(failed_count) filter (where run_finished_at >= now() - interval '1 hour'), 0)::integer as last_hour_failed,
      coalesce(sum(dead_lettered_count) filter (where run_finished_at >= now() - interval '1 hour'), 0)::integer as last_hour_dead_lettered,
      max(run_finished_at) as last_run_at,
      (avg(duration_ms) filter (where run_finished_at >= now() - interval '1 hour'))::numeric(10,2) as last_hour_avg_duration_ms
    from ops.outbox_dispatch_runs
  )
  select jsonb_build_object(
    'generated_at', now(),
    'database_name', current_database(),
    'runtime', jsonb_build_object(
      'open_shift_count', coalesce(sr.open_shift_count, 0),
      'active_cafe_count', coalesce(sr.active_cafe_count, 0),
      'open_session_count', coalesce(ss.open_session_count, 0),
      'pending_item_count', coalesce(ir.pending_item_count, 0),
      'ready_item_count', coalesce(ir.ready_item_count, 0),
      'waiting_qty', coalesce(ir.waiting_qty, 0),
      'ready_qty', coalesce(ir.ready_qty, 0),
      'billable_qty', coalesce(ir.billable_qty, 0),
      'oldest_pending_seconds', case when ir.oldest_pending_created_at is null then null else greatest(floor(extract(epoch from (now() - ir.oldest_pending_created_at))), 0)::bigint end,
      'oldest_ready_seconds', case when ir.oldest_ready_created_at is null then null else greatest(floor(extract(epoch from (now() - ir.oldest_ready_created_at))), 0)::bigint end,
      'deferred_customer_count', coalesce(dr.customer_count, 0),
      'deferred_outstanding_amount', coalesce(dr.outstanding_amount, 0),
      'last_deferred_entry_at', dr.last_entry_at
    ),
    'outbox', jsonb_build_object(
      'pending_count', coalesce(orx.pending_count, 0),
      'inflight_count', coalesce(orx.inflight_count, 0),
      'retrying_count', coalesce(orx.retrying_count, 0),
      'dead_letter_count', coalesce(orx.dead_letter_count, 0),
      'max_publish_attempts', coalesce(orx.max_publish_attempts, 0),
      'oldest_pending_seconds', case when orx.oldest_pending_created_at is null then null else greatest(floor(extract(epoch from (now() - orx.oldest_pending_created_at))), 0)::bigint end,
      'last_published_at', orx.last_published_at
    ),
    'dispatch', jsonb_build_object(
      'last_run_at', dx.last_run_at,
      'last_hour_runs', coalesce(dx.last_hour_runs, 0),
      'last_hour_claimed', coalesce(dx.last_hour_claimed, 0),
      'last_hour_published', coalesce(dx.last_hour_published, 0),
      'last_hour_failed', coalesce(dx.last_hour_failed, 0),
      'last_hour_dead_lettered', coalesce(dx.last_hour_dead_lettered, 0),
      'last_hour_avg_duration_ms', coalesce(dx.last_hour_avg_duration_ms, 0)
    )
  )
  into v_result
  from shift_rollup sr
  cross join session_rollup ss
  cross join item_rollup ir
  cross join deferred_rollup dr
  cross join outbox_rollup orx
  cross join dispatch_rollup dx;

  return coalesce(v_result, jsonb_build_object(
    'generated_at', now(),
    'database_name', current_database(),
    'runtime', '{}'::jsonb,
    'outbox', '{}'::jsonb,
    'dispatch', '{}'::jsonb
  ));
end;
$$;

grant execute on function public.ops_get_observability_snapshot() to service_role;

commit;
-- <<< 0049_ops_observability_snapshots.sql

-- <<< 0051_ops_billing_extras_and_receipt_support.sql


begin;

create table if not exists ops.cafe_billing_settings (
  cafe_id uuid primary key
    references ops.cafes(id)
    on delete cascade,
  tax_enabled boolean not null default false,
  tax_rate numeric(6,2) not null default 0 check (tax_rate >= 0 and tax_rate <= 100),
  service_enabled boolean not null default false,
  service_rate numeric(6,2) not null default 0 check (service_rate >= 0 and service_rate <= 100),
  updated_at timestamptz not null default now(),
  updated_by_owner_id uuid,
  constraint fk_cafe_billing_settings_owner
    foreign key (cafe_id, updated_by_owner_id)
    references ops.owner_users(cafe_id, id)
    on delete set null
);

alter table ops.payments
  add column if not exists subtotal_amount numeric(12,2) not null default 0,
  add column if not exists tax_rate numeric(6,2) not null default 0,
  add column if not exists tax_amount numeric(12,2) not null default 0,
  add column if not exists service_rate numeric(6,2) not null default 0,
  add column if not exists service_amount numeric(12,2) not null default 0;

update ops.payments
set subtotal_amount = coalesce(total_amount, 0),
    tax_rate = coalesce(tax_rate, 0),
    tax_amount = coalesce(tax_amount, 0),
    service_rate = coalesce(service_rate, 0),
    service_amount = coalesce(service_amount, 0)
where subtotal_amount = 0
  and tax_amount = 0
  and service_amount = 0;

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
  v_subtotal_amount numeric(12,2) := 0;
  v_tax_rate numeric(6,2) := 0;
  v_tax_amount numeric(12,2) := 0;
  v_service_rate numeric(6,2) := 0;
  v_service_amount numeric(12,2) := 0;
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

  select
    case when coalesce(cbs.tax_enabled, false) then coalesce(cbs.tax_rate, 0) else 0 end,
    case when coalesce(cbs.service_enabled, false) then coalesce(cbs.service_rate, 0) else 0 end
  into v_tax_rate, v_service_rate
  from ops.cafes c
  left join ops.cafe_billing_settings cbs
    on cbs.cafe_id = c.id
  where c.id = p_cafe_id;

  insert into ops.payments (
    cafe_id,
    shift_id,
    service_session_id,
    payment_kind,
    subtotal_amount,
    tax_rate,
    tax_amount,
    service_rate,
    service_amount,
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
    v_tax_rate,
    0,
    v_service_rate,
    0,
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
    v_subtotal_amount := v_subtotal_amount + v_amount;
  end loop;

  v_tax_amount := round((v_subtotal_amount * (coalesce(v_tax_rate, 0) / 100))::numeric, 2);
  v_service_amount := round((v_subtotal_amount * (coalesce(v_service_rate, 0) / 100))::numeric, 2);
  v_total_amount := v_subtotal_amount + v_tax_amount + v_service_amount;

  update ops.payments
  set subtotal_amount = v_subtotal_amount,
      tax_rate = coalesce(v_tax_rate, 0),
      tax_amount = coalesce(v_tax_amount, 0),
      service_rate = coalesce(v_service_rate, 0),
      service_amount = coalesce(v_service_amount, 0),
      total_amount = v_total_amount
  where cafe_id = p_cafe_id
    and id = v_payment_id;

  return jsonb_build_object(
    'ok', true,
    'payment_id', v_payment_id,
    'total_quantity', v_total_quantity,
    'subtotal_amount', v_subtotal_amount,
    'tax_amount', v_tax_amount,
    'service_amount', v_service_amount,
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
  v_subtotal_amount numeric(12,2) := 0;
  v_tax_rate numeric(6,2) := 0;
  v_tax_amount numeric(12,2) := 0;
  v_service_rate numeric(6,2) := 0;
  v_service_amount numeric(12,2) := 0;
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

  select
    case when coalesce(cbs.tax_enabled, false) then coalesce(cbs.tax_rate, 0) else 0 end,
    case when coalesce(cbs.service_enabled, false) then coalesce(cbs.service_rate, 0) else 0 end
  into v_tax_rate, v_service_rate
  from ops.cafes c
  left join ops.cafe_billing_settings cbs
    on cbs.cafe_id = c.id
  where c.id = p_cafe_id;

  insert into ops.payments (
    cafe_id,
    shift_id,
    service_session_id,
    payment_kind,
    subtotal_amount,
    tax_rate,
    tax_amount,
    service_rate,
    service_amount,
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
    v_tax_rate,
    0,
    v_service_rate,
    0,
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
    v_subtotal_amount := v_subtotal_amount + v_amount;
  end loop;

  v_tax_amount := round((v_subtotal_amount * (coalesce(v_tax_rate, 0) / 100))::numeric, 2);
  v_service_amount := round((v_subtotal_amount * (coalesce(v_service_rate, 0) / 100))::numeric, 2);
  v_total_amount := v_subtotal_amount + v_tax_amount + v_service_amount;

  update ops.payments
  set subtotal_amount = v_subtotal_amount,
      tax_rate = coalesce(v_tax_rate, 0),
      tax_amount = coalesce(v_tax_amount, 0),
      service_rate = coalesce(v_service_rate, 0),
      service_amount = coalesce(v_service_amount, 0),
      total_amount = v_total_amount
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
    'subtotal_amount', v_subtotal_amount,
    'tax_amount', v_tax_amount,
    'service_amount', v_service_amount,
    'total_amount', v_total_amount
  );
end;
$$;

commit;



-- <<< 0051_ops_billing_extras_and_receipt_support.sql




-- <<< 0052_ops_order_note_presets.sql
begin;

create table if not exists ops.order_note_presets (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  station_code text null check (station_code in ('barista', 'shisha')),
  station_scope text generated always as (coalesce(station_code, 'all')) stored,
  note_text text not null,
  normalized_text text not null,
  usage_count integer not null default 1 check (usage_count > 0),
  is_active boolean not null default true,
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_note_presets_note_text_not_blank check (btrim(note_text) <> ''),
  constraint order_note_presets_normalized_text_not_blank check (btrim(normalized_text) <> '')
);

create unique index if not exists ops_order_note_presets_unique_idx
  on ops.order_note_presets(cafe_id, station_scope, normalized_text);

create index if not exists ops_order_note_presets_cafe_usage_idx
  on ops.order_note_presets(cafe_id, is_active, usage_count desc, last_used_at desc);

insert into ops.order_note_presets (
  cafe_id,
  station_code,
  note_text,
  normalized_text,
  usage_count,
  is_active,
  last_used_at,
  created_at,
  updated_at
)
select
  oi.cafe_id,
  case
    when count(distinct oi.station_code) = 1 and min(oi.station_code) in ('barista', 'shisha') then min(oi.station_code)
    else null
  end as station_code,
  min(trim(oi.notes)) as note_text,
  lower(regexp_replace(trim(oi.notes), '\s+', ' ', 'g')) as normalized_text,
  count(*)::integer as usage_count,
  true as is_active,
  max(coalesce(oi.created_at, now())) as last_used_at,
  min(coalesce(oi.created_at, now())) as created_at,
  now() as updated_at
from ops.order_items oi
where nullif(trim(coalesce(oi.notes, '')), '') is not null
group by oi.cafe_id, lower(regexp_replace(trim(oi.notes), '\s+', ' ', 'g'))
on conflict (cafe_id, station_scope, normalized_text) do update
set
  note_text = excluded.note_text,
  usage_count = greatest(ops.order_note_presets.usage_count, excluded.usage_count),
  last_used_at = greatest(ops.order_note_presets.last_used_at, excluded.last_used_at),
  is_active = true,
  updated_at = now();

commit;


-- <<< 0052_ops_order_note_presets.sql