import { adminOps } from '@/app/api/ops/_server';
import { jsonError, ok, publishOpsMutation, requireOpsActorContext, requireOpenOpsShift } from '@/app/api/ops/_helpers';

export async function POST(req: Request) {
  try {
    const { debtorName, amount, notes } = (await req.json()) as {
      debtorName?: string;
      amount?: number;
      notes?: string;
    };
    const name = String(debtorName ?? '').trim();
    const numericAmount = Number(amount ?? 0);
    if (!name || numericAmount <= 0) throw new Error('INVALID_INPUT');

    const ctx = await requireOpsActorContext();
    const shift = await requireOpenOpsShift(ctx.cafeId);
    const admin = adminOps();
    const payload: Record<string, unknown> = {
      cafe_id: ctx.cafeId,
      shift_id: shift.id,
      debtor_name: name,
      entry_kind: 'debt',
      amount: numericAmount,
      notes: notes ? String(notes) : null,
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

    return ok({ ok: true });
  } catch (e) {
    return jsonError(e, 400);
  }
}
