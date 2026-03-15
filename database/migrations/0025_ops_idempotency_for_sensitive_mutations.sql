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
