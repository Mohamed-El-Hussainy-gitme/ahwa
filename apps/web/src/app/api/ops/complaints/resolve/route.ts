import { callOpsRpc, loadOrderItemMutationContext, actorRpcParams } from '@/app/api/ops/_rpc';
import { jsonError, ok, publishOpsMutation, requireOpsActorContext } from '@/app/api/ops/_helpers';

type ResolutionKind = 'remake' | 'cancel_undelivered' | 'waive_delivered' | 'dismissed';

type ResolveComplaintRpcResult = {
  complaint_id?: string;
  resolution_kind?: string;
  resolved_quantity?: number;
  order_item_id?: string | null;
  shift_id?: string;
};

function normalizeResolutionKind(input: unknown): ResolutionKind {
  switch (input) {
    case 'remake':
    case 'cancel_undelivered':
    case 'waive_delivered':
    case 'dismissed':
      return input;
    default:
      throw new Error('INVALID_INPUT');
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      complaintId?: string;
      resolutionKind?: ResolutionKind;
      quantity?: number;
      notes?: string;
    };

    const complaintId = String(body.complaintId ?? '').trim();
    const resolutionKind = normalizeResolutionKind(body.resolutionKind);
    const quantity = body.quantity == null ? undefined : Number(body.quantity);
    const notes = body.notes ? String(body.notes).trim() : undefined;

    if (!complaintId || (quantity != null && (!Number.isInteger(quantity) || quantity <= 0))) {
      throw new Error('INVALID_INPUT');
    }

    const ctx = await requireOpsActorContext();
    const resolved = await callOpsRpc<ResolveComplaintRpcResult>('ops_resolve_complaint', {
      p_cafe_id: ctx.cafeId,
      p_complaint_id: complaintId,
      p_resolution_kind: resolutionKind,
      p_quantity: quantity ?? null,
      p_notes: notes ?? null,
      ...actorRpcParams(ctx, 'p_by_staff_id', 'p_by_owner_id'),
    });

    const resolvedQuantity = Number(resolved.resolved_quantity ?? quantity ?? 0);
    publishOpsMutation(ctx, {
      type: 'complaint.updated',
      entityId: complaintId,
      shiftId: resolved.shift_id ? String(resolved.shift_id) : ctx.shiftId,
      data: {
        status: resolutionKind === 'dismissed' ? 'dismissed' : 'resolved',
        resolutionKind,
        quantity: resolvedQuantity || null,
        orderItemId: resolved.order_item_id ? String(resolved.order_item_id) : null,
      },
    });

    if (resolutionKind !== 'dismissed' && resolved.order_item_id) {
      const item = await loadOrderItemMutationContext(ctx.cafeId, String(resolved.order_item_id));
      const eventType = resolutionKind === 'remake'
        ? 'station.remake_requested'
        : resolutionKind === 'cancel_undelivered'
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

    return ok({ ok: true });
  } catch (e) {
    return jsonError(e, 400);
  }
}
