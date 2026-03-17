import { adminOps, ensureRuntimeContract } from '@/app/api/ops/_server';
import { jsonError, ok, requireDeferredAccess, requireOpsActorContext } from '@/app/api/ops/_helpers';
export async function POST(req: Request) {
  try {
    const { debtorName } = await req.json() as { debtorName?: string };
    const name = String(debtorName ?? '').trim(); if (!name) throw new Error('INVALID_INPUT');
    const ctx = requireDeferredAccess(await requireOpsActorContext());
    await ensureRuntimeContract('core', ctx.databaseKey);
    const admin = adminOps(ctx.databaseKey);
    const rows = await admin.from('deferred_customer_balances').select('balance').eq('cafe_id', ctx.cafeId).eq('debtor_name', name).limit(1);
    if (rows.error) throw rows.error;
    const balance = Number(((rows.data ?? [])[0] as any)?.balance ?? 0);
    return ok({ debtorName: name, balance });
  } catch (e) { return jsonError(e, 400); }
}
