import { NextResponse } from 'next/server';
import { requireOpsActorContext, requireOwnerRole } from '@/app/api/ops/_helpers';
import { listStaffMembers } from '@/lib/ops/owner-admin';

export async function GET() {
  try {
    const ctx = requireOwnerRole(await requireOpsActorContext());

    const staff = await listStaffMembers({ cafeId: ctx.cafeId, databaseKey: ctx.databaseKey }, true);

    return NextResponse.json({
      ok: true,
      actors: [
        {
          id: ctx.actorOwnerId,
          fullName: ctx.fullName,
          employeeCode: null,
          actorType: 'owner',
          accountKind: 'owner',
          isActive: true,
          employmentStatus: 'active',
          isCurrentOwner: true,
        },
        ...staff.map((item) => ({
          id: item.id,
          fullName: item.fullName,
          employeeCode: item.employeeCode,
          actorType: 'staff',
          accountKind: 'employee',
          isActive: item.isActive,
          employmentStatus: item.employmentStatus,
          isCurrentOwner: false,
        })),
      ],
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'SHIFT_ASSIGNABLE_ACTORS_FAILED';
    return NextResponse.json({ ok: false, error: code }, { status: 400 });
  }
}
