begin;

create table if not exists ops.cafe_operating_settings (
  cafe_id uuid primary key
    references ops.cafes(id)
    on delete cascade,
  business_day_start_minutes integer not null default 0
    check (business_day_start_minutes >= 0 and business_day_start_minutes <= 1439),
  timezone_name text not null default 'Africa/Cairo'
    check (timezone_name = 'Africa/Cairo'),
  updated_at timestamptz not null default now(),
  updated_by_owner_id uuid,
  constraint fk_cafe_operating_settings_owner
    foreign key (cafe_id, updated_by_owner_id)
    references ops.owner_users(cafe_id, id)
    on delete set null
);

commit;
