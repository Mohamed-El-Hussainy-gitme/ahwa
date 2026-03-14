import { actorRpcParams, callOpsRpc, loadOrderItemMutationContext } from '@/app/api/ops/_rpc';
import { jsonError, ok, publishOpsMutation, requireOpsActorContext } from '@/app/api/ops/_helpers';

type ComplaintKind = 'quality_issue' | 'wrong_item' | 'delay' | 'billing_issue' | 'other';
type ComplaintAction = 'none' | 'remake' | 'cancel_undelivered' | 'waive_delivered';

type CreateComplaintRpcResult = {
  complaint_id?: string;
  shift_id?: string;
  service_session_id?: string;
  order_item_id?: string | null;
};

type ResolveComplaintRpcResult = {
  complaint_id?: string;
  resolution_kind?: string;
  resolved_quantity?: number;
  order_item_id?: string | null;
  shift_id?: string;
  service_session_id?: string;
};

function normalizeComplaintKind(input: unknown): ComplaintKind {
  switch (input) {
    case 'quality_issue':
    case 'wrong_item':
    case 'delay':
    case 'billing_issue':
    case 'other':
      return input;
    default:
      return 'other';
  }
}

function normalizeAction(input: unknown): ComplaintAction {
  switch (input) {
    case 'remake':
    case 'cancel_undelivered':
    case 'waive_delivered':
      return input;
    default:
      return 'none';
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      serviceSessionId?: string;
      orderItemId?: string;
      complaintKind?: ComplaintKind;
      quantity?: number;
      notes?: string;
      action?: ComplaintAction;
    };

    const serviceSessionId = body.serviceSessionId ? String(body.serviceSessionId).trim() : '';
    const orderItemId = body.orderItemId ? String(body.orderItemId).trim() : '';
    const quantity = body.quantity == null ? undefined : Number(body.quantity);
    const notes = body.notes ? String(body.notes).trim() : undefined;
    const complaintKind = normalizeComplaintKind(body.complaintKind);
    const action = normalizeAction(body.action);

    if (!serviceSessionId && !orderItemId) {
      throw new Error('INVALID_INPUT');
    }
    if (quantity != null && (!Number.isInteger(quantity) || quantity <= 0)) {
      throw new Error('INVALID_INPUT');
    }

    const ctx = await requireOpsActorContext();
    const created = await callOpsRpc<CreateComplaintRpcResult>('ops_create_complaint', {
      p_cafe_id: ctx.cafeId,
      p_service_session_id: serviceSessionId || null,
      p_order_item_id: orderItemId || null,
      p_complaint_kind: complaintKind,
      p_requested_quantity: quantity ?? null,
      p_notes: notes ?? null,
      ...actorRpcParams(ctx, 'p_by_staff_id', 'p_by_owner_id'),
    });

    const complaintId = String(created.complaint_id ?? '').trim();
    if (!complaintId) {
      throw new Error('CREATE_COMPLAINT_FAILED');
    }

    publishOpsMutation(ctx, {
      type: 'complaint.created',
      entityId: complaintId,
      shiftId: created.shift_id ? String(created.shift_id) : ctx.shiftId,
      data: {
        orderItemId: created.order_item_id ? String(created.order_item_id) : null,
        serviceSessionId: created.service_session_id ? String(created.service_session_id) : serviceSessionId || null,
        complaintKind,
        quantity: quantity ?? null,
        action,
      },
    });

    if (action === 'none') {
      return ok({ ok: true, complaintId });
    }

    const resolved = await callOpsRpc<ResolveComplaintRpcResult>('ops_resolve_complaint', {
      p_cafe_id: ctx.cafeId,
      p_complaint_id: complaintId,
      p_resolution_kind: action,
      p_quantity: quantity ?? null,
      p_notes: notes ?? null,
      ...actorRpcParams(ctx, 'p_by_staff_id', 'p_by_owner_id'),
    });

    const effectiveOrderItemId = resolved.order_item_id ? String(resolved.order_item_id) : orderItemId || null;
    const resolvedQuantity = Number(resolved.resolved_quantity ?? quantity ?? 0);
    const resolvedShiftId = resolved.shift_id ? String(resolved.shift_id) : created.shift_id ? String(created.shift_id) : ctx.shiftId;

    publishOpsMutation(ctx, {
      type: 'complaint.updated',
      entityId: complaintId,
      shiftId: resolvedShiftId,
      data: {
        status: 'resolved',
        resolutionKind: action,
        quantity: resolvedQuantity,
        orderItemId: effectiveOrderItemId,
      },
    });

    if (effectiveOrderItemId) {
      const item = await loadOrderItemMutationContext(ctx.cafeId, effectiveOrderItemId);
      const eventType = action === 'remake'
        ? 'station.remake_requested'
        : action === 'cancel_undelivered'
          ? 'station.cancelled'
          : 'billing.waived';

      publishOpsMutation(ctx, {
        type: eventType,
        entityId: item.id,
        shiftId: item.shiftId,
        data: {
          quantity: resolvedQuantity,
          serviceSessionId: item.serviceSessionId,
          stationCode: item.stationCode,
          complaintId,
        },
      });
    }

    return ok({ ok: true, complaintId });
  } catch (e) {
    return jsonError(e, 400);
  }
}
