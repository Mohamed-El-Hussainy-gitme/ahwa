import { actorRpcParams, callOpsRpc } from '@/app/api/ops/_rpc';
import { jsonError, ok, publishOpsMutation, requireComplaintsAccess, requireOpsActorContext } from '@/app/api/ops/_helpers';

type ResolutionKind = 'resolved' | 'dismissed';

type ResolveComplaintRpcResult = {
  complaint_id?: string;
  resolution_kind?: string | null;
  shift_id?: string;
};

function normalizeResolutionKind(input: unknown): ResolutionKind {
  switch (input) {
    case 'resolved':
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
      notes?: string;
    };

    const complaintId = String(body.complaintId ?? '').trim();
    const resolutionKind = normalizeResolutionKind(body.resolutionKind);
    const notes = body.notes ? String(body.notes).trim() : undefined;

    if (!complaintId) {
      throw new Error('INVALID_INPUT');
    }

    const ctx = requireComplaintsAccess(await requireOpsActorContext());
    const resolved = await callOpsRpc<ResolveComplaintRpcResult>('ops_resolve_complaint', {
      p_cafe_id: ctx.cafeId,
      p_complaint_id: complaintId,
      p_resolution_kind: resolutionKind,
      p_quantity: null,
      p_notes: notes ?? null,
      ...actorRpcParams(ctx, 'p_by_staff_id', 'p_by_owner_id'),
    }, ctx.databaseKey);

    publishOpsMutation(ctx, {
      type: 'complaint.updated',
      entityId: complaintId,
      shiftId: resolved.shift_id ? String(resolved.shift_id) : ctx.shiftId,
      data: {
        status: resolutionKind === 'dismissed' ? 'dismissed' : 'resolved',
        resolutionKind: resolutionKind === 'resolved' ? null : 'dismissed',
      },
    });

    return ok({ ok: true });
  } catch (e) {
    return jsonError(e, 400);
  }
}
