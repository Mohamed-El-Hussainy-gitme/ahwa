import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOps, loadBillingSettings } from '@/app/api/ops/_server';
import { jsonError, requireOpsActorContext, requireOwnerRole } from '@/app/api/ops/_helpers';

const Input = z.object({
  taxEnabled: z.boolean(),
  taxRate: z.number().min(0).max(100),
  serviceEnabled: z.boolean(),
  serviceRate: z.number().min(0).max(100),
});

export async function GET() {
  try {
    const ctx = requireOwnerRole(await requireOpsActorContext());
    const settings = await loadBillingSettings(ctx.cafeId, ctx.databaseKey);
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    return jsonError(error, 400);
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = Input.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  }

  try {
    const ctx = requireOwnerRole(await requireOpsActorContext());
    const admin = adminOps(ctx.databaseKey);
    const payload = {
      cafe_id: ctx.cafeId,
      tax_enabled: parsed.data.taxEnabled,
      tax_rate: parsed.data.taxRate,
      service_enabled: parsed.data.serviceEnabled,
      service_rate: parsed.data.serviceRate,
      updated_by_owner_id: ctx.actorOwnerId,
    };

    const { error } = await admin.from('cafe_billing_settings').upsert(payload, { onConflict: 'cafe_id' });
    if (error) throw error;

    const settings = await loadBillingSettings(ctx.cafeId, ctx.databaseKey);
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    return jsonError(error, 400);
  }
}
