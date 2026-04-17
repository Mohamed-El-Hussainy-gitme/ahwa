import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOps } from '@/app/api/ops/_server';
import { jsonError, requireOpsActorContext, requireOwnerOrManager } from '@/app/api/ops/_helpers';
import { parseBusinessDayStartTime } from '@/lib/ops/business-day';
import { loadOperatingSettings } from '@/lib/ops/owner-admin';

const Input = z.object({
  businessDayStartTime: z.string().trim().regex(/^\d{2}:\d{2}$/),
});

export async function GET() {
  try {
    const ctx = requireOwnerOrManager(await requireOpsActorContext());
    const settings = await loadOperatingSettings({ cafeId: ctx.cafeId, databaseKey: ctx.databaseKey });
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

  const businessDayStartMinutes = parseBusinessDayStartTime(parsed.data.businessDayStartTime);
  if (businessDayStartMinutes === null) {
    return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  }

  try {
    const ctx = requireOwnerOrManager(await requireOpsActorContext());
    const admin = adminOps(ctx.databaseKey);
    const payload = {
      cafe_id: ctx.cafeId,
      business_day_start_minutes: businessDayStartMinutes,
      timezone_name: 'Africa/Cairo',
      updated_at: new Date().toISOString(),
      updated_by_owner_id: ctx.actorOwnerId,
    };

    const { error } = await admin.from('cafe_operating_settings').upsert(payload, { onConflict: 'cafe_id' });
    if (error) throw error;

    const settings = await loadOperatingSettings({ cafeId: ctx.cafeId, databaseKey: ctx.databaseKey });
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    return jsonError(error, 400);
  }
}
