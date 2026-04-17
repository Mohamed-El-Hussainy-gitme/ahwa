import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdminForDatabase } from '@/lib/supabase/admin';
import { buildShiftInventorySnapshot } from '@/lib/ops/inventory';
import { publishOpsEvent } from '@/lib/ops/events';
import { requireOpsActorContext, requireOwnerOrSupervisor } from '@/app/api/ops/_helpers';

const Input = z.object({
  shiftId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = Input.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  }

  try {
    const ctx = requireOwnerOrSupervisor(await requireOpsActorContext());
    const admin = supabaseAdminForDatabase(ctx.databaseKey).schema('ops');

    let shiftId = parsed.data.shiftId;
    if (!shiftId) {
      const currentShift = await admin
        .from('shifts')
        .select('id')
        .eq('cafe_id', ctx.cafeId)
        .eq('status', 'open')
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (currentShift.error) {
        throw currentShift.error;
      }

      shiftId = currentShift.data?.id;
    }

    if (!shiftId) {
      return NextResponse.json({ ok: false, error: 'NO_OPEN_SHIFT' }, { status: 409 });
    }

    const rpc = await supabaseAdminForDatabase(ctx.databaseKey).rpc('ops_build_shift_snapshot', {
      p_cafe_id: ctx.cafeId,
      p_shift_id: shiftId,
    });

    if (rpc.error) {
      throw rpc.error;
    }

    const inventorySnapshot = await buildShiftInventorySnapshot({
      cafeId: ctx.cafeId,
      databaseKey: ctx.databaseKey,
      shiftId: String(shiftId),
      actorOwnerId: ctx.actorOwnerId,
      persist: true,
    });

    publishOpsEvent({
      type: 'shift.snapshot_built',
      cafeId: ctx.cafeId,
      shiftId: String(shiftId),
      entityId: String(shiftId),
    });

    return NextResponse.json({ ok: true, snapshot: { ...(rpc.data as Record<string, unknown>), inventory: inventorySnapshot } });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'SHIFT_CLOSE_SNAPSHOT_FAILED';
    return NextResponse.json({ ok: false, error: code }, { status: 400 });
  }
}
