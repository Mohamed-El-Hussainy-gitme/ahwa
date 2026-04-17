begin;

create table if not exists ops.shift_assignment_templates (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  shift_kind text not null check (shift_kind in ('morning', 'evening')),
  template_label text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cafe_id, id),
  unique (cafe_id, shift_kind)
);

create table if not exists ops.shift_assignment_template_members (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  template_id uuid not null,
  role_code text not null check (role_code in ('supervisor', 'waiter', 'barista', 'shisha', 'american_waiter')),
  staff_member_id uuid,
  owner_user_id uuid,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  unique (cafe_id, id),
  constraint fk_shift_assignment_template_members_template
    foreign key (cafe_id, template_id)
    references ops.shift_assignment_templates(cafe_id, id)
    on delete cascade,
  constraint fk_shift_assignment_template_members_staff
    foreign key (cafe_id, staff_member_id)
    references ops.staff_members(cafe_id, id)
    on delete cascade,
  constraint fk_shift_assignment_template_members_owner
    foreign key (cafe_id, owner_user_id)
    references ops.owner_users(cafe_id, id)
    on delete cascade,
  constraint ck_shift_assignment_template_members_actor
    check (
      (staff_member_id is not null and owner_user_id is null)
      or
      (staff_member_id is null and owner_user_id is not null)
    )
);

create index if not exists idx_shift_assignment_templates_cafe_kind
  on ops.shift_assignment_templates (cafe_id, shift_kind);

create index if not exists idx_shift_assignment_template_members_template
  on ops.shift_assignment_template_members (cafe_id, template_id, sort_order);

commit;
