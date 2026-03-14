import { NextResponse } from 'next/server';
import { requireOpsActorContext } from '@/app/api/ops/_helpers';
import { listStaffMembers } from '@/lib/ops/owner-admin';

export async function GET() {
  try {
    const ctx = await requireOpsActorContext();
    const allowed = ctx.accountKind === 'owner' || ctx.shiftRole === 'supervisor';
    if (!allowed) {
      return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
    }

    const staff = await listStaffMembers(ctx.cafeId, true);
    return NextResponse.json({
      ok: true,
      staff: staff.map((item) => ({
        id: item.id,
        fullName: item.fullName,
        employeeCode: item.employeeCode,
        accountKind: 'employee',
        isActive: item.isActive,
        createdAt: item.createdAt,
      })),
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'STAFF_LIST_FAILED';
    return NextResponse.json({ ok: false, error: code }, { status: 400 });
  }
}
