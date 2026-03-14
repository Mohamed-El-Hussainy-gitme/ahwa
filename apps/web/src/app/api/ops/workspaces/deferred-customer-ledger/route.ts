import { buildDeferredCustomerLedgerWorkspace } from '@/app/api/ops/_server';
import { jsonError, ok, requireDeferredAccess, requireOpsActorContext } from '@/app/api/ops/_helpers';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { debtorName?: string };
    const debtorName = String(body.debtorName ?? '').trim();
    if (!debtorName) throw new Error('DEBTOR_NAME_REQUIRED');
    const ctx = requireDeferredAccess(await requireOpsActorContext());
    return ok(await buildDeferredCustomerLedgerWorkspace(ctx.cafeId, debtorName));
  } catch (error) {
    return jsonError(error, 400);
  }
}
