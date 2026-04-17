import { actorRpcParams, callOpsRpc } from '@/app/api/ops/_rpc';
import { enqueueOpsMutation, jsonError, kickOpsOutboxDispatch, ok, requireComplaintManagementAccess, requireOpsActorContext } from '@/app/api/ops/_helpers';

type ItemIssueStatus = 'applied' | 'verified' | 'dismissed';

type UpdateItemIssueRpcResult = {
  item_issue_id?: string;
  shift_id?: string;
  status?: string | null;
};

function normalizeStatus(input: unknown): ItemIssueStatus {
  switch (input) {
    case 'applied':
    case 'verified':
    case 'dismissed':
      return input;
    default:
      throw new Error('INVALID_INPUT');
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      itemIssueId?: string;
      status?: ItemIssueStatus;
      notes?: string;
    };

    const itemIssueId = String(body.itemIssueId ?? '').trim();
    const status = normalizeStatus(body.status);
    const notes = body.notes ? String(body.notes).trim() : undefined;
    if (!itemIssueId) throw new Error('INVALID_INPUT');

    const ctx = requireComplaintManagementAccess(await requireOpsActorContext());
    const updated = await callOpsRpc<UpdateItemIssueRpcResult>('ops_update_order_item_issue_status', {
      p_cafe_id: ctx.cafeId,
      p_item_issue_id: itemIssueId,
      p_status: status,
      p_notes: notes ?? null,
      ...actorRpcParams(ctx, 'p_by_staff_id', 'p_by_owner_id'),
    }, ctx.databaseKey);

    await enqueueOpsMutation(ctx, {
      type: 'item_issue.updated',
      entityId: itemIssueId,
      shiftId: updated.shift_id ? String(updated.shift_id) : ctx.shiftId,
      data: { status },
    });
    kickOpsOutboxDispatch(ctx);

    return ok({ ok: true });
  } catch (e) {
    return jsonError(e, 400);
  }
}
