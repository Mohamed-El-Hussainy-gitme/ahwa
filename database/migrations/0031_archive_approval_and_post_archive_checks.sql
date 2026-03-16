begin;

create table if not exists ops.archive_execution_approvals (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  grace_days integer not null default 14,
  archive_before_date date not null,
  requested_by text not null default 'system',
  approved_by text,
  status text not null default 'pending' check (
    status in (
      'pending',
      'superseded',
      'stale',
      'expired',
      'executed',
      'failed_post_check',
      'failed'
    )
  ),
  plan_result_json jsonb not null default '{}'::jsonb,
  execution_result_json jsonb,
  post_check_json jsonb,
  request_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  approved_at timestamptz,
  executed_at timestamptz,
  invalidated_at timestamptz,
  stale_reason text
);

create index if not exists idx_archive_execution_approvals_cafe_status
  on ops.archive_execution_approvals(cafe_id, status, created_at desc);

create index if not exists idx_archive_execution_approvals_pending_expiry
  on ops.archive_execution_approvals(status, expires_at)
  where status = 'pending';

create or replace function public.ops_request_archive_execution_approval(
  p_cafe_id uuid,
  p_grace_days integer default 14,
  p_requested_by text default 'system',
  p_request_json jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, archive
as $$
declare
  v_cutoff date := current_date - greatest(coalesce(p_grace_days, 14), 0);
  v_plan jsonb;
  v_approval_id uuid;
  v_expires_at timestamptz;
begin
  if p_cafe_id is null then
    raise exception 'p_cafe_id is required';
  end if;

  update ops.archive_execution_approvals
  set status = 'expired',
      invalidated_at = now(),
      stale_reason = coalesce(stale_reason, 'expired_before_request')
  where cafe_id = p_cafe_id
    and status = 'pending'
    and expires_at < now();

  v_plan := public.ops_archive_closed_data(p_cafe_id, v_cutoff, true, true);

  if coalesce((v_plan ->> 'shift_count')::integer, 0) = 0 then
    return jsonb_build_object(
      'ok', true,
      'approval_required', false,
      'approval_id', null,
      'archive_before_date', v_cutoff,
      'grace_days', greatest(coalesce(p_grace_days, 14), 0),
      'plan', v_plan
    );
  end if;

  update ops.archive_execution_approvals
  set status = 'superseded',
      invalidated_at = now(),
      stale_reason = 'superseded_by_new_plan'
  where cafe_id = p_cafe_id
    and status = 'pending';

  insert into ops.archive_execution_approvals (
    cafe_id,
    grace_days,
    archive_before_date,
    requested_by,
    status,
    plan_result_json,
    request_json,
    expires_at
  ) values (
    p_cafe_id,
    greatest(coalesce(p_grace_days, 14), 0),
    v_cutoff,
    coalesce(nullif(btrim(p_requested_by), ''), 'system'),
    'pending',
    v_plan,
    coalesce(p_request_json, '{}'::jsonb),
    now() + interval '24 hours'
  ) returning id, expires_at into v_approval_id, v_expires_at;

  return jsonb_build_object(
    'ok', true,
    'approval_required', true,
    'approval_id', v_approval_id,
    'archive_before_date', v_cutoff,
    'grace_days', greatest(coalesce(p_grace_days, 14), 0),
    'expires_at', v_expires_at,
    'plan', v_plan
  );
end;
$$;

create or replace function public.ops_post_archive_runtime_check(
  p_cafe_id uuid,
  p_archive_before_date date,
  p_shift_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, archive
as $$
declare
  v_result jsonb;
begin
  with target_shifts as (
    select s.id, s.business_date
    from ops.shifts s
    where s.cafe_id = p_cafe_id
      and s.detail_archived_at is not null
      and s.business_date <= p_archive_before_date
      and (
        p_shift_ids is null
        or coalesce(array_length(p_shift_ids, 1), 0) = 0
        or s.id = any(p_shift_ids)
      )
  ),
  target_days as (
    select distinct business_date
    from target_shifts
  ),
  target_weeks as (
    select distinct date_trunc('week', business_date::timestamp)::date as week_start_date
    from target_days
  ),
  target_months as (
    select distinct date_trunc('month', business_date::timestamp)::date as month_start_date
    from target_days
  ),
  target_years as (
    select distinct date_trunc('year', business_date::timestamp)::date as year_start_date
    from target_days
  ),
  lingering as (
    select jsonb_build_object(
      'service_sessions', (
        select count(*)::int
        from ops.service_sessions ss
        join target_shifts ts on ts.id = ss.shift_id
        where ss.cafe_id = p_cafe_id
      ),
      'orders', (
        select count(*)::int
        from ops.orders o
        join target_shifts ts on ts.id = o.shift_id
        where o.cafe_id = p_cafe_id
      ),
      'order_items', (
        select count(*)::int
        from ops.order_items oi
        join target_shifts ts on ts.id = oi.shift_id
        where oi.cafe_id = p_cafe_id
      ),
      'fulfillment_events', (
        select count(*)::int
        from ops.fulfillment_events fe
        join target_shifts ts on ts.id = fe.shift_id
        where fe.cafe_id = p_cafe_id
      ),
      'payments', (
        select count(*)::int
        from ops.payments p
        join target_shifts ts on ts.id = p.shift_id
        where p.cafe_id = p_cafe_id
      ),
      'payment_allocations', (
        select count(*)::int
        from ops.payment_allocations pa
        join ops.payments p on p.cafe_id = pa.cafe_id and p.id = pa.payment_id
        join target_shifts ts on ts.id = p.shift_id
        where pa.cafe_id = p_cafe_id
      ),
      'complaints', (
        select count(*)::int
        from ops.complaints c
        join target_shifts ts on ts.id = c.shift_id
        where c.cafe_id = p_cafe_id
      ),
      'order_item_issues', (
        select count(*)::int
        from ops.order_item_issues i
        join target_shifts ts on ts.id = i.shift_id
        where i.cafe_id = p_cafe_id
      )
    ) as value
  ),
  missing_daily as (
    select coalesce(jsonb_agg(td.business_date order by td.business_date), '[]'::jsonb) as value
    from target_days td
    where not exists (
      select 1
      from ops.daily_snapshots ds
      where ds.cafe_id = p_cafe_id
        and ds.business_date = td.business_date
        and ds.is_finalized = true
    )
  ),
  missing_weekly as (
    select coalesce(jsonb_agg(tw.week_start_date order by tw.week_start_date), '[]'::jsonb) as value
    from target_weeks tw
    where not exists (
      select 1
      from ops.weekly_summaries ws
      where ws.cafe_id = p_cafe_id
        and ws.week_start_date = tw.week_start_date
    )
  ),
  missing_monthly as (
    select coalesce(jsonb_agg(tm.month_start_date order by tm.month_start_date), '[]'::jsonb) as value
    from target_months tm
    where not exists (
      select 1
      from ops.monthly_summaries ms
      where ms.cafe_id = p_cafe_id
        and ms.month_start_date = tm.month_start_date
    )
  ),
  missing_yearly as (
    select coalesce(jsonb_agg(ty.year_start_date order by ty.year_start_date), '[]'::jsonb) as value
    from target_years ty
    where not exists (
      select 1
      from ops.yearly_summaries ys
      where ys.cafe_id = p_cafe_id
        and ys.year_start_date = ty.year_start_date
    )
  ),
  counts as (
    select count(*)::int as target_shift_count from target_shifts
  ),
  day_counts as (
    select count(*)::int as target_day_count from target_days
  )
  select jsonb_build_object(
    'ok', (
      coalesce((select sum((value)::int) from jsonb_each_text((select value from lingering))), 0) = 0
      and jsonb_array_length((select value from missing_daily)) = 0
      and jsonb_array_length((select value from missing_weekly)) = 0
      and jsonb_array_length((select value from missing_monthly)) = 0
      and jsonb_array_length((select value from missing_yearly)) = 0
    ),
    'archive_before_date', p_archive_before_date,
    'target_shift_count', (select target_shift_count from counts),
    'target_day_count', (select target_day_count from day_counts),
    'lingering_runtime_rows', (select value from lingering),
    'missing_daily_finalized_snapshots', (select value from missing_daily),
    'missing_weekly_summaries', (select value from missing_weekly),
    'missing_monthly_summaries', (select value from missing_monthly),
    'missing_yearly_summaries', (select value from missing_yearly)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.ops_execute_archive_execution_approval(
  p_approval_id uuid,
  p_approved_by text default 'manual',
  p_request_json jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops, archive
as $$
declare
  v_approval ops.archive_execution_approvals%rowtype;
  v_fresh_plan jsonb;
  v_execution jsonb;
  v_post_check jsonb;
  v_shift_ids uuid[];
  v_ok boolean;
begin
  if p_approval_id is null then
    raise exception 'p_approval_id is required';
  end if;

  select *
  into v_approval
  from ops.archive_execution_approvals
  where id = p_approval_id
  for update;

  if not found then
    raise exception 'ARCHIVE_APPROVAL_NOT_FOUND';
  end if;

  if v_approval.status <> 'pending' then
    raise exception 'ARCHIVE_APPROVAL_NOT_PENDING';
  end if;

  if v_approval.expires_at < now() then
    update ops.archive_execution_approvals
    set status = 'expired',
        invalidated_at = now(),
        stale_reason = 'approval_expired_before_execution'
    where id = p_approval_id;
    raise exception 'ARCHIVE_APPROVAL_EXPIRED';
  end if;

  v_fresh_plan := public.ops_archive_closed_data(
    v_approval.cafe_id,
    v_approval.archive_before_date,
    true,
    true
  );

  if coalesce((v_fresh_plan ->> 'shift_count')::integer, 0) <> coalesce((v_approval.plan_result_json ->> 'shift_count')::integer, 0)
     or coalesce(v_fresh_plan -> 'daily_snapshot_dates', '[]'::jsonb) <> coalesce(v_approval.plan_result_json -> 'daily_snapshot_dates', '[]'::jsonb)
     or coalesce(v_fresh_plan -> 'weekly_summary_weeks', '[]'::jsonb) <> coalesce(v_approval.plan_result_json -> 'weekly_summary_weeks', '[]'::jsonb)
     or coalesce(v_fresh_plan -> 'monthly_summary_months', '[]'::jsonb) <> coalesce(v_approval.plan_result_json -> 'monthly_summary_months', '[]'::jsonb)
     or coalesce(v_fresh_plan -> 'yearly_summary_years', '[]'::jsonb) <> coalesce(v_approval.plan_result_json -> 'yearly_summary_years', '[]'::jsonb)
  then
    update ops.archive_execution_approvals
    set status = 'stale',
        invalidated_at = now(),
        stale_reason = 'eligible_shift_window_changed_before_execution',
        request_json = coalesce(request_json, '{}'::jsonb) || jsonb_build_object(
          'fresh_plan', v_fresh_plan,
          'execute_request', coalesce(p_request_json, '{}'::jsonb)
        )
    where id = p_approval_id;

    return jsonb_build_object(
      'ok', false,
      'reason', 'APPROVAL_STALE_REPLAN_REQUIRED',
      'approval_id', p_approval_id,
      'stored_plan', v_approval.plan_result_json,
      'fresh_plan', v_fresh_plan
    );
  end if;

  select coalesce(array_agg(s.id order by s.business_date, s.opened_at), '{}'::uuid[])
  into v_shift_ids
  from ops.shifts s
  join ops.daily_snapshots ds
    on ds.cafe_id = s.cafe_id
   and ds.business_date = s.business_date
   and ds.is_finalized = true
  where s.cafe_id = v_approval.cafe_id
    and s.status = 'closed'
    and s.business_date <= v_approval.archive_before_date
    and s.detail_archived_at is null;

  v_execution := public.ops_archive_closed_data(
    v_approval.cafe_id,
    v_approval.archive_before_date,
    true,
    false
  );

  v_post_check := public.ops_post_archive_runtime_check(
    v_approval.cafe_id,
    v_approval.archive_before_date,
    v_shift_ids
  );

  v_ok := coalesce((v_execution ->> 'ok')::boolean, false)
    and coalesce((v_post_check ->> 'ok')::boolean, false);

  update ops.archive_execution_approvals
  set approved_by = coalesce(nullif(btrim(p_approved_by), ''), 'manual'),
      approved_at = now(),
      executed_at = now(),
      execution_result_json = v_execution,
      post_check_json = v_post_check,
      request_json = coalesce(request_json, '{}'::jsonb) || jsonb_build_object(
        'execute_request', coalesce(p_request_json, '{}'::jsonb)
      ),
      status = case when v_ok then 'executed' else 'failed_post_check' end
  where id = p_approval_id;

  return jsonb_build_object(
    'ok', v_ok,
    'approval_id', p_approval_id,
    'archive_before_date', v_approval.archive_before_date,
    'execution', v_execution,
    'post_check', v_post_check
  );
exception
  when others then
    update ops.archive_execution_approvals
    set status = 'failed',
        invalidated_at = now(),
        stale_reason = sqlerrm,
        request_json = coalesce(request_json, '{}'::jsonb) || jsonb_build_object(
          'execute_request', coalesce(p_request_json, '{}'::jsonb)
        )
    where id = p_approval_id;
    raise;
end;
$$;

commit;
