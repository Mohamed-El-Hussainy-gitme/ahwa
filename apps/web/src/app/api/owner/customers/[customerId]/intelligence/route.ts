import { NextResponse } from 'next/server';
import { requireOpsActorContext, requireOwnerRole } from '@/app/api/ops/_helpers';
import { loadCustomerIntelligence } from '@/lib/ops/owner-admin';

function mapCustomerError(error: unknown) {
  const code = error instanceof Error ? error.message : 'CUSTOMER_INTELLIGENCE_FAILED';
  return { code, message: code };
}

export async function GET(_request: Request, context: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await context.params;
  const normalizedCustomerId = String(customerId ?? '').trim();
  if (!normalizedCustomerId) {
    return NextResponse.json({ ok: false, error: { code: 'INVALID_INPUT', message: 'لم يتم تحديد العميل.' } }, { status: 400 });
  }

  try {
    const ctx = requireOwnerRole(await requireOpsActorContext());
    const workspace = await loadCustomerIntelligence({ cafeId: ctx.cafeId, databaseKey: ctx.databaseKey }, normalizedCustomerId);
    return NextResponse.json({ ok: true, workspace });
  } catch (error) {
    const mapped = mapCustomerError(error);
    return NextResponse.json({ ok: false, error: mapped }, { status: 400 });
  }
}
