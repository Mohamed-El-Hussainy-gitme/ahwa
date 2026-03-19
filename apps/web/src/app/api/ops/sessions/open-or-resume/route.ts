import { callOpsRpc, actorRpcParams } from '@/app/api/ops/_rpc';
import { jsonError, ok, kickOpsOutboxDispatch, requireOpenOpsShift, requireOpsActorContext, requireSessionOrderAccess } from '@/app/api/ops/_helpers';

type OpenOrResumeSessionRpcResult = {
  service_session_id?: string;
  session_label?: string;
  reused?: boolean;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { label?: string };
    const ctx = requireSessionOrderAccess(await requireOpsActorContext());
    const shift = await requireOpenOpsShift(ctx.cafeId, ctx.databaseKey);
    const label = String(body.label ?? '').trim();

    const rpc = await callOpsRpc<OpenOrResumeSessionRpcResult>('ops_open_or_resume_service_session_with_outbox', {
      p_cafe_id: ctx.cafeId,
      p_shift_id: shift.id,
      p_session_label: label || null,
      ...actorRpcParams(ctx, 'p_staff_member_id', 'p_owner_user_id'),
    }, ctx.databaseKey);

    const sessionId = String(rpc.service_session_id ?? '').trim();
    const sessionLabel = String(rpc.session_label ?? '').trim();
    if (!sessionId || !sessionLabel) {
      throw new Error('INVALID_RPC_RESPONSE:ops_open_or_resume_service_session');
    }

    kickOpsOutboxDispatch(ctx);

    return ok({ sessionId, label: sessionLabel });
  } catch (e) {
    return jsonError(e, 400);
  }
}
