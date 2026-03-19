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
