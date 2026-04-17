begin;

create table if not exists ops.customer_aliases (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  customer_id uuid not null,
  alias_text text not null,
  normalized_alias text not null,
  source text not null default 'manual' check (source in ('manual', 'deferred_runtime', 'billing_runtime', 'imported')),
  usage_count integer not null default 0 check (usage_count >= 0),
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cafe_id, id),
  constraint fk_customer_aliases_customer
    foreign key (cafe_id, customer_id)
    references ops.customers(cafe_id, id)
    on delete cascade,
  constraint ck_customer_aliases_alias_nonempty
    check (length(btrim(alias_text)) > 0),
  constraint ck_customer_aliases_normalized_nonempty
    check (length(btrim(normalized_alias)) > 0)
);

create unique index if not exists idx_customer_aliases_cafe_normalized_unique
  on ops.customer_aliases (cafe_id, normalized_alias);

create index if not exists idx_customer_aliases_customer_usage
  on ops.customer_aliases (cafe_id, customer_id, usage_count desc, last_used_at desc nulls last, created_at desc);

create table if not exists ops.customer_links (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  customer_id uuid not null,
  payment_id uuid,
  service_session_id uuid,
  link_source text not null check (link_source in ('deferred_payment', 'deferred_session', 'manual')),
  linked_at timestamptz not null default now(),
  linked_by_owner_id uuid,
  linked_by_staff_id uuid,
  notes text,
  unique (cafe_id, id),
  constraint fk_customer_links_customer
    foreign key (cafe_id, customer_id)
    references ops.customers(cafe_id, id)
    on delete cascade,
  constraint fk_customer_links_payment
    foreign key (cafe_id, payment_id)
    references ops.payments(cafe_id, id)
    on delete cascade,
  constraint fk_customer_links_session
    foreign key (cafe_id, service_session_id)
    references ops.service_sessions(cafe_id, id)
    on delete cascade,
  constraint fk_customer_links_owner
    foreign key (cafe_id, linked_by_owner_id)
    references ops.owner_users(cafe_id, id)
    on delete set null,
  constraint fk_customer_links_staff
    foreign key (cafe_id, linked_by_staff_id)
    references ops.staff_members(cafe_id, id)
    on delete set null,
  constraint ck_customer_links_target_present
    check (payment_id is not null or service_session_id is not null)
);

create unique index if not exists idx_customer_links_customer_payment_unique
  on ops.customer_links (cafe_id, customer_id, payment_id)
  where payment_id is not null;

create unique index if not exists idx_customer_links_customer_session_unique
  on ops.customer_links (cafe_id, customer_id, service_session_id)
  where service_session_id is not null;

create index if not exists idx_customer_links_customer_recent
  on ops.customer_links (cafe_id, customer_id, linked_at desc);

commit;
