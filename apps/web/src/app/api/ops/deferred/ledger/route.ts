import { adminOps } from '@/app/api/ops/_server';
import { jsonError, ok, requireOpsActorContext } from '@/app/api/ops/_helpers';
export async function POST(req: Request) {
  try {
    const { debtorName } = await req.json() as { debtorName?: string };
    const name = String(debtorName ?? '').trim(); if (!name) throw new Error('INVALID_INPUT');
    const ctx = await requireOpsActorContext(); const admin = adminOps();
    const rows = await admin.from('deferred_ledger_entries').select('*').eq('cafe_id', ctx.cafeId).eq('debtor_name', name).order('created_at', { ascending: false });
    if (rows.error) throw rows.error;
    return ok({ debtorName: name, items: rows.data ?? [] });
  } catch (e) { return jsonError(e, 400); }
}
