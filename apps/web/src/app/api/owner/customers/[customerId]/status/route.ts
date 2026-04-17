import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsActorContext, requireOwnerRole } from '@/app/api/ops/_helpers';
import { setCustomerProfileActive } from '@/lib/ops/owner-admin';

const Input = z.object({
  isActive: z.boolean(),
});

function mapCustomerError(error: unknown) {
  const code = error instanceof Error ? error.message : 'CUSTOMER_STATUS_UPDATE_FAILED';
  return { code, message: code };
}

export async function POST(request: Request, context: { params: Promise<{ customerId: string }> }) {
  const body = await request.json().catch(() => ({}));
  const parsed = Input.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: { code: 'INVALID_INPUT', message: 'البيانات المدخلة غير صالحة.' } }, { status: 400 });
  }

  const { customerId } = await context.params;
  const normalizedCustomerId = String(customerId ?? '').trim();
  if (!normalizedCustomerId) {
    return NextResponse.json({ ok: false, error: { code: 'INVALID_INPUT', message: 'لم يتم تحديد العميل.' } }, { status: 400 });
  }

  try {
    const ctx = requireOwnerRole(await requireOpsActorContext());
    await setCustomerProfileActive({
      cafeId: ctx.cafeId,
      databaseKey: ctx.databaseKey,
      actorOwnerId: ctx.actorOwnerId!,
      customerId: normalizedCustomerId,
      isActive: parsed.data.isActive,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const mapped = mapCustomerError(error);
    return NextResponse.json({ ok: false, error: mapped }, { status: 400 });
  }
}
