begin;

create table if not exists ops.deferred_customer_balances (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references ops.cafes(id) on delete cascade,
  debtor_name text not null,
  balance numeric(12,2) not null default 0,
  debt_total numeric(12,2) not null default 0,
  repayment_total numeric(12,2) not null default 0,
  entry_count integer not null default 0,
  last_entry_at timestamptz,
  last_debt_at timestamptz,
  last_repayment_at timestamptz,
  last_entry_kind text check (last_entry_kind in ('debt', 'repayment', 'adjustment')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cafe_id, debtor_name)
);

create index if not exists idx_deferred_customer_balances_cafe_balance
  on ops.deferred_customer_balances(cafe_id, balance desc, last_entry_at desc nulls last);

alter table ops.daily_snapshots
  add column if not exists source_shift_ids uuid[] not null default '{}'::uuid[],
  add column if not exists closed_shift_count integer not null default 0,
  add column if not exists is_finalized boolean not null default false,
  add column if not exists finalized_at timestamptz;

create or replace function public.ops_rebuild_deferred_customer_balances(
  p_cafe_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_rows integer := 0;
begin
  if p_cafe_id is null then
    delete from ops.deferred_customer_balances;

    insert into ops.deferred_customer_balances (
      cafe_id,
      debtor_name,
      balance,
      debt_total,
      repayment_total,
      entry_count,
      last_entry_at,
      last_debt_at,
      last_repayment_at,
      last_entry_kind,
      created_at,
      updated_at
    )
    with ledger as (
      select
        dle.cafe_id,
        btrim(dle.debtor_name) as debtor_name,
        dle.entry_kind,
        dle.amount,
        dle.created_at
      from ops.deferred_ledger_entries dle
      where nullif(btrim(dle.debtor_name), '') is not null
    ),
    normalized as (
      select
        cafe_id,
        debtor_name,
        count(*)::int as entry_count,
        coalesce(sum(case when entry_kind = 'debt' then amount else 0 end), 0)::numeric(12,2) as debt_total,
        coalesce(sum(case when entry_kind = 'repayment' then amount else 0 end), 0)::numeric(12,2) as repayment_total,
        max(created_at) as last_entry_at,
        max(created_at) filter (where entry_kind = 'debt') as last_debt_at,
        max(created_at) filter (where entry_kind = 'repayment') as last_repayment_at
      from ledger
      group by cafe_id, debtor_name
    ),
    last_kind as (
      select distinct on (dle.cafe_id, btrim(dle.debtor_name))
        dle.cafe_id,
        btrim(dle.debtor_name) as debtor_name,
        dle.entry_kind as last_entry_kind
      from ops.deferred_ledger_entries dle
      where nullif(btrim(dle.debtor_name), '') is not null
      order by dle.cafe_id, btrim(dle.debtor_name), dle.created_at desc, dle.id desc
    )
    select
      normalized.cafe_id,
      normalized.debtor_name,
      (normalized.debt_total - normalized.repayment_total)::numeric(12,2) as balance,
      normalized.debt_total,
      normalized.repayment_total,
      normalized.entry_count,
      normalized.last_entry_at,
      normalized.last_debt_at,
      normalized.last_repayment_at,
      last_kind.last_entry_kind,
      now(),
      now()
    from normalized
    left join last_kind
      on last_kind.cafe_id = normalized.cafe_id
     and last_kind.debtor_name = normalized.debtor_name;
  else
    delete from ops.deferred_customer_balances
    where cafe_id = p_cafe_id;

    insert into ops.deferred_customer_balances (
      cafe_id,
      debtor_name,
      balance,
      debt_total,
      repayment_total,
      entry_count,
      last_entry_at,
      last_debt_at,
      last_repayment_at,
      last_entry_kind,
      created_at,
      updated_at
    )
    with ledger as (
      select
        dle.cafe_id,
        btrim(dle.debtor_name) as debtor_name,
        dle.entry_kind,
        dle.amount,
        dle.created_at
      from ops.deferred_ledger_entries dle
      where dle.cafe_id = p_cafe_id
        and nullif(btrim(dle.debtor_name), '') is not null
    ),
    normalized as (
      select
        cafe_id,
        debtor_name,
        count(*)::int as entry_count,
        coalesce(sum(case when entry_kind = 'debt' then amount else 0 end), 0)::numeric(12,2) as debt_total,
        coalesce(sum(case when entry_kind = 'repayment' then amount else 0 end), 0)::numeric(12,2) as repayment_total,
        max(created_at) as last_entry_at,
        max(created_at) filter (where entry_kind = 'debt') as last_debt_at,
        max(created_at) filter (where entry_kind = 'repayment') as last_repayment_at
      from ledger
      group by cafe_id, debtor_name
    ),
    last_kind as (
      select distinct on (dle.cafe_id, btrim(dle.debtor_name))
        dle.cafe_id,
        btrim(dle.debtor_name) as debtor_name,
        dle.entry_kind as last_entry_kind
      from ops.deferred_ledger_entries dle
      where dle.cafe_id = p_cafe_id
        and nullif(btrim(dle.debtor_name), '') is not null
      order by dle.cafe_id, btrim(dle.debtor_name), dle.created_at desc, dle.id desc
    )
    select
      normalized.cafe_id,
      normalized.debtor_name,
      (normalized.debt_total - normalized.repayment_total)::numeric(12,2) as balance,
      normalized.debt_total,
      normalized.repayment_total,
      normalized.entry_count,
      normalized.last_entry_at,
      normalized.last_debt_at,
      normalized.last_repayment_at,
      last_kind.last_entry_kind,
      now(),
      now()
    from normalized
    left join last_kind
      on last_kind.cafe_id = normalized.cafe_id
     and last_kind.debtor_name = normalized.debtor_name;
  end if;

  get diagnostics v_rows = row_count;

  return jsonb_build_object(
    'ok', true,
    'scope', case when p_cafe_id is null then 'all' else 'cafe' end,
    'cafe_id', p_cafe_id,
    'rows', v_rows
  );
end;
$$;

create or replace function public.ops_sync_deferred_customer_balance(
  p_cafe_id uuid,
  p_debtor_name text
)
returns void
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_name text := nullif(btrim(p_debtor_name), '');
  v_entry_count integer := 0;
  v_debt_total numeric(12,2) := 0;
  v_repayment_total numeric(12,2) := 0;
  v_last_entry_at timestamptz;
  v_last_debt_at timestamptz;
  v_last_repayment_at timestamptz;
  v_last_entry_kind text;
begin
  if p_cafe_id is null then
    raise exception 'p_cafe_id is required';
  end if;

  if v_name is null then
    return;
  end if;

  select
    count(*)::int,
    coalesce(sum(case when entry_kind = 'debt' then amount else 0 end), 0)::numeric(12,2),
    coalesce(sum(case when entry_kind = 'repayment' then amount else 0 end), 0)::numeric(12,2),
    max(created_at),
    max(created_at) filter (where entry_kind = 'debt'),
    max(created_at) filter (where entry_kind = 'repayment')
  into v_entry_count, v_debt_total, v_repayment_total, v_last_entry_at, v_last_debt_at, v_last_repayment_at
  from ops.deferred_ledger_entries
  where cafe_id = p_cafe_id
    and btrim(debtor_name) = v_name;

  if v_entry_count = 0 then
    delete from ops.deferred_customer_balances
    where cafe_id = p_cafe_id
      and debtor_name = v_name;
    return;
  end if;

  select dle.entry_kind
  into v_last_entry_kind
  from ops.deferred_ledger_entries dle
  where dle.cafe_id = p_cafe_id
    and btrim(dle.debtor_name) = v_name
  order by dle.created_at desc, dle.id desc
  limit 1;

  insert into ops.deferred_customer_balances (
    cafe_id,
    debtor_name,
    balance,
    debt_total,
    repayment_total,
    entry_count,
    last_entry_at,
    last_debt_at,
    last_repayment_at,
    last_entry_kind,
    created_at,
    updated_at
  ) values (
    p_cafe_id,
    v_name,
    (v_debt_total - v_repayment_total)::numeric(12,2),
    v_debt_total,
    v_repayment_total,
    v_entry_count,
    v_last_entry_at,
    v_last_debt_at,
    v_last_repayment_at,
    v_last_entry_kind,
    now(),
    now()
  )
  on conflict (cafe_id, debtor_name)
  do update set balance = excluded.balance,
                debt_total = excluded.debt_total,
                repayment_total = excluded.repayment_total,
                entry_count = excluded.entry_count,
                last_entry_at = excluded.last_entry_at,
                last_debt_at = excluded.last_debt_at,
                last_repayment_at = excluded.last_repayment_at,
                last_entry_kind = excluded.last_entry_kind,
                updated_at = now();
end;
$$;

create or replace function public.ops_trg_sync_deferred_customer_balance()
returns trigger
language plpgsql
security definer
set search_path = public, ops
as $$
begin
  if tg_op = 'DELETE' then
    perform public.ops_sync_deferred_customer_balance(old.cafe_id, old.debtor_name);
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.cafe_id is distinct from new.cafe_id or btrim(coalesce(old.debtor_name, '')) is distinct from btrim(coalesce(new.debtor_name, '')) then
      perform public.ops_sync_deferred_customer_balance(old.cafe_id, old.debtor_name);
    end if;
    perform public.ops_sync_deferred_customer_balance(new.cafe_id, new.debtor_name);
    return new;
  end if;

  perform public.ops_sync_deferred_customer_balance(new.cafe_id, new.debtor_name);
  return new;
end;
$$;

drop trigger if exists trg_sync_deferred_customer_balance on ops.deferred_ledger_entries;
create trigger trg_sync_deferred_customer_balance
  after insert or update or delete on ops.deferred_ledger_entries
  for each row execute function public.ops_trg_sync_deferred_customer_balance();

select public.ops_rebuild_deferred_customer_balances();

create or replace function public.ops_deferred_customer_summaries(
  p_cafe_id uuid
)
returns table (
  debtor_name text,
  entry_count bigint,
  debt_total numeric,
  repayment_total numeric,
  balance numeric,
  last_entry_at timestamptz,
  last_debt_at timestamptz,
  last_repayment_at timestamptz,
  last_entry_kind text
)
language sql
security definer
set search_path = public, ops
as $$
  select
    dcb.debtor_name,
    dcb.entry_count::bigint as entry_count,
    dcb.debt_total::numeric as debt_total,
    dcb.repayment_total::numeric as repayment_total,
    dcb.balance::numeric as balance,
    dcb.last_entry_at,
    dcb.last_debt_at,
    dcb.last_repayment_at,
    dcb.last_entry_kind
  from ops.deferred_customer_balances dcb
  where dcb.cafe_id = p_cafe_id
  order by dcb.balance desc, dcb.last_entry_at desc nulls last, dcb.debtor_name asc;
$$;

create or replace function public.ops_refresh_daily_snapshot(
  p_cafe_id uuid,
  p_business_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_snapshot jsonb;
  v_source_shift_ids uuid[] := '{}'::uuid[];
  v_closed_shift_count integer := 0;
  v_is_finalized boolean := false;
  v_finalized_at timestamptz := null;
begin
  with source as (
    select
      s.id as shift_id,
      s.shift_kind,
      s.business_date,
      s.opened_at,
      s.closed_at,
      ss.snapshot_json
    from ops.shifts s
    join ops.shift_snapshots ss
      on ss.cafe_id = s.cafe_id
     and ss.shift_id = s.id
    where s.cafe_id = p_cafe_id
      and s.business_date = p_business_date
      and s.status = 'closed'
  ),
  counts as (
    select count(*)::int as shift_count from source
  ),
  totals as (
    select
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'submitted_qty')::numeric, 0)), 0) as submitted_qty,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'ready_qty')::numeric, 0)), 0) as ready_qty,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'delivered_qty')::numeric, 0)), 0) as delivered_qty,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'replacement_delivered_qty')::numeric, 0)), 0) as replacement_delivered_qty,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'paid_qty')::numeric, 0)), 0) as paid_qty,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'deferred_qty')::numeric, 0)), 0) as deferred_qty,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'remade_qty')::numeric, 0)), 0) as remade_qty,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'cancelled_qty')::numeric, 0)), 0) as cancelled_qty,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'waived_qty')::numeric, 0)), 0) as waived_qty,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'net_sales')::numeric, 0)), 0)::numeric(12,2) as net_sales,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'cash_total')::numeric, 0)), 0)::numeric(12,2) as cash_total,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'deferred_total')::numeric, 0)), 0)::numeric(12,2) as deferred_total,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'repayment_total')::numeric, 0)), 0)::numeric(12,2) as repayment_total,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'complaint_total')::numeric, 0)), 0) as complaint_total,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'complaint_open')::numeric, 0)), 0) as complaint_open,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'complaint_resolved')::numeric, 0)), 0) as complaint_resolved,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'complaint_dismissed')::numeric, 0)), 0) as complaint_dismissed,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'complaint_remake')::numeric, 0)), 0) as complaint_remake,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'complaint_cancel')::numeric, 0)), 0) as complaint_cancel,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'complaint_waive')::numeric, 0)), 0) as complaint_waive,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'item_issue_total')::numeric, 0)), 0) as item_issue_total,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'item_issue_note')::numeric, 0)), 0) as item_issue_note,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'item_issue_remake')::numeric, 0)), 0) as item_issue_remake,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'item_issue_cancel')::numeric, 0)), 0) as item_issue_cancel,
      coalesce(sum(coalesce((snapshot_json -> 'totals' ->> 'item_issue_waive')::numeric, 0)), 0) as item_issue_waive,
      coalesce(sum(coalesce((snapshot_json -> 'sessions' ->> 'open_sessions')::numeric, 0)), 0) as open_sessions,
      coalesce(sum(coalesce((snapshot_json -> 'sessions' ->> 'closed_sessions')::numeric, 0)), 0) as closed_sessions,
      coalesce(sum(coalesce((snapshot_json -> 'sessions' ->> 'total_sessions')::numeric, 0)), 0) as total_sessions
    from source
  ),
  products as (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.product_name, x.station_code), '[]'::jsonb) as value
    from (
      select
        prod ->> 'product_id' as product_id,
        prod ->> 'product_name' as product_name,
        prod ->> 'station_code' as station_code,
        sum(coalesce((prod ->> 'qty_submitted')::numeric, 0))::bigint as qty_submitted,
        sum(coalesce((prod ->> 'qty_ready')::numeric, 0))::bigint as qty_ready,
        sum(coalesce((prod ->> 'qty_delivered')::numeric, 0))::bigint as qty_delivered,
        sum(coalesce((prod ->> 'qty_replacement_delivered')::numeric, 0))::bigint as qty_replacement_delivered,
        sum(coalesce((prod ->> 'qty_paid')::numeric, 0))::bigint as qty_paid,
        sum(coalesce((prod ->> 'qty_deferred')::numeric, 0))::bigint as qty_deferred,
        sum(coalesce((prod ->> 'qty_remade')::numeric, 0))::bigint as qty_remade,
        sum(coalesce((prod ->> 'qty_cancelled')::numeric, 0))::bigint as qty_cancelled,
        sum(coalesce((prod ->> 'qty_waived')::numeric, 0))::bigint as qty_waived,
        sum(coalesce((prod ->> 'gross_sales')::numeric, 0))::numeric(12,2) as gross_sales,
        sum(coalesce((prod ->> 'net_sales')::numeric, 0))::numeric(12,2) as net_sales
      from source,
      lateral jsonb_array_elements(coalesce(source.snapshot_json -> 'products', '[]'::jsonb)) as prod
      group by prod ->> 'product_id', prod ->> 'product_name', prod ->> 'station_code'
    ) x
  ),
  staff as (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.actor_label), '[]'::jsonb) as value
    from (
      select
        perf ->> 'actor_label' as actor_label,
        sum(coalesce((perf ->> 'submitted_qty')::numeric, 0))::bigint as submitted_qty,
        sum(coalesce((perf ->> 'ready_qty')::numeric, 0))::bigint as ready_qty,
        sum(coalesce((perf ->> 'delivered_qty')::numeric, 0))::bigint as delivered_qty,
        sum(coalesce((perf ->> 'replacement_delivered_qty')::numeric, 0))::bigint as replacement_delivered_qty,
        sum(coalesce((perf ->> 'remade_qty')::numeric, 0))::bigint as remade_qty,
        sum(coalesce((perf ->> 'cancelled_qty')::numeric, 0))::bigint as cancelled_qty,
        sum(coalesce((perf ->> 'waived_qty')::numeric, 0))::bigint as waived_qty,
        sum(coalesce((perf ->> 'payment_total')::numeric, 0))::numeric(12,2) as payment_total,
        sum(coalesce((perf ->> 'cash_sales')::numeric, 0))::numeric(12,2) as cash_sales,
        sum(coalesce((perf ->> 'deferred_sales')::numeric, 0))::numeric(12,2) as deferred_sales,
        sum(coalesce((perf ->> 'repayment_total')::numeric, 0))::numeric(12,2) as repayment_total,
        sum(coalesce((perf ->> 'complaint_count')::numeric, 0))::bigint as complaint_count,
        sum(coalesce((perf ->> 'item_issue_count')::numeric, 0))::bigint as item_issue_count
      from source,
      lateral jsonb_array_elements(coalesce(source.snapshot_json -> 'staff', '[]'::jsonb)) as perf
      group by perf ->> 'actor_label'
    ) x
  ),
  shift_refs as (
    select
      coalesce(array_agg(source.shift_id order by source.shift_kind, source.closed_at nulls last, source.shift_id), '{}'::uuid[]) as shift_ids,
      count(*)::int as closed_shift_count,
      bool_and(source.shift_kind in ('morning', 'evening')) as valid_shift_kinds,
      count(distinct source.shift_kind)::int as distinct_shift_kinds,
      max(source.closed_at) as latest_closed_at
    from source
  )
  select case
    when (select shift_count from counts) = 0 then null
    else jsonb_build_object(
      'version', 2,
      'business_date', p_business_date,
      'summary', jsonb_build_object(
        'shift_count', coalesce((select shift_count from counts), 0),
        'submitted_qty', coalesce((select submitted_qty from totals), 0),
        'ready_qty', coalesce((select ready_qty from totals), 0),
        'delivered_qty', coalesce((select delivered_qty from totals), 0),
        'replacement_delivered_qty', coalesce((select replacement_delivered_qty from totals), 0),
        'paid_qty', coalesce((select paid_qty from totals), 0),
        'deferred_qty', coalesce((select deferred_qty from totals), 0),
        'remade_qty', coalesce((select remade_qty from totals), 0),
        'cancelled_qty', coalesce((select cancelled_qty from totals), 0),
        'waived_qty', coalesce((select waived_qty from totals), 0),
        'net_sales', coalesce((select net_sales from totals), 0),
        'cash_total', coalesce((select cash_total from totals), 0),
        'deferred_total', coalesce((select deferred_total from totals), 0),
        'repayment_total', coalesce((select repayment_total from totals), 0),
        'complaint_total', coalesce((select complaint_total from totals), 0),
        'complaint_open', coalesce((select complaint_open from totals), 0),
        'complaint_resolved', coalesce((select complaint_resolved from totals), 0),
        'complaint_dismissed', coalesce((select complaint_dismissed from totals), 0),
        'complaint_remake', coalesce((select complaint_remake from totals), 0),
        'complaint_cancel', coalesce((select complaint_cancel from totals), 0),
        'complaint_waive', coalesce((select complaint_waive from totals), 0),
        'item_issue_total', coalesce((select item_issue_total from totals), 0),
        'item_issue_note', coalesce((select item_issue_note from totals), 0),
        'item_issue_remake', coalesce((select item_issue_remake from totals), 0),
        'item_issue_cancel', coalesce((select item_issue_cancel from totals), 0),
        'item_issue_waive', coalesce((select item_issue_waive from totals), 0),
        'open_sessions', coalesce((select open_sessions from totals), 0),
        'closed_sessions', coalesce((select closed_sessions from totals), 0),
        'total_sessions', coalesce((select total_sessions from totals), 0),
        'recognized_sales', (coalesce((select cash_total from totals), 0) + coalesce((select deferred_total from totals), 0))::numeric(12,2)
      ),
      'products', coalesce((select value from products), '[]'::jsonb),
      'staff', coalesce((select value from staff), '[]'::jsonb),
      'source_shift_ids', to_jsonb(coalesce((select shift_ids from shift_refs), '{}'::uuid[])),
      'closed_shift_count', coalesce((select closed_shift_count from shift_refs), 0),
      'is_finalized', (
        coalesce((select valid_shift_kinds from shift_refs), false)
        and coalesce((select distinct_shift_kinds from shift_refs), 0) = 2
        and not exists (
          select 1
          from ops.shifts s_open
          where s_open.cafe_id = p_cafe_id
            and s_open.business_date = p_business_date
            and s_open.status = 'open'
        )
      ),
      'finalized_at', case
        when (
          coalesce((select valid_shift_kinds from shift_refs), false)
          and coalesce((select distinct_shift_kinds from shift_refs), 0) = 2
          and not exists (
            select 1
            from ops.shifts s_open
            where s_open.cafe_id = p_cafe_id
              and s_open.business_date = p_business_date
              and s_open.status = 'open'
          )
        ) then (select latest_closed_at from shift_refs)
        else null
      end
    )
  end into v_snapshot;

  select
    coalesce(shift_ids, '{}'::uuid[]),
    coalesce(closed_shift_count, 0),
    (
      coalesce(valid_shift_kinds, false)
      and coalesce(distinct_shift_kinds, 0) = 2
      and not exists (
        select 1
        from ops.shifts s_open
        where s_open.cafe_id = p_cafe_id
          and s_open.business_date = p_business_date
          and s_open.status = 'open'
      )
    ),
    case
      when (
        coalesce(valid_shift_kinds, false)
        and coalesce(distinct_shift_kinds, 0) = 2
        and not exists (
          select 1
          from ops.shifts s_open
          where s_open.cafe_id = p_cafe_id
            and s_open.business_date = p_business_date
            and s_open.status = 'open'
        )
      ) then latest_closed_at
      else null
    end
  into v_source_shift_ids, v_closed_shift_count, v_is_finalized, v_finalized_at
  from (
    with source as (
      select s.id as shift_id, s.shift_kind, s.closed_at
      from ops.shifts s
      join ops.shift_snapshots ss
        on ss.cafe_id = s.cafe_id
       and ss.shift_id = s.id
      where s.cafe_id = p_cafe_id
        and s.business_date = p_business_date
        and s.status = 'closed'
    )
    select
      coalesce(array_agg(source.shift_id order by source.shift_kind, source.closed_at nulls last, source.shift_id), '{}'::uuid[]) as shift_ids,
      count(*)::int as closed_shift_count,
      bool_and(source.shift_kind in ('morning', 'evening')) as valid_shift_kinds,
      count(distinct source.shift_kind)::int as distinct_shift_kinds,
      max(source.closed_at) as latest_closed_at
    from source
  ) shift_meta;

  if v_snapshot is null then
    delete from ops.daily_snapshots
    where cafe_id = p_cafe_id
      and business_date = p_business_date;

    return jsonb_build_object(
      'ok', true,
      'deleted', true,
      'business_date', p_business_date
    );
  end if;

  insert into ops.daily_snapshots (
    cafe_id,
    business_date,
    snapshot_json,
    source_shift_ids,
    closed_shift_count,
    is_finalized,
    finalized_at,
    updated_at
  ) values (
    p_cafe_id,
    p_business_date,
    v_snapshot,
    v_source_shift_ids,
    v_closed_shift_count,
    v_is_finalized,
    v_finalized_at,
    now()
  )
  on conflict (cafe_id, business_date)
  do update set snapshot_json = excluded.snapshot_json,
                source_shift_ids = excluded.source_shift_ids,
                closed_shift_count = excluded.closed_shift_count,
                is_finalized = excluded.is_finalized,
                finalized_at = excluded.finalized_at,
                updated_at = now();

  return v_snapshot;
end;
$$;

create or replace function public.ops_refresh_reporting_chain(
  p_cafe_id uuid,
  p_business_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_day date := p_business_date;
  v_week_start date := date_trunc('week', p_business_date::timestamp)::date;
  v_month_start date := date_trunc('month', p_business_date::timestamp)::date;
  v_year_start date := date_trunc('year', p_business_date::timestamp)::date;
  v_daily jsonb;
  v_weekly jsonb;
  v_monthly jsonb;
  v_yearly jsonb;
begin
  if p_cafe_id is null then
    raise exception 'p_cafe_id is required';
  end if;

  if p_business_date is null then
    raise exception 'p_business_date is required';
  end if;

  v_daily := public.ops_refresh_daily_snapshot(p_cafe_id, v_day);
  v_weekly := public.ops_refresh_weekly_summary(p_cafe_id, v_week_start);
  v_monthly := public.ops_refresh_monthly_summary(p_cafe_id, v_month_start);
  v_yearly := public.ops_refresh_yearly_summary(p_cafe_id, v_year_start);

  return jsonb_build_object(
    'ok', true,
    'business_date', v_day,
    'week_start_date', v_week_start,
    'month_start_date', v_month_start,
    'year_start_date', v_year_start,
    'daily', v_daily,
    'weekly', v_weekly,
    'monthly', v_monthly,
    'yearly', v_yearly
  );
end;
$$;

create or replace function public.ops_assert_runtime_contract(
  p_require_reporting boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_missing text[] := '{}'::text[];
  v_required_reporting boolean := coalesce(p_require_reporting, false);
begin
  if to_regclass('ops.deferred_customer_balances') is null then
    v_missing := array_append(v_missing, 'ops.deferred_customer_balances');
  end if;

  if to_regprocedure('public.ops_deferred_customer_summaries(uuid)') is null then
    v_missing := array_append(v_missing, 'public.ops_deferred_customer_summaries(uuid)');
  end if;

  if v_required_reporting then
    if to_regclass('ops.daily_snapshots') is null then
      v_missing := array_append(v_missing, 'ops.daily_snapshots');
    end if;
    if to_regclass('ops.weekly_summaries') is null then
      v_missing := array_append(v_missing, 'ops.weekly_summaries');
    end if;
    if to_regclass('ops.monthly_summaries') is null then
      v_missing := array_append(v_missing, 'ops.monthly_summaries');
    end if;
    if to_regclass('ops.yearly_summaries') is null then
      v_missing := array_append(v_missing, 'ops.yearly_summaries');
    end if;
    if to_regprocedure('public.ops_refresh_reporting_chain(uuid,date)') is null then
      v_missing := array_append(v_missing, 'public.ops_refresh_reporting_chain(uuid,date)');
    end if;
  end if;

  if coalesce(array_length(v_missing, 1), 0) > 0 then
    raise exception using
      message = 'runtime_reporting_contract_mismatch',
      detail = array_to_string(v_missing, ', ');
  end if;

  return jsonb_build_object(
    'ok', true,
    'reporting_required', v_required_reporting,
    'checked_at', now()
  );
end;
$$;

create or replace function public.ops_close_shift(
  p_cafe_id uuid,
  p_shift_id uuid,
  p_by_owner_id uuid,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_open_sessions integer;
  v_snapshot jsonb;
  v_business_date date;
  v_rollups jsonb;
begin
  if p_by_owner_id is null then
    raise exception 'p_by_owner_id is required';
  end if;

  select count(*)
  into v_open_sessions
  from ops.service_sessions
  where cafe_id = p_cafe_id
    and shift_id = p_shift_id
    and status = 'open';

  if v_open_sessions > 0 then
    raise exception 'Cannot close shift while open service sessions exist';
  end if;

  update ops.shifts
  set status = 'closed',
      closed_at = now(),
      closed_by_owner_id = p_by_owner_id,
      notes = coalesce(p_notes, notes)
  where cafe_id = p_cafe_id
    and id = p_shift_id
    and status = 'open'
  returning business_date into v_business_date;

  if not found then
    raise exception 'shift not found or already closed';
  end if;

  v_snapshot := public.ops_build_shift_snapshot(p_cafe_id, p_shift_id);
  v_rollups := public.ops_refresh_reporting_chain(p_cafe_id, v_business_date);

  return jsonb_build_object(
    'ok', true,
    'shift_id', p_shift_id,
    'status', 'closed',
    'business_date', v_business_date,
    'snapshot', v_snapshot,
    'rollups', v_rollups
  );
end;
$$;

commit;