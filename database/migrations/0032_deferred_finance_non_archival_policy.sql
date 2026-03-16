begin;

create or replace function public.ops_assert_deferred_finance_non_archival_policy()
returns jsonb
language plpgsql
security definer
set search_path = public, ops, archive
as $$
declare
  v_issues text[] := '{}'::text[];
  v_session_confdel "char";
  v_payment_confdel "char";
  v_result jsonb;
begin
  if to_regclass('ops.deferred_ledger_entries') is null then
    v_issues := array_append(v_issues, 'ops.deferred_ledger_entries_missing');
  end if;

  if to_regclass('ops.deferred_customer_balances') is null then
    v_issues := array_append(v_issues, 'ops.deferred_customer_balances_missing');
  end if;

  if to_regclass('archive.deferred_ledger_entries') is not null then
    v_issues := array_append(v_issues, 'archive.deferred_ledger_entries_must_not_exist');
  end if;

  if to_regclass('archive.deferred_customer_balances') is not null then
    v_issues := array_append(v_issues, 'archive.deferred_customer_balances_must_not_exist');
  end if;

  select c.confdeltype
  into v_session_confdel
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'ops'
    and t.relname = 'deferred_ledger_entries'
    and c.conname = 'fk_deferred_session';

  if coalesce(v_session_confdel::text, '') <> 'n' then
    v_issues := array_append(v_issues, 'fk_deferred_session_must_use_on_delete_set_null');
  end if;

  select c.confdeltype
  into v_payment_confdel
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'ops'
    and t.relname = 'deferred_ledger_entries'
    and c.conname = 'fk_deferred_payment';

  if coalesce(v_payment_confdel::text, '') <> 'n' then
    v_issues := array_append(v_issues, 'fk_deferred_payment_must_use_on_delete_set_null');
  end if;

  v_result := jsonb_build_object(
    'ok', coalesce(array_length(v_issues, 1), 0) = 0,
    'policy', 'deferred_ledger_live_non_archival',
    'issues', to_jsonb(coalesce(v_issues, '{}'::text[])),
    'deferred_ledger_entries_table', coalesce(to_regclass('ops.deferred_ledger_entries')::text, null),
    'deferred_customer_balances_table', coalesce(to_regclass('ops.deferred_customer_balances')::text, null),
    'archive_deferred_ledger_entries_table', coalesce(to_regclass('archive.deferred_ledger_entries')::text, null),
    'archive_deferred_customer_balances_table', coalesce(to_regclass('archive.deferred_customer_balances')::text, null),
    'fk_deferred_session_on_delete', case when v_session_confdel = 'n' then 'set_null' else coalesce(v_session_confdel::text, 'missing') end,
    'fk_deferred_payment_on_delete', case when v_payment_confdel = 'n' then 'set_null' else coalesce(v_payment_confdel::text, 'missing') end,
    'checked_at', now()
  );

  return v_result;
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
  v_policy jsonb;
begin
  v_policy := public.ops_assert_deferred_finance_non_archival_policy();

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
  ),
  deferred_live_finance as (
    select jsonb_build_object(
      'deferred_ledger_entry_count', (
        select count(*)::int
        from ops.deferred_ledger_entries dle
        where dle.cafe_id = p_cafe_id
      ),
      'deferred_customer_balance_count', (
        select count(*)::int
        from ops.deferred_customer_balances dcb
        where dcb.cafe_id = p_cafe_id
      )
    ) as value
  )
  select jsonb_build_object(
    'ok', (
      coalesce((select sum((value)::int) from jsonb_each_text((select value from lingering))), 0) = 0
      and jsonb_array_length((select value from missing_daily)) = 0
      and jsonb_array_length((select value from missing_weekly)) = 0
      and jsonb_array_length((select value from missing_monthly)) = 0
      and jsonb_array_length((select value from missing_yearly)) = 0
      and coalesce((v_policy ->> 'ok')::boolean, false)
    ),
    'archive_before_date', p_archive_before_date,
    'target_shift_count', (select target_shift_count from counts),
    'target_day_count', (select target_day_count from day_counts),
    'lingering_runtime_rows', (select value from lingering),
    'missing_daily_finalized_snapshots', (select value from missing_daily),
    'missing_weekly_summaries', (select value from missing_weekly),
    'missing_monthly_summaries', (select value from missing_monthly),
    'missing_yearly_summaries', (select value from missing_yearly),
    'deferred_live_finance', (select value from deferred_live_finance),
    'deferred_finance_policy', v_policy
  ) into v_result;

  return v_result;
end;
$$;

commit;
