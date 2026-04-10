create table if not exists ops.pwa_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  user_id uuid not null,
  shift_id uuid not null references ops.shifts(id) on delete cascade,
  role_code text not null check (role_code in ('waiter', 'american_waiter', 'barista', 'shisha')),
  endpoint text not null,
  p256dh_key text not null,
  auth_key text not null,
  is_active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  last_error_at timestamptz null,
  user_agent text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cafe_id, endpoint)
);
create index if not exists idx_pwa_push_subscriptions_active_role_shift on ops.pwa_push_subscriptions (cafe_id, shift_id, role_code) where is_active = true;
create index if not exists idx_pwa_push_subscriptions_user on ops.pwa_push_subscriptions (cafe_id, user_id);
create or replace function ops.touch_pwa_push_subscription_updated_at() returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end; $$;
drop trigger if exists trg_touch_pwa_push_subscription_updated_at on ops.pwa_push_subscriptions;
create trigger trg_touch_pwa_push_subscription_updated_at before update on ops.pwa_push_subscriptions for each row execute function ops.touch_pwa_push_subscription_updated_at();
