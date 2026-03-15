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
