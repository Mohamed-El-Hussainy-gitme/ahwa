import { actorRpcParams, callOpsRpc } from '@/app/api/ops/_rpc';
import { jsonError, ok, publishOpsMutation, requireBillingAccess, requireOpsActorContext } from '@/app/api/ops/_helpers';
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
  try {
    const { allocations } = (await req.json()) as SettleRequestBody;
    const ctx = requireBillingAccess(await requireOpsActorContext());
    const billing = await resolveBillingContext(ctx.cafeId, allocations);

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

    return ok({ ok: true });
  } catch (e) {
    return jsonError(e, 400);
  }
}
