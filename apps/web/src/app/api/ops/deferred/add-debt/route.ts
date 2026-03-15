import { adminOps } from '@/app/api/ops/_server';
import {
  beginIdempotentMutation,
  type BegunIdempotentMutation,
  completeIdempotentMutation,
  jsonError,
  ok,
  publishOpsMutation,
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
    const shift = await requireOpenOpsShift(ctx.cafeId);

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

    const admin = adminOps();
    const payload: Record<string, unknown> = {
      cafe_id: ctx.cafeId,
      shift_id: shift.id,
      debtor_name: name,
      entry_kind: 'debt',
      amount: numericAmount,
      notes: normalizedNotes,
    };
    if (ctx.actorOwnerId) payload.by_owner_id = ctx.actorOwnerId;
    else payload.by_staff_id = ctx.actorStaffId;
    const insert = await admin.from('deferred_ledger_entries').insert(payload);
    if (insert.error) throw insert.error;

    publishOpsMutation(ctx, {
      type: 'deferred.debt_added',
      shiftId: String(shift.id),
      data: { debtorName: name, amount: numericAmount },
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
