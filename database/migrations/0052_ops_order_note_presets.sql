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
