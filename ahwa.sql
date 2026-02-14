-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.activity_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL,
  at timestamp with time zone NOT NULL DEFAULT now(),
  actor_user_id uuid,
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT activity_events_pkey PRIMARY KEY (id)
);
CREATE TABLE public.cafes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT cafes_pkey PRIMARY KEY (id)
);
CREATE TABLE public.categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT categories_pkey PRIMARY KEY (id),
  CONSTRAINT categories_cafe_id_fkey FOREIGN KEY (cafe_id) REFERENCES public.cafes(id)
);
CREATE TABLE public.customers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL,
  name text NOT NULL,
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT customers_pkey PRIMARY KEY (id),
  CONSTRAINT customers_cafe_id_fkey FOREIGN KEY (cafe_id) REFERENCES public.cafes(id)
);
CREATE TABLE public.events (
  id bigint NOT NULL DEFAULT nextval('events_id_seq'::regclass),
  cafe_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT events_pkey PRIMARY KEY (id),
  CONSTRAINT events_cafe_id_fkey FOREIGN KEY (cafe_id) REFERENCES public.cafes(id),
  CONSTRAINT events_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.staff_profiles(id)
);
CREATE TABLE public.invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL,
  order_id uuid NOT NULL UNIQUE,
  total integer NOT NULL CHECK (total >= 0),
  discount integer NOT NULL DEFAULT 0 CHECK (discount >= 0),
  grand_total integer NOT NULL CHECK (grand_total >= 0),
  status USER-DEFINED NOT NULL DEFAULT 'unpaid'::invoice_status,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT invoices_pkey PRIMARY KEY (id),
  CONSTRAINT invoices_cafe_id_fkey FOREIGN KEY (cafe_id) REFERENCES public.cafes(id),
  CONSTRAINT invoices_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id)
);
CREATE TABLE public.ledger_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  kind USER-DEFINED NOT NULL,
  amount integer NOT NULL CHECK (amount > 0),
  note text,
  ref_invoice_id uuid,
  actor_user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ledger_entries_pkey PRIMARY KEY (id),
  CONSTRAINT ledger_entries_cafe_id_fkey FOREIGN KEY (cafe_id) REFERENCES public.cafes(id),
  CONSTRAINT ledger_entries_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id),
  CONSTRAINT ledger_entries_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.staff_profiles(id)
);
CREATE TABLE public.order_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL,
  order_id uuid NOT NULL,
  product_id uuid NOT NULL,
  qty integer NOT NULL CHECK (qty > 0),
  unit_price integer NOT NULL CHECK (unit_price >= 0),
  notes text,
  assigned_to USER-DEFINED NOT NULL,
  status USER-DEFINED NOT NULL DEFAULT 'new'::order_item_status,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT order_items_pkey PRIMARY KEY (id),
  CONSTRAINT order_items_cafe_id_fkey FOREIGN KEY (cafe_id) REFERENCES public.cafes(id),
  CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id),
  CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id)
);
CREATE TABLE public.orders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL,
  shift_id uuid NOT NULL,
  table_label text,
  customer_id uuid,
  created_by uuid NOT NULL,
  status USER-DEFINED NOT NULL DEFAULT 'open'::order_status,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  closed_at timestamp with time zone,
  CONSTRAINT orders_pkey PRIMARY KEY (id),
  CONSTRAINT orders_cafe_id_fkey FOREIGN KEY (cafe_id) REFERENCES public.cafes(id),
  CONSTRAINT orders_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id),
  CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id),
  CONSTRAINT orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.staff_profiles(id)
);
CREATE TABLE public.payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  amount integer NOT NULL CHECK (amount > 0),
  method USER-DEFINED NOT NULL,
  customer_id uuid,
  actor_user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT payments_pkey PRIMARY KEY (id),
  CONSTRAINT payments_cafe_id_fkey FOREIGN KEY (cafe_id) REFERENCES public.cafes(id),
  CONSTRAINT payments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id),
  CONSTRAINT payments_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id),
  CONSTRAINT payments_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.staff_profiles(id)
);
CREATE TABLE public.products (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL,
  category_id uuid,
  name text NOT NULL,
  price integer NOT NULL CHECK (price >= 0),
  target_role USER-DEFINED NOT NULL,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT products_pkey PRIMARY KEY (id),
  CONSTRAINT products_cafe_id_fkey FOREIGN KEY (cafe_id) REFERENCES public.cafes(id),
  CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id)
);
CREATE TABLE public.returns (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL,
  order_item_id uuid NOT NULL,
  reason text NOT NULL,
  reported_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT returns_pkey PRIMARY KEY (id),
  CONSTRAINT returns_cafe_id_fkey FOREIGN KEY (cafe_id) REFERENCES public.cafes(id),
  CONSTRAINT returns_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.order_items(id),
  CONSTRAINT returns_reported_by_fkey FOREIGN KEY (reported_by) REFERENCES public.staff_profiles(id)
);
CREATE TABLE public.shift_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL,
  shift_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role USER-DEFINED NOT NULL,
  assigned_at timestamp with time zone NOT NULL DEFAULT now(),
  assigned_by uuid NOT NULL,
  CONSTRAINT shift_assignments_pkey PRIMARY KEY (id),
  CONSTRAINT shift_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.staff_profiles(id),
  CONSTRAINT shift_assignments_cafe_id_fkey FOREIGN KEY (cafe_id) REFERENCES public.cafes(id),
  CONSTRAINT shift_assignments_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id),
  CONSTRAINT shift_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.staff_profiles(id)
);
CREATE TABLE public.shift_checkins (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL,
  shift_id uuid NOT NULL,
  user_id uuid NOT NULL,
  checked_in_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT shift_checkins_pkey PRIMARY KEY (id)
);
CREATE TABLE public.shifts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL,
  kind USER-DEFINED NOT NULL,
  is_open boolean NOT NULL DEFAULT true,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  opened_by uuid NOT NULL,
  ended_at timestamp with time zone,
  ended_by uuid,
  supervisor_user_id uuid,
  CONSTRAINT shifts_pkey PRIMARY KEY (id),
  CONSTRAINT shifts_cafe_id_fkey FOREIGN KEY (cafe_id) REFERENCES public.cafes(id),
  CONSTRAINT shifts_opened_by_fkey FOREIGN KEY (opened_by) REFERENCES public.staff_profiles(id),
  CONSTRAINT shifts_ended_by_fkey FOREIGN KEY (ended_by) REFERENCES public.staff_profiles(id),
  CONSTRAINT shifts_supervisor_user_id_fkey FOREIGN KEY (supervisor_user_id) REFERENCES public.staff_profiles(id)
);
CREATE TABLE public.staff_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL,
  auth_user_id uuid UNIQUE,
  username text NOT NULL,
  display_name text NOT NULL,
  base_role USER-DEFINED NOT NULL DEFAULT 'staff'::base_role,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  phone text,
  CONSTRAINT staff_profiles_pkey PRIMARY KEY (id),
  CONSTRAINT staff_profiles_cafe_id_fkey FOREIGN KEY (cafe_id) REFERENCES public.cafes(id)
);