import { actorRpcParams, callOpsRpc } from '@/app/api/ops/_rpc';
import { jsonError, ok, publishOpsMutation, requireOpsActorContext } from '@/app/api/ops/_helpers';

type CloseSessionRpcResult = {
  ok?: boolean;
  service_session_id?: string;
  status?: string;
};

export async function POST(req: Request) {
  try {
    const { serviceSessionId } = (await req.json()) as { serviceSessionId?: string };
    const normalizedServiceSessionId = String(serviceSessionId ?? '').trim();
    if (!normalizedServiceSessionId) throw new Error('INVALID_INPUT');

    const ctx = await requireOpsActorContext();
    const rpc = await callOpsRpc<CloseSessionRpcResult>('ops_close_service_session', {
      p_cafe_id: ctx.cafeId,
      p_service_session_id: normalizedServiceSessionId,
      ...actorRpcParams(ctx, 'p_by_staff_id', 'p_by_owner_id'),
    });

    if (!rpc.ok) {
      throw new Error('SESSION_CLOSE_FAILED');
    }

    publishOpsMutation(ctx, {
      type: 'session.closed',
      entityId: normalizedServiceSessionId,
    });

    return ok({ ok: true });
  } catch (e) {
    return jsonError(e, 400);
  }
}
