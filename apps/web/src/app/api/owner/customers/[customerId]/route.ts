import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsActorContext, requireOwnerRole } from '@/app/api/ops/_helpers';
import { listCustomerProfiles, updateCustomerProfile } from '@/lib/ops/owner-admin';
import { cleanCustomerText, normalizeCustomerName, normalizeCustomerPhone } from '@/lib/ops/customers';

const Input = z.object({
  fullName: z.string().min(1),
  phone: z.string().min(1),
  address: z.string().optional().nullable(),
  favoriteDrinkLabel: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

function mapCustomerError(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
    ? String((error as { code?: string }).code)
    : error instanceof Error
      ? error.message
      : 'CUSTOMER_UPDATE_FAILED';

  if (code === '23505') {
    return { code: 'CUSTOMER_PHONE_EXISTS', message: 'رقم الهاتف مسجل بالفعل داخل ملف عميل آخر.' };
  }

  return { code, message: code };
}

export async function PATCH(request: Request, context: { params: Promise<{ customerId: string }> }) {
  const body = await request.json().catch(() => ({}));
  const parsed = Input.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: { code: 'INVALID_INPUT', message: 'البيانات المدخلة غير صالحة.' } }, { status: 400 });
  }

  const { customerId } = await context.params;
  const normalizedCustomerId = String(customerId ?? '').trim();
  const fullName = cleanCustomerText(parsed.data.fullName);
  const phoneRaw = cleanCustomerText(parsed.data.phone);
  const phoneNormalized = normalizeCustomerPhone(phoneRaw ?? '');
  const normalizedName = normalizeCustomerName(fullName ?? '');

  if (!normalizedCustomerId || !fullName || !normalizedName || !phoneRaw || phoneNormalized.length < 7) {
    return NextResponse.json({ ok: false, error: { code: 'INVALID_INPUT', message: 'الاسم ورقم الهاتف مطلوبان بصيغة صحيحة.' } }, { status: 400 });
  }

  try {
    const ctx = requireOwnerRole(await requireOpsActorContext());
    await updateCustomerProfile({
      cafeId: ctx.cafeId,
      databaseKey: ctx.databaseKey,
      actorOwnerId: ctx.actorOwnerId!,
      customerId: normalizedCustomerId,
      fullName,
      normalizedName,
      phoneRaw,
      phoneNormalized,
      address: cleanCustomerText(parsed.data.address),
      favoriteDrinkLabel: cleanCustomerText(parsed.data.favoriteDrinkLabel),
      notes: cleanCustomerText(parsed.data.notes),
    });

    const items = await listCustomerProfiles({ cafeId: ctx.cafeId, databaseKey: ctx.databaseKey }, true);
    const customer = items.find((item) => item.id === normalizedCustomerId) ?? null;
    return NextResponse.json({ ok: true, customer });
  } catch (error) {
    const mapped = mapCustomerError(error);
    return NextResponse.json({ ok: false, error: mapped }, { status: 400 });
  }
}
