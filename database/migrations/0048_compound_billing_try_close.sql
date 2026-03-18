begin;

create or replace function public.ops_try_close_service_session(
  p_cafe_id uuid,
  p_service_session_id uuid,
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
  v_session ops.service_sessions%rowtype;
  v_waiting integer := 0;
  v_ready_undelivered integer := 0;
  v_billable integer := 0;
begin
  if (p_by_staff_id is null and p_by_owner_id is null)
     or (p_by_staff_id is not null and p_by_owner_id is not null) then
    raise exception 'Exactly one actor is required';
  end if;

  select *
  into v_session
  from ops.service_sessions
  where cafe_id = p_cafe_id
    and id = p_service_session_id
  for update;

  if not found then
    raise exception 'service_session not found';
  end if;

  select
    coalesce(sum(
      greatest(qty_submitted - least(qty_ready, qty_submitted) - qty_cancelled, 0)
      + greatest(qty_remade - greatest(qty_ready - least(qty_ready, qty_submitted), 0), 0)
    ), 0),
    coalesce(sum(
      greatest(least(qty_ready, qty_total - qty_cancelled) - qty_delivered, 0)
      + greatest(qty_ready - least(qty_ready, qty_total - qty_cancelled) - qty_replacement_delivered, 0)
    ), 0),
    coalesce(sum(greatest(qty_delivered - qty_paid - qty_deferred - qty_waived, 0)), 0)
  into v_waiting, v_ready_undelivered, v_billable
  from ops.order_items
  where cafe_id = p_cafe_id
    and service_session_id = p_service_session_id;

  if v_session.status <> 'open' then
    return jsonb_build_object(
      'ok', true,
      'closed', false,
      'service_session_id', p_service_session_id,
      'status', v_session.status,
      'waiting_qty', v_waiting,
      'ready_undelivered_qty', v_ready_undelivered,
      'billable_qty', v_billable,
      'reason', 'already_closed'
    );
  end if;

  if v_waiting > 0 or v_ready_undelivered > 0 or v_billable > 0 then
    return jsonb_build_object(
      'ok', true,
      'closed', false,
      'service_session_id', p_service_session_id,
      'status', 'open',
      'waiting_qty', v_waiting,
      'ready_undelivered_qty', v_ready_undelivered,
      'billable_qty', v_billable,
      'reason', 'blocked'
    );
  end if;

  update ops.service_sessions
  set status = 'closed',
      closed_at = now(),
      closed_by_staff_id = p_by_staff_id,
      closed_by_owner_id = p_by_owner_id,
      notes = coalesce(p_notes, notes)
  where cafe_id = p_cafe_id
    and id = p_service_session_id;

  update ops.orders
  set status = 'completed'
  where cafe_id = p_cafe_id
    and service_session_id = p_service_session_id
    and status <> 'cancelled';

  return jsonb_build_object(
    'ok', true,
    'closed', true,
    'service_session_id', p_service_session_id,
    'status', 'closed',
    'waiting_qty', 0,
    'ready_undelivered_qty', 0,
    'billable_qty', 0
  );
end;
$$;

create or replace function public.ops_settle_selected_quantities_and_try_close_session(
  p_cafe_id uuid,
  p_shift_id uuid,
  p_service_session_id uuid,
  p_lines jsonb,
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
  v_payment jsonb;
  v_close jsonb;
begin
  v_payment := public.ops_settle_selected_quantities(
    p_cafe_id,
    p_shift_id,
    p_service_session_id,
    p_lines,
    p_by_staff_id,
    p_by_owner_id,
    p_notes
  );

  v_close := public.ops_try_close_service_session(
    p_cafe_id,
    p_service_session_id,
    p_by_staff_id,
    p_by_owner_id,
    p_notes
  );

  return jsonb_build_object(
    'ok', true,
    'payment_id', v_payment ->> 'payment_id',
    'total_quantity', coalesce((v_payment ->> 'total_quantity')::integer, 0),
    'total_amount', coalesce((v_payment ->> 'total_amount')::numeric(12,2), 0),
    'service_session_id', p_service_session_id,
    'session_closed', coalesce((v_close ->> 'closed')::boolean, false),
    'session_status', coalesce(v_close ->> 'status', 'open'),
    'waiting_qty', coalesce((v_close ->> 'waiting_qty')::integer, 0),
    'ready_undelivered_qty', coalesce((v_close ->> 'ready_undelivered_qty')::integer, 0),
    'billable_qty', coalesce((v_close ->> 'billable_qty')::integer, 0)
  );
end;
$$;

create or replace function public.ops_defer_selected_quantities_and_try_close_session(
  p_cafe_id uuid,
  p_shift_id uuid,
  p_service_session_id uuid,
  p_debtor_name text,
  p_lines jsonb,
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
  v_payment jsonb;
  v_close jsonb;
begin
  v_payment := public.ops_defer_selected_quantities(
    p_cafe_id,
    p_shift_id,
    p_service_session_id,
    p_debtor_name,
    p_lines,
    p_by_staff_id,
    p_by_owner_id,
    p_notes
  );

  v_close := public.ops_try_close_service_session(
    p_cafe_id,
    p_service_session_id,
    p_by_staff_id,
    p_by_owner_id,
    p_notes
  );

  return jsonb_build_object(
    'ok', true,
    'payment_id', v_payment ->> 'payment_id',
    'debtor_name', coalesce(v_payment ->> 'debtor_name', p_debtor_name),
    'total_quantity', coalesce((v_payment ->> 'total_quantity')::integer, 0),
    'total_amount', coalesce((v_payment ->> 'total_amount')::numeric(12,2), 0),
    'service_session_id', p_service_session_id,
    'session_closed', coalesce((v_close ->> 'closed')::boolean, false),
    'session_status', coalesce(v_close ->> 'status', 'open'),
    'waiting_qty', coalesce((v_close ->> 'waiting_qty')::integer, 0),
    'ready_undelivered_qty', coalesce((v_close ->> 'ready_undelivered_qty')::integer, 0),
    'billable_qty', coalesce((v_close ->> 'billable_qty')::integer, 0)
  );
end;
$$;

commit;
