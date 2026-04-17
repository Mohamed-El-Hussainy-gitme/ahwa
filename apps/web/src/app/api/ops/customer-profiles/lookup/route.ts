import { NextResponse } from 'next/server';
import { requireDeferredAccess, requireOpsActorContext } from '@/app/api/ops/_helpers';
import { listCustomerProfiles } from '@/lib/ops/owner-admin';

function mapCustomerError(error: unknown) {
  const code = error instanceof Error ? error.message : 'CUSTOMER_LOOKUP_FAILED';
  return { code, message: code };
}

export async function GET() {
  try {
    const ctx = requireDeferredAccess(await requireOpsActorContext());
    const items = await listCustomerProfiles({ cafeId: ctx.cafeId, databaseKey: ctx.databaseKey }, false);
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    const mapped = mapCustomerError(error);
    return NextResponse.json({ ok: false, error: mapped }, { status: 400 });
  }
}
