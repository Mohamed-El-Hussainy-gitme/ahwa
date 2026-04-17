import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsActorContext, requireOwnerRole } from '@/app/api/ops/_helpers';
import { listCustomerAliases, saveCustomerAlias } from '@/lib/ops/owner-admin';
import { cleanCustomerText } from '@/lib/ops/customers';

const Input = z.object({
  aliasText: z.string().min(1),
});

function mapCustomerError(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
    ? String((error as { code?: string }).code)
    : error instanceof Error
      ? error.message
      : 'CUSTOMER_ALIAS_FAILED';

  if (code === 'CUSTOMER_ALIAS_EXISTS') {
    return { code, message: 'هذا الاسم مرتبط بالفعل بعميل آخر، لذلك تم إيقاف الربط لتجنب الخلط.' };
  }

  return { code, message: code };
}

export async function POST(request: Request, context: { params: Promise<{ customerId: string }> }) {
  const body = await request.json().catch(() => ({}));
  const parsed = Input.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: { code: 'INVALID_INPUT', message: 'البيانات المدخلة غير صالحة.' } }, { status: 400 });
  }

  const aliasText = cleanCustomerText(parsed.data.aliasText);
  const { customerId } = await context.params;
  const normalizedCustomerId = String(customerId ?? '').trim();
  if (!normalizedCustomerId || !aliasText) {
    return NextResponse.json({ ok: false, error: { code: 'INVALID_INPUT', message: 'الاسم البديل مطلوب.' } }, { status: 400 });
  }

  try {
    const ctx = requireOwnerRole(await requireOpsActorContext());
    await saveCustomerAlias({
      cafeId: ctx.cafeId,
      databaseKey: ctx.databaseKey,
      customerId: normalizedCustomerId,
      aliasText,
      source: 'manual',
      markUsed: false,
    });

    const aliases = await listCustomerAliases({ cafeId: ctx.cafeId, databaseKey: ctx.databaseKey }, normalizedCustomerId);
    return NextResponse.json({ ok: true, aliases });
  } catch (error) {
    const mapped = mapCustomerError(error);
    return NextResponse.json({ ok: false, error: mapped }, { status: 400 });
  }
}
