import { NextResponse } from 'next/server';
import { requireOpsActorContext, requireOwnerRole } from '@/app/api/ops/_helpers';
import { deleteCustomerAlias, listCustomerAliases } from '@/lib/ops/owner-admin';

function mapCustomerError(error: unknown) {
  const code = error instanceof Error ? error.message : 'CUSTOMER_ALIAS_DELETE_FAILED';
  return { code, message: code };
}

export async function DELETE(_request: Request, context: { params: Promise<{ customerId: string; aliasId: string }> }) {
  const { customerId, aliasId } = await context.params;
  const normalizedCustomerId = String(customerId ?? '').trim();
  const normalizedAliasId = String(aliasId ?? '').trim();
  if (!normalizedCustomerId || !normalizedAliasId) {
    return NextResponse.json({ ok: false, error: { code: 'INVALID_INPUT', message: 'الطلب غير مكتمل.' } }, { status: 400 });
  }

  try {
    const ctx = requireOwnerRole(await requireOpsActorContext());
    await deleteCustomerAlias({
      cafeId: ctx.cafeId,
      databaseKey: ctx.databaseKey,
      customerId: normalizedCustomerId,
      aliasId: normalizedAliasId,
    });
    const aliases = await listCustomerAliases({ cafeId: ctx.cafeId, databaseKey: ctx.databaseKey }, normalizedCustomerId);
    return NextResponse.json({ ok: true, aliases });
  } catch (error) {
    const mapped = mapCustomerError(error);
    return NextResponse.json({ ok: false, error: mapped }, { status: 400 });
  }
}
