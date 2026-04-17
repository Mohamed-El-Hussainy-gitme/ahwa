import { actorRpcParams, callOpsRpc } from '@/app/api/ops/_rpc';
import {
  beginIdempotentMutation,
  type BegunIdempotentMutation,
  completeIdempotentMutation,
  jsonError,
  ok,
  kickOpsOutboxDispatch,
  releaseIdempotentMutation,
  requireDeferredAccess,
  requireOpsActorContext,
  requireOpenOpsShift,
} from '@/app/api/ops/_helpers';
import { linkCustomerByDeferredName } from '@/lib/ops/owner-admin';

type RepaymentRpcResult = {
  ok?: boolean;
  payment_id?: string;
  repayment_amount?: number | string;
};

export async function POST(req: Request) {
  let mutation: BegunIdempotentMutation | null = null;

  try {
    const { debtorName, amount, notes, customerId } = (await req.json()) as {
      debtorName?: string;
      amount?: number;
      notes?: string;
      customerId?: string;
    };
    const name = String(debtorName ?? '').trim();
    const numericAmount = Number(amount ?? 0);
    const repaymentNotes = String(notes ?? '').trim() || null;
    if (!name || !Number.isFinite(numericAmount) || numericAmount <= 0) throw new Error('INVALID_INPUT');

    const ctx = requireDeferredAccess(await requireOpsActorContext());
    const shift = await requireOpenOpsShift(ctx.cafeId, ctx.databaseKey);

    const started = await beginIdempotentMutation(req, ctx, 'ops.deferred.repay', {
      shiftId: shift.id,
      debtorName: name,
      amount: numericAmount,
      notes: repaymentNotes,
    });
    if (started.replayResponse) {
      return started.replayResponse;
    }
    mutation = started.mutation;

    const rpc = await callOpsRpc<RepaymentRpcResult>('ops_record_repayment_with_outbox', {
      p_cafe_id: ctx.cafeId,
      p_shift_id: shift.id,
      p_debtor_name: name,
      p_amount: numericAmount,
      p_notes: repaymentNotes,
      ...actorRpcParams(ctx, 'p_by_staff_id', 'p_by_owner_id'),
    }, ctx.databaseKey);

    const paymentId = String(rpc.payment_id ?? '').trim();
    if (!rpc.ok || !paymentId) {
      throw new Error('INVALID_RPC_RESPONSE:ops_record_repayment');
    }

    await linkCustomerByDeferredName({
      cafeId: ctx.cafeId,
      databaseKey: ctx.databaseKey,
      debtorName: name,
      customerId: customerId ? String(customerId).trim() : null,
      paymentId,
      actorOwnerId: ctx.actorOwnerId,
      actorStaffId: ctx.actorStaffId,
      source: 'deferred_runtime',
    });

    kickOpsOutboxDispatch(ctx);

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
