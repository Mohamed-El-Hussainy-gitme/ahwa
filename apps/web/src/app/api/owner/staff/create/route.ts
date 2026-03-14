import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsActorContext, requireOwnerRole } from '@/app/api/ops/_helpers';
import { createStaffMember, listStaffMembers } from '@/lib/ops/owner-admin';
import { publishOpsEvent } from '@/lib/ops/events';

const Input = z.object({
  name: z.string().min(1),
  pin: z.string().min(4),
  employeeCode: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = Input.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  }

  try {
    const ctx = requireOwnerRole(await requireOpsActorContext());

    const staffId = await createStaffMember({
      cafeId: ctx.cafeId,
      fullName: parsed.data.name.trim(),
      pin: parsed.data.pin.trim(),
      employeeCode: parsed.data.employeeCode?.trim() || null,
    });

    publishOpsEvent({
      type: 'runtime.staff.created',
      cafeId: ctx.cafeId,
      shiftId: ctx.shiftId,
      entityId: staffId,
    });

    const staff = await listStaffMembers(ctx.cafeId, true);
    const created = staff.find((item) => item.id === staffId) ?? null;
    return NextResponse.json({
      ok: true,
      staff: created
        ? {
            id: created.id,
            fullName: created.fullName,
            employeeCode: created.employeeCode,
            accountKind: 'employee',
            isActive: created.isActive,
            createdAt: created.createdAt,
          }
        : null,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'STAFF_CREATE_FAILED';
    return NextResponse.json({ ok: false, error: code }, { status: 400 });
  }
}
