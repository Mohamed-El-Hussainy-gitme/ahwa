import { actorRpcParams, callOpsRpc } from '@/app/api/ops/_rpc';
import {
  beginIdempotentMutation,
  type BegunIdempotentMutation,
  completeIdempotentMutation,
  jsonError,
  ok,
  publishOpsMutation,
  kickOpsOutboxDispatch,
  releaseIdempotentMutation,
  requireBillingAccess,
  requireOpsActorContext,
} from '@/app/api/ops/_helpers';
import { resolveBillingContext } from '@/app/api/ops/_billing';

type SettleAllocationInput = {
  orderItemId: string;
  quantity: number;
};

type SettleRequestBody = {
  allocations?: SettleAllocationInput[];
};

type SettleRpcResult = {
  ok?: boolean;
  payment_id?: string;
  outbox_event_id?: string;
  total_quantity?: number;
  total_amount?: number;
};

type CloseSessionRpcResult = {
  ok?: boolean;
};

export async function POST(req: Request) {
  let mutation: BegunIdempotentMutation | null = null;
  try {
    const { allocations } = (await req.json()) as SettleRequestBody;
    const ctx = requireBillingAccess(await requireOpsActorContext());
    const billing = await resolveBillingContext(ctx.cafeId, ctx.databaseKey, allocations);

    const started = await beginIdempotentMutation(req, ctx, 'ops.billing.settle-and-close', {
      shiftId: billing.shiftId,
      serviceSessionId: billing.serviceSessionId,
      lines: billing.lines,
    });
    if (started.replayResponse) return started.replayResponse;
    mutation = started.mutation;

    const rpc = await callOpsRpc<SettleRpcResult>('ops_settle_selected_quantities_with_outbox', {
      p_cafe_id: ctx.cafeId,
      p_shift_id: billing.shiftId,
      p_service_session_id: billing.serviceSessionId,
      p_lines: billing.lines,
      ...actorRpcParams(ctx, 'p_by_staff_id', 'p_by_owner_id'),
    }, ctx.databaseKey);

    const paymentId = String(rpc.payment_id ?? '').trim();
    if (!rpc.ok || !paymentId) throw new Error('INVALID_RPC_RESPONSE:ops_settle_selected_quantities');

    let sessionClosed = false;
    try {
      const closeRpc = await callOpsRpc<CloseSessionRpcResult>('ops_close_service_session_with_outbox', {
        p_cafe_id: ctx.cafeId,
        p_service_session_id: billing.serviceSessionId,
        ...actorRpcParams(ctx, 'p_by_staff_id', 'p_by_owner_id'),
      }, ctx.databaseKey);
      sessionClosed = Boolean(closeRpc.ok);
    } catch {
      sessionClosed = false;
    }

    const outboxEventId = String(rpc.outbox_event_id ?? '').trim() || null;
    if (outboxEventId) {
      await publishOpsMutation(ctx, {
        id: outboxEventId,
        type: 'billing.settled',
        entityId: paymentId,
        shiftId: billing.shiftId,
        data: {
          serviceSessionId: billing.serviceSessionId,
          totalAmount: Number(rpc.total_amount ?? 0),
          totalQuantity: Number(rpc.total_quantity ?? billing.lines.reduce((total, line) => total + Number(line.quantity ?? 0), 0)),
        },
        scopes: ['waiter', 'billing', 'dashboard', 'nav-summary'],
      });
    }

    kickOpsOutboxDispatch(ctx);
    const responseBody = { ok: true, sessionClosed };
    await completeIdempotentMutation(ctx, mutation, responseBody);
    return ok(responseBody);
  } catch (e) {
    if (mutation) {
      try {
        const ctx = await requireOpsActorContext();
        await releaseIdempotentMutation(ctx, mutation);
      } catch {}
    }
    return jsonError(e, 400);
  }
}
