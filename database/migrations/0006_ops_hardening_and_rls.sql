begin;

create schema if not exists app;

create or replace function app.current_cafe_id()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      current_setting('app.current_cafe_id', true),
      current_setting('app.current_tenant_id', true)
    ),
    ''
  )::uuid
$$;

create or replace function app.current_super_admin_user_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('platform.current_super_admin_user_id', true), '')::uuid
$$;

create or replace function app.has_platform_support_access(
  p_cafe_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, ops, platform, app
as $$
  select exists (
    select 1
    from platform.support_access_grants g
    where g.super_admin_user_id = app.current_super_admin_user_id()
      and g.cafe_id = p_cafe_id
      and g.is_active = true
      and g.revoked_at is null
      and (g.expires_at is null or g.expires_at > now())
  )
$$;

create or replace function app.can_access_cafe(
  p_cafe_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, ops, platform, app
as $$
  select p_cafe_id is not null
    and (
      app.current_cafe_id() = p_cafe_id
      or app.has_platform_support_access(p_cafe_id)
    )
$$;

do $$
declare
  v_table text;
begin
  execute 'alter table ops.cafes enable row level security';
  execute 'drop policy if exists cafe_access_policy on ops.cafes';
  execute 'create policy cafe_access_policy on ops.cafes for all using (app.can_access_cafe(id)) with check (app.can_access_cafe(id))';

  for v_table in
    select unnest(array[
      'owner_users',
      'staff_members',
      'menu_sections',
      'menu_products',
      'shifts',
      'shift_role_assignments',
      'service_sessions',
      'orders',
      'order_items',
      'fulfillment_events',
      'payments',
      'payment_allocations',
      'deferred_ledger_entries',
      'shift_snapshots',
      'audit_events'
    ])
  loop
    execute format('alter table ops.%I enable row level security', v_table);
    execute format('drop policy if exists cafe_access_policy on ops.%I', v_table);
    execute format(
      'create policy cafe_access_policy on ops.%I for all using (app.can_access_cafe(cafe_id)) with check (app.can_access_cafe(cafe_id))',
      v_table
    );
  end loop;

  execute 'alter table platform.super_admin_users enable row level security';
  execute 'drop policy if exists super_admin_self_access on platform.super_admin_users';
  execute 'create policy super_admin_self_access on platform.super_admin_users for all using (id = app.current_super_admin_user_id()) with check (id = app.current_super_admin_user_id())';

  execute 'alter table platform.support_access_grants enable row level security';
  execute 'drop policy if exists super_admin_support_access on platform.support_access_grants';
  execute 'create policy super_admin_support_access on platform.support_access_grants for all using (super_admin_user_id = app.current_super_admin_user_id()) with check (super_admin_user_id = app.current_super_admin_user_id())';
end;
$$;

create unique index if not exists uq_shift_role_active_singleton
  on ops.shift_role_assignments(cafe_id, shift_id, role_code)
  where is_active = true
    and role_code in ('supervisor', 'barista', 'shisha');

create unique index if not exists uq_shift_role_active_staff_actor
  on ops.shift_role_assignments(cafe_id, shift_id, role_code, staff_member_id)
  where is_active = true
    and staff_member_id is not null;

create unique index if not exists uq_shift_role_active_owner_actor
  on ops.shift_role_assignments(cafe_id, shift_id, role_code, owner_user_id)
  where is_active = true
    and owner_user_id is not null;

create or replace function public.ops_assign_shift_role(
  p_cafe_id uuid,
  p_shift_id uuid,
  p_role_code text,
  p_staff_member_id uuid default null,
  p_owner_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_assignment_id uuid;
  v_existing_id uuid;
begin
  if p_cafe_id is null then
    raise exception 'cafe_id_required';
  end if;

  if p_shift_id is null then
    raise exception 'shift_id_required';
  end if;

  if p_role_code not in ('supervisor', 'waiter', 'barista', 'shisha') then
    raise exception 'invalid_role_code';
  end if;

  if (p_staff_member_id is null and p_owner_user_id is null)
     or (p_staff_member_id is not null and p_owner_user_id is not null) then
    raise exception 'exactly_one_actor_required';
  end if;

  select sra.id
  into v_existing_id
  from ops.shift_role_assignments sra
  where sra.cafe_id = p_cafe_id
    and sra.shift_id = p_shift_id
    and sra.role_code = p_role_code
    and sra.is_active = true
    and sra.staff_member_id is not distinct from p_staff_member_id
    and sra.owner_user_id is not distinct from p_owner_user_id
  limit 1;

  if v_existing_id is not null then
    return jsonb_build_object(
      'assignment_id', v_existing_id,
      'role_code', p_role_code,
      'reused', true
    );
  end if;

  if p_role_code in ('supervisor', 'barista', 'shisha') then
    update ops.shift_role_assignments
    set is_active = false
    where cafe_id = p_cafe_id
      and shift_id = p_shift_id
      and role_code = p_role_code
      and is_active = true;
  end if;

  insert into ops.shift_role_assignments (
    cafe_id,
    shift_id,
    role_code,
    staff_member_id,
    owner_user_id,
    is_active
  )
  values (
    p_cafe_id,
    p_shift_id,
    p_role_code,
    p_staff_member_id,
    p_owner_user_id,
    true
  )
  returning id into v_assignment_id;

  return jsonb_build_object(
    'assignment_id', v_assignment_id,
    'role_code', p_role_code,
    'reused', false
  );
end;
$$;

alter table ops.service_sessions
  drop constraint if exists ck_service_sessions_session_label_nonempty;

alter table ops.service_sessions
  add constraint ck_service_sessions_session_label_nonempty
  check (nullif(btrim(session_label), '') is not null);

create unique index if not exists uq_service_sessions_open_label
  on ops.service_sessions(cafe_id, shift_id, lower(btrim(session_label)))
  where status = 'open';

create or replace function public.ops_open_or_resume_service_session(
  p_cafe_id uuid,
  p_shift_id uuid,
  p_session_label text default null,
  p_staff_member_id uuid default null,
  p_owner_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_session_id uuid;
  v_effective_label text;
  v_norm_label text;
begin
  if p_cafe_id is null then
    raise exception 'cafe_id_required';
  end if;

  if p_shift_id is null then
    raise exception 'shift_id_required';
  end if;

  if (p_staff_member_id is null and p_owner_user_id is null)
     or (p_staff_member_id is not null and p_owner_user_id is not null) then
    raise exception 'exactly_one_actor_required';
  end if;

  v_effective_label := nullif(btrim(coalesce(p_session_label, '')), '');

  if v_effective_label is not null then
    v_norm_label := lower(v_effective_label);

    select s.id, s.session_label
    into v_session_id, v_effective_label
    from ops.service_sessions s
    where s.cafe_id = p_cafe_id
      and s.shift_id = p_shift_id
      and s.status = 'open'
      and lower(btrim(s.session_label)) = v_norm_label
    order by s.opened_at desc
    limit 1;

    if v_session_id is not null then
      return jsonb_build_object(
        'service_session_id', v_session_id,
        'session_label', v_effective_label,
        'reused', true
      );
    end if;
  end if;

  begin
    insert into ops.service_sessions (
      cafe_id,
      shift_id,
      session_label,
      status,
      opened_by_staff_id,
      opened_by_owner_id
    )
    values (
      p_cafe_id,
      p_shift_id,
      coalesce(v_effective_label, ops.generate_session_label()),
      'open',
      p_staff_member_id,
      p_owner_user_id
    )
    returning id, session_label into v_session_id, v_effective_label;
  exception
    when unique_violation then
      if v_effective_label is null then
        raise;
      end if;

      select s.id, s.session_label
      into v_session_id, v_effective_label
      from ops.service_sessions s
      where s.cafe_id = p_cafe_id
        and s.shift_id = p_shift_id
        and s.status = 'open'
        and lower(btrim(s.session_label)) = lower(v_effective_label)
      order by s.opened_at desc
      limit 1;

      if v_session_id is null then
        raise;
      end if;

      return jsonb_build_object(
        'service_session_id', v_session_id,
        'session_label', v_effective_label,
        'reused', true
      );
  end;

  return jsonb_build_object(
    'service_session_id', v_session_id,
    'session_label', v_effective_label,
    'reused', false
  );
end;
$$;

create or replace function public.ops_record_repayment(
  p_cafe_id uuid,
  p_shift_id uuid,
  p_debtor_name text,
  p_amount numeric,
  p_by_staff_id uuid default null,
  p_by_owner_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_payment_id uuid;
  v_name text;
  v_balance_before numeric(12,2);
  v_balance_after numeric(12,2);
begin
  if p_cafe_id is null then
    raise exception 'p_cafe_id is required';
  end if;

  if p_shift_id is null then
    raise exception 'p_shift_id is required';
  end if;

  v_name := nullif(btrim(p_debtor_name), '');

  if v_name is null then
    raise exception 'p_debtor_name is required';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'p_amount must be greater than zero';
  end if;

  if (p_by_staff_id is null and p_by_owner_id is null)
     or (p_by_staff_id is not null and p_by_owner_id is not null) then
    raise exception 'Exactly one actor is required';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_cafe_id::text), hashtext(lower(v_name)));

  select coalesce(sum(
    case entry_kind
      when 'debt' then amount
      when 'repayment' then -amount
      else 0
    end
  ), 0)::numeric(12,2)
  into v_balance_before
  from ops.deferred_ledger_entries
  where cafe_id = p_cafe_id
    and debtor_name = v_name;

  if v_balance_before <= 0 then
    raise exception 'no_outstanding_deferred_balance';
  end if;

  if p_amount > v_balance_before then
    raise exception 'repayment_exceeds_deferred_balance';
  end if;

  insert into ops.payments (
    cafe_id,
    shift_id,
    service_session_id,
    payment_kind,
    total_amount,
    debtor_name,
    notes,
    by_staff_id,
    by_owner_id
  )
  values (
    p_cafe_id,
    p_shift_id,
    null,
    'repayment',
    p_amount,
    v_name,
    p_notes,
    p_by_staff_id,
    p_by_owner_id
  )
  returning id into v_payment_id;

  insert into ops.deferred_ledger_entries (
    cafe_id,
    service_session_id,
    payment_id,
    debtor_name,
    entry_kind,
    amount,
    notes,
    by_staff_id,
    by_owner_id
  )
  values (
    p_cafe_id,
    null,
    v_payment_id,
    v_name,
    'repayment',
    p_amount,
    p_notes,
    p_by_staff_id,
    p_by_owner_id
  );

  v_balance_after := (v_balance_before - p_amount)::numeric(12,2);

  return jsonb_build_object(
    'ok', true,
    'payment_id', v_payment_id,
    'debtor_name', v_name,
    'repayment_amount', p_amount,
    'balance_before', v_balance_before,
    'balance_after', v_balance_after
  );
end;
$$;

create or replace function public.ops_build_shift_snapshot(
  p_cafe_id uuid,
  p_shift_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_shift ops.shifts%rowtype;
  v_snapshot jsonb;
  v_totals jsonb;
  v_products jsonb;
  v_staff jsonb;
  v_sessions jsonb;
begin
  select *
  into v_shift
  from ops.shifts
  where cafe_id = p_cafe_id
    and id = p_shift_id;

  if not found then
    raise exception 'shift not found';
  end if;

  with item_totals as (
    select
      coalesce(sum(oi.qty_submitted), 0) as submitted_qty,
      coalesce(sum(oi.qty_ready), 0) as ready_qty,
      coalesce(sum(oi.qty_delivered), 0) as delivered_qty,
      coalesce(sum(oi.qty_replacement_delivered), 0) as replacement_delivered_qty,
      coalesce(sum(oi.qty_paid), 0) as paid_qty,
      coalesce(sum(oi.qty_deferred), 0) as deferred_qty,
      coalesce(sum(oi.qty_remade), 0) as remade_qty,
      coalesce(sum(oi.qty_cancelled), 0) as cancelled_qty
    from ops.order_items oi
    where oi.cafe_id = p_cafe_id
      and oi.shift_id = p_shift_id
  ),
  payment_totals as (
    select
      coalesce(sum(case when p.payment_kind = 'cash' then p.total_amount else 0 end), 0)::numeric(12,2) as cash_total,
      coalesce(sum(case when p.payment_kind = 'deferred' then p.total_amount else 0 end), 0)::numeric(12,2) as deferred_total,
      coalesce(sum(case when p.payment_kind = 'repayment' then p.total_amount else 0 end), 0)::numeric(12,2) as repayment_total
    from ops.payments p
    where p.cafe_id = p_cafe_id
      and p.shift_id = p_shift_id
  )
  select jsonb_build_object(
    'submitted_qty', it.submitted_qty,
    'ready_qty', it.ready_qty,
    'delivered_qty', it.delivered_qty,
    'replacement_delivered_qty', it.replacement_delivered_qty,
    'paid_qty', it.paid_qty,
    'deferred_qty', it.deferred_qty,
    'remade_qty', it.remade_qty,
    'cancelled_qty', it.cancelled_qty,
    'cash_total', pt.cash_total,
    'deferred_total', pt.deferred_total,
    'repayment_total', pt.repayment_total
  )
  into v_totals
  from item_totals it
  cross join payment_totals pt;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.product_name), '[]'::jsonb)
  into v_products
  from (
    select
      mp.product_name,
      oi.station_code,
      sum(oi.qty_submitted) as qty_submitted,
      sum(oi.qty_delivered) as qty_delivered,
      sum(oi.qty_paid) as qty_paid,
      sum(oi.qty_deferred) as qty_deferred,
      sum(oi.qty_remade) as qty_remade,
      sum((oi.qty_paid + oi.qty_deferred) * oi.unit_price)::numeric(12,2) as billed_amount
    from ops.order_items oi
    join ops.menu_products mp
      on mp.id = oi.menu_product_id
     and mp.cafe_id = oi.cafe_id
    where oi.cafe_id = p_cafe_id
      and oi.shift_id = p_shift_id
    group by mp.product_name, oi.station_code
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.actor_label), '[]'::jsonb)
  into v_staff
  from (
    select
      actor_label,
      sum(submitted_qty) as submitted_qty,
      sum(ready_qty) as ready_qty,
      sum(delivered_qty) as delivered_qty,
      sum(payment_total)::numeric(12,2) as payment_total
    from (
      select
        sm.full_name as actor_label,
        0::bigint as submitted_qty,
        0::bigint as ready_qty,
        0::bigint as delivered_qty,
        coalesce(sum(p.total_amount), 0)::numeric(12,2) as payment_total
      from ops.payments p
      join ops.staff_members sm
        on sm.id = p.by_staff_id
       and sm.cafe_id = p.cafe_id
      where p.cafe_id = p_cafe_id
        and p.shift_id = p_shift_id
      group by sm.full_name

      union all

      select
        ou.full_name as actor_label,
        0::bigint,
        0::bigint,
        0::bigint,
        coalesce(sum(p.total_amount), 0)::numeric(12,2)
      from ops.payments p
      join ops.owner_users ou
        on ou.id = p.by_owner_id
       and ou.cafe_id = p.cafe_id
      where p.cafe_id = p_cafe_id
        and p.shift_id = p_shift_id
      group by ou.full_name

      union all

      select
        sm.full_name as actor_label,
        coalesce(sum(case when fe.event_code in ('submitted', 'remake_submitted') then fe.quantity else 0 end), 0)::bigint,
        coalesce(sum(case when fe.event_code in ('partial_ready', 'ready') then fe.quantity else 0 end), 0)::bigint,
        coalesce(sum(case when fe.event_code in ('delivered', 'remake_delivered') then fe.quantity else 0 end), 0)::bigint,
        0::numeric(12,2)
      from ops.fulfillment_events fe
      join ops.staff_members sm
        on sm.id = fe.by_staff_id
       and sm.cafe_id = fe.cafe_id
      where fe.cafe_id = p_cafe_id
        and fe.shift_id = p_shift_id
      group by sm.full_name

      union all

      select
        ou.full_name as actor_label,
        coalesce(sum(case when fe.event_code in ('submitted', 'remake_submitted') then fe.quantity else 0 end), 0)::bigint,
        coalesce(sum(case when fe.event_code in ('partial_ready', 'ready') then fe.quantity else 0 end), 0)::bigint,
        coalesce(sum(case when fe.event_code in ('delivered', 'remake_delivered') then fe.quantity else 0 end), 0)::bigint,
        0::numeric(12,2)
      from ops.fulfillment_events fe
      join ops.owner_users ou
        on ou.id = fe.by_owner_id
       and ou.cafe_id = fe.cafe_id
      where fe.cafe_id = p_cafe_id
        and fe.shift_id = p_shift_id
      group by ou.full_name
    ) raw
    group by actor_label
  ) x;

  select jsonb_build_object(
    'open_sessions', coalesce(sum(case when status = 'open' then 1 else 0 end), 0),
    'closed_sessions', coalesce(sum(case when status = 'closed' then 1 else 0 end), 0)
  )
  into v_sessions
  from ops.service_sessions
  where cafe_id = p_cafe_id
    and shift_id = p_shift_id;

  v_snapshot := jsonb_build_object(
    'shift', jsonb_build_object(
      'shift_id', v_shift.id,
      'shift_kind', v_shift.shift_kind,
      'business_date', v_shift.business_date,
      'status', v_shift.status,
      'opened_at', v_shift.opened_at,
      'closed_at', v_shift.closed_at
    ),
    'totals', coalesce(v_totals, '{}'::jsonb),
    'sessions', coalesce(v_sessions, '{}'::jsonb),
    'products', coalesce(v_products, '[]'::jsonb),
    'staff', coalesce(v_staff, '[]'::jsonb)
  );

  insert into ops.shift_snapshots (
    cafe_id,
    shift_id,
    snapshot_json
  )
  values (
    p_cafe_id,
    p_shift_id,
    v_snapshot
  )
  on conflict (cafe_id, shift_id)
  do update set snapshot_json = excluded.snapshot_json,
                created_at = now();

  return v_snapshot;
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
    and status = 'open';

  if not found then
    raise exception 'shift not found or already closed';
  end if;

  v_snapshot := public.ops_build_shift_snapshot(p_cafe_id, p_shift_id);

  return jsonb_build_object(
    'ok', true,
    'shift_id', p_shift_id,
    'status', 'closed',
    'snapshot', v_snapshot
  );
end;
$$;

commit;
