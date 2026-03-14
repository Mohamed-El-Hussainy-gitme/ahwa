import { adminOps } from '@/app/api/ops/_server';
import { jsonError, ok, requireDeferredAccess, requireOpsActorContext } from '@/app/api/ops/_helpers';
export async function POST(req: Request) {
  try {
    const { debtorName } = await req.json() as { debtorName?: string };
    const name = String(debtorName ?? '').trim(); if (!name) throw new Error('INVALID_INPUT');
    const ctx = requireDeferredAccess(await requireOpsActorContext()); const admin = adminOps();
    const rows = await admin.from('deferred_ledger_entries').select('entry_kind, amount').eq('cafe_id', ctx.cafeId).eq('debtor_name', name).order('created_at', { ascending: true });
    if (rows.error) throw rows.error;
    let balance = 0; for (const row of rows.data ?? []) { const amount = Number((row as any).amount ?? 0); const kind = String((row as any).entry_kind ?? ''); balance += kind === 'debt' ? amount : kind === 'repayment' ? -amount : 0; }
    return ok({ debtorName: name, balance });
  } catch (e) { return jsonError(e, 400); }
}
