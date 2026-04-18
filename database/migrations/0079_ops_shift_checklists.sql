begin;

create table if not exists ops.shift_checklists (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  shift_id uuid not null references ops.shifts(id) on delete cascade,
  stage text not null,
  status text not null default 'draft',
  checklist_json jsonb not null default '{}'::jsonb,
  quick_cash_count numeric(12,2) null,
  supervisor_notes text null,
  issues_summary text null,
  approved_by_owner_id uuid null references ops.owner_users(id) on delete set null,
  approved_by_staff_id uuid null references ops.staff_members(id) on delete set null,
  approved_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint shift_checklists_stage_check check (stage in ('opening', 'closing')),
  constraint shift_checklists_status_check check (status in ('draft', 'completed')),
  constraint shift_checklists_actor_check check (
    approved_by_owner_id is null
    or approved_by_staff_id is null
  )
);

create unique index if not exists shift_checklists_shift_stage_key
  on ops.shift_checklists (cafe_id, shift_id, stage);

create index if not exists shift_checklists_shift_idx
  on ops.shift_checklists (cafe_id, shift_id, updated_at desc);

commit;
