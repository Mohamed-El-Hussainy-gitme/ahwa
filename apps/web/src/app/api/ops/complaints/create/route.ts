import { actorRpcParams, callOpsRpc, loadOrderItemMutationContext } from '@/app/api/ops/_rpc';
import {
  jsonError,
  ok,
  publishOpsMutation,
  requireComplaintActionAccess,
  requireComplaintItemAccess,
  requireComplaintLogAccess,
  requireOpsActorContext,
} from '@/app/api/ops/_helpers';

type ComplaintKind = 'quality_issue' | 'wrong_item' | 'delay' | 'billing_issue' | 'other';
type ComplaintAction = 'none' | 'remake' | 'cancel_undelivered' | 'waive_delivered';
type ComplaintMode = 'general' | 'item';

type CreateComplaintRpcResult = {
  complaint_id?: string;
  shift_id?: string;
  service_session_id?: string;
  order_item_id?: string | null;
};

type CreateItemIssueRpcResult = {
  item_issue_id?: string;
  shift_id?: string;
  service_session_id?: string;
  order_item_id?: string | null;
  action_kind?: string | null;
  status?: string | null;
  resolved_quantity?: number | null;
};

function normalizeComplaintKind(input: unknown): ComplaintKind {
  switch (input) {
    case 'quality_issue':
    case 'wrong_item':
    case 'delay':
    case 'billing_issue':
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

function normalizeMode(input: unknown, orderItemId: string): ComplaintMode {
  if (input === 'general') return 'general';
  if (input === 'item') return 'item';
  return orderItemId ? 'item' : 'general';
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      mode?: ComplaintMode;
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
    const mode = normalizeMode(body.mode, orderItemId);

    if (!serviceSessionId && !orderItemId) {
      throw new Error('INVALID_INPUT');
    }
    if (quantity != null && (!Number.isInteger(quantity) || quantity <= 0)) {
      throw new Error('INVALID_INPUT');
    }

    const ctx = await requireOpsActorContext();

    if (mode === 'general' && !orderItemId) {
      requireComplaintLogAccess(ctx);
      const created = await callOpsRpc<CreateComplaintRpcResult>('ops_create_complaint', {
        p_cafe_id: ctx.cafeId,
        p_service_session_id: serviceSessionId || null,
        p_order_item_id: null,
        p_complaint_kind: complaintKind,
        p_requested_quantity: quantity ?? null,
        p_notes: notes ?? null,
        ...actorRpcParams(ctx, 'p_by_staff_id', 'p_by_owner_id'),
      }, ctx.databaseKey);

      const complaintId = String(created.complaint_id ?? '').trim();
      if (!complaintId) {
        throw new Error('CREATE_COMPLAINT_FAILED');
      }

      publishOpsMutation(ctx, {
        type: 'complaint.created',
        entityId: complaintId,
        shiftId: created.shift_id ? String(created.shift_id) : ctx.shiftId,
        data: {
          orderItemId: null,
          serviceSessionId: created.service_session_id ? String(created.service_session_id) : serviceSessionId || null,
          complaintKind,
          quantity: quantity ?? null,
          mode: 'general',
        },
      });

      return ok({ ok: true, complaintId });
    }

    const item = await loadOrderItemMutationContext(ctx.cafeId, orderItemId, ctx.databaseKey);
    requireComplaintItemAccess(ctx, item.stationCode as 'barista' | 'shisha' | 'service' | null, action);
    if (action !== 'none') {
      requireComplaintActionAccess(ctx, item.stationCode as 'barista' | 'shisha' | 'service' | null);
    }

    const created = await callOpsRpc<CreateItemIssueRpcResult>('ops_log_order_item_issue', {
      p_cafe_id: ctx.cafeId,
      p_service_session_id: serviceSessionId || null,
      p_order_item_id: orderItemId || null,
      p_issue_kind: complaintKind,
      p_action_kind: action === 'none' ? 'note' : action,
      p_requested_quantity: quantity ?? null,
      p_notes: notes ?? null,
      ...actorRpcParams(ctx, 'p_by_staff_id', 'p_by_owner_id'),
    }, ctx.databaseKey);

    const itemIssueId = String(created.item_issue_id ?? '').trim();
    if (!itemIssueId) {
      throw new Error('CREATE_ITEM_ISSUE_FAILED');
    }

    const effectiveOrderItemId = created.order_item_id ? String(created.order_item_id) : orderItemId || null;
    publishOpsMutation(ctx, {
      type: 'item_issue.created',
      entityId: itemIssueId,
      shiftId: created.shift_id ? String(created.shift_id) : ctx.shiftId,
      data: {
        orderItemId: effectiveOrderItemId,
        serviceSessionId: created.service_session_id ? String(created.service_session_id) : serviceSessionId || null,
        complaintKind,
        quantity: quantity ?? null,
        action: action === 'none' ? 'note' : action,
        status: created.status ? String(created.status) : 'logged',
      },
    });

    if (effectiveOrderItemId && action !== 'none') {
      const resolvedQuantity = Number(created.resolved_quantity ?? quantity ?? 0);
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
          itemIssueId,
        },
      });
    }

    return ok({ ok: true, itemIssueId });
  } catch (e) {
    return jsonError(e, 400);
  }
}
