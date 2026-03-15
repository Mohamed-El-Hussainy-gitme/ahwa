import { actorRpcParams, callOpsRpc } from '@/app/api/ops/_rpc';
import {
  beginIdempotentMutation,
  type BegunIdempotentMutation,
  completeIdempotentMutation,
  jsonError,
  ok,
  publishOpsMutation,
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
  total_amount?: number | string;
};

export async function POST(req: Request) {
  let mutation: BegunIdempotentMutation | null = null;

  try {
    const { allocations } = (await req.json()) as SettleRequestBody;
    const ctx = requireBillingAccess(await requireOpsActorContext());
    const billing = await resolveBillingContext(ctx.cafeId, allocations);

    const started = await beginIdempotentMutation(req, ctx, 'ops.billing.settle', {
      shiftId: billing.shiftId,
      serviceSessionId: billing.serviceSessionId,
      lines: billing.lines,
    });
    if (started.replayResponse) {
      return started.replayResponse;
    }
    mutation = started.mutation;

    const rpc = await callOpsRpc<SettleRpcResult>('ops_settle_selected_quantities', {
      p_cafe_id: ctx.cafeId,
      p_shift_id: billing.shiftId,
      p_service_session_id: billing.serviceSessionId,
      p_lines: billing.lines,
      ...actorRpcParams(ctx, 'p_by_staff_id', 'p_by_owner_id'),
    });

    const paymentId = String(rpc.payment_id ?? '').trim();
    if (!rpc.ok || !paymentId) {
      throw new Error('INVALID_RPC_RESPONSE:ops_settle_selected_quantities');
    }

    publishOpsMutation(ctx, {
      type: 'billing.settled',
      entityId: paymentId,
      shiftId: billing.shiftId,
      data: { serviceSessionId: billing.serviceSessionId, totalAmount: Number(rpc.total_amount ?? 0) },
    });

    const responseBody = { ok: true };
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
