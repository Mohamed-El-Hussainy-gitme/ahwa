import { callOpsRpc } from '@/app/api/ops/_rpc';
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

export async function POST(req: Request) {
  let mutation: BegunIdempotentMutation | null = null;

  try {
    const { debtorName, amount, notes } = (await req.json()) as {
      debtorName?: string;
      amount?: number;
      notes?: string;
    };
    const name = String(debtorName ?? '').trim();
    const numericAmount = Number(amount ?? 0);
    const normalizedNotes = notes ? String(notes) : null;
    if (!name || numericAmount <= 0) throw new Error('INVALID_INPUT');

    const ctx = requireDeferredAccess(await requireOpsActorContext());
    const shift = await requireOpenOpsShift(ctx.cafeId, ctx.databaseKey);

    const started = await beginIdempotentMutation(req, ctx, 'ops.deferred.add-debt', {
      shiftId: shift.id,
      debtorName: name,
      amount: numericAmount,
      notes: normalizedNotes,
    });
    if (started.replayResponse) {
      return started.replayResponse;
    }
    mutation = started.mutation;

    await callOpsRpc<Record<string, unknown>>('ops_add_deferred_debt_with_outbox', {
      p_cafe_id: ctx.cafeId,
      p_shift_id: shift.id,
      p_debtor_name: name,
      p_amount: numericAmount,
      p_notes: normalizedNotes,
      p_by_staff_id: ctx.actorStaffId,
      p_by_owner_id: ctx.actorOwnerId,
    }, ctx.databaseKey);

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
