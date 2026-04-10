import { NextResponse } from 'next/server';
import { requireManagementAccess, requireOpsActorContext } from '@/app/api/ops/_helpers';
import { listStaffMembers } from '@/lib/ops/owner-admin';

export async function GET() {
  try {
    const ctx = requireManagementAccess(await requireOpsActorContext());

    const staff = await listStaffMembers({ cafeId: ctx.cafeId, databaseKey: ctx.databaseKey }, true);
    return NextResponse.json({
      ok: true,
      staff: staff.map((item) => ({
        id: item.id,
        fullName: item.fullName,
        employeeCode: item.employeeCode,
        accountKind: 'employee',
        isActive: item.isActive,
        employmentStatus: item.employmentStatus,
        createdAt: item.createdAt,
      })),
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'STAFF_LIST_FAILED';
    return NextResponse.json({ ok: false, error: code }, { status: 400 });
  }
}
