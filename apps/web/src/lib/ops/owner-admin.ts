import { supabaseAdmin } from '@/lib/supabase/admin';

export type ShiftRole = 'supervisor' | 'waiter' | 'barista' | 'shisha';

function ops() {
  return supabaseAdmin().schema('ops');
}

export function currentCairoDate(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

export async function listStaffMembers(cafeId: string, includeInactive = false) {
  let query = ops()
    .from('staff_members')
    .select('id, full_name, employee_code, is_active, created_at')
    .eq('cafe_id', cafeId)
    .order('created_at', { ascending: false });

  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((item) => ({
    id: String(item.id),
    fullName: item.full_name ? String(item.full_name) : null,
    employeeCode: item.employee_code ? String(item.employee_code) : null,
    isActive: !!item.is_active,
    createdAt: String(item.created_at),
  }));
}

export async function createStaffMember(input: {
  cafeId: string;
  fullName: string;
  pin: string;
  employeeCode?: string | null;
}) {
  const rpc = await supabaseAdmin().rpc('ops_create_staff_member_v2', {
    p_cafe_id: input.cafeId,
    p_full_name: input.fullName,
    p_pin: input.pin,
    p_employee_code: input.employeeCode ?? null,
  });
  if (rpc.error) throw rpc.error;
  const staffId = String((rpc.data as { staff_member_id?: string } | null)?.staff_member_id ?? '');
  if (!staffId) throw new Error('STAFF_CREATE_FAILED');
  return staffId;
}

export async function setStaffMemberActive(cafeId: string, staffMemberId: string, isActive: boolean) {
  const rpc = await supabaseAdmin().rpc('ops_set_staff_member_active', {
    p_cafe_id: cafeId,
    p_staff_member_id: staffMemberId,
    p_is_active: isActive,
  });
  if (rpc.error) throw rpc.error;
}

export async function setStaffMemberPin(cafeId: string, staffMemberId: string, pin: string) {
  const rpc = await supabaseAdmin().rpc('ops_set_staff_member_pin', {
    p_cafe_id: cafeId,
    p_staff_member_id: staffMemberId,
    p_pin: pin,
  });
  if (rpc.error) throw rpc.error;
}

export type CurrentShiftState = {
  shift: null | {
    id: string;
    kind: 'morning' | 'evening';
    businessDate: string | null;
    status: 'open' | 'closed';
    openedAt: string | null;
    closedAt: string | null;
    notes: string | null;
  };
  assignments: Array<{
    id: string;
    userId: string;
    role: ShiftRole;
    fullName: string | null;
    isActive: boolean;
    actorType: 'owner' | 'staff';
  }>;
};

export async function readCurrentShiftState(cafeId: string): Promise<CurrentShiftState> {
  const { data: shift, error: shiftError } = await ops()
    .from('shifts')
    .select('id, shift_kind, business_date, status, opened_at, closed_at, notes')
    .eq('cafe_id', cafeId)
    .eq('status', 'open')
    .order('opened_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (shiftError) throw shiftError;
  if (!shift) {
    return { shift: null, assignments: [] };
  }

  const shiftId = String(shift.id);

  const { data: assignments, error: assignmentsError } = await ops()
    .from('shift_role_assignments')
    .select('id, role_code, staff_member_id, owner_user_id, is_active, assigned_at')
    .eq('cafe_id', cafeId)
    .eq('shift_id', shiftId)
    .eq('is_active', true)
    .order('assigned_at', { ascending: true });

  if (assignmentsError) throw assignmentsError;

  const staffIds = Array.from(new Set((assignments ?? []).map((item) => item.staff_member_id).filter(Boolean).map(String)));
  const ownerIds = Array.from(new Set((assignments ?? []).map((item) => item.owner_user_id).filter(Boolean).map(String)));

  const [staffRows, ownerRows] = await Promise.all([
    staffIds.length > 0
      ? ops().from('staff_members').select('id, full_name').eq('cafe_id', cafeId).in('id', staffIds)
      : Promise.resolve({ data: [], error: null }),
    ownerIds.length > 0
      ? ops().from('owner_users').select('id, full_name').eq('cafe_id', cafeId).in('id', ownerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (staffRows.error) throw staffRows.error;
  if (ownerRows.error) throw ownerRows.error;

  const staffNameById = new Map((staffRows.data ?? []).map((item) => [String(item.id), item.full_name ? String(item.full_name) : null]));
  const ownerNameById = new Map((ownerRows.data ?? []).map((item) => [String(item.id), item.full_name ? String(item.full_name) : null]));

  return {
    shift: {
      id: shiftId,
      kind: shift.shift_kind as 'morning' | 'evening',
      businessDate: shift.business_date ? String(shift.business_date) : null,
      status: shift.status as 'open' | 'closed',
      openedAt: shift.opened_at ? String(shift.opened_at) : null,
      closedAt: shift.closed_at ? String(shift.closed_at) : null,
      notes: shift.notes ? String(shift.notes) : null,
    },
    assignments: (assignments ?? []).map((item) => {
      const staffId = item.staff_member_id ? String(item.staff_member_id) : null;
      const ownerId = item.owner_user_id ? String(item.owner_user_id) : null;
      return {
        id: String(item.id),
        userId: staffId ?? ownerId ?? '',
        role: item.role_code as ShiftRole,
        fullName: staffId ? staffNameById.get(staffId) ?? null : ownerId ? ownerNameById.get(ownerId) ?? null : null,
        isActive: !!item.is_active,
        actorType: staffId ? 'staff' : 'owner',
      };
    }),
  };
}

export async function listShiftHistory(cafeId: string, limit = 50) {
  const { data, error } = await ops()
    .from('shifts')
    .select('id, shift_kind, status, opened_at, closed_at')
    .eq('cafe_id', cafeId)
    .order('opened_at', { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map((item) => ({
    id: String(item.id),
    kind: item.shift_kind as 'morning' | 'evening',
    isOpen: item.status === 'open',
    startedAt: item.opened_at ? String(item.opened_at) : null,
    endedAt: item.closed_at ? String(item.closed_at) : null,
  }));
}

export async function openShiftWithAssignments(input: {
  cafeId: string;
  ownerUserId: string;
  kind: 'morning' | 'evening';
  notes?: string | null;
  assignments: Array<{ userId: string; role: ShiftRole }>;
}) {
  const openRpc = await supabaseAdmin().rpc('ops_open_shift', {
    p_cafe_id: input.cafeId,
    p_shift_kind: input.kind,
    p_business_date: currentCairoDate(),
    p_opened_by_owner_id: input.ownerUserId,
    p_notes: input.notes ?? null,
  });
  if (openRpc.error) throw openRpc.error;

  const rpcData = (openRpc.data as { shift_id?: string; mode?: string } | null) ?? null;
  const shiftId = String(rpcData?.shift_id ?? '');
  if (!shiftId) throw new Error('SHIFT_OPEN_FAILED');

  for (const assignment of input.assignments) {
    const rpc = await supabaseAdmin().rpc('ops_assign_shift_role', {
      p_cafe_id: input.cafeId,
      p_shift_id: shiftId,
      p_role_code: assignment.role,
      p_staff_member_id: assignment.userId,
      p_owner_user_id: null,
    });
    if (rpc.error) throw rpc.error;
  }

  return {
    shiftId,
    mode:
      rpcData?.mode === 'resumed_open' || rpcData?.mode === 'resumed_closed'
        ? rpcData.mode
        : 'created',
  } as const;
}


async function autoCloseClosableSessions(cafeId: string, shiftId: string, ownerUserId: string) {
  const admin = ops();
  const { data: sessions, error: sessionsError } = await admin
    .from('service_sessions')
    .select('id')
    .eq('cafe_id', cafeId)
    .eq('shift_id', shiftId)
    .eq('status', 'open');

  if (sessionsError) throw sessionsError;

  for (const session of sessions ?? []) {
    const sessionId = String((session as { id?: string | null }).id ?? '');
    if (!sessionId) continue;

    const rpc = await supabaseAdmin().rpc('ops_close_service_session', {
      p_cafe_id: cafeId,
      p_service_session_id: sessionId,
      p_by_owner_id: ownerUserId,
      p_notes: null,
    });

    if (!rpc.error) continue;

    const message = String(rpc.error.message ?? '');
    const expectedFailure = /service session/i.test(message) || /waiting quantity/i.test(message) || /ready quantity/i.test(message) || /billable quantity/i.test(message);
    if (!expectedFailure) {
      throw rpc.error;
    }
  }
}

export async function closeShift(input: {
  cafeId: string;
  shiftId: string;
  ownerUserId: string;
  notes?: string | null;
}) {
  await autoCloseClosableSessions(input.cafeId, input.shiftId, input.ownerUserId);

  const rpc = await supabaseAdmin().rpc('ops_close_shift', {
    p_cafe_id: input.cafeId,
    p_shift_id: input.shiftId,
    p_by_owner_id: input.ownerUserId,
    p_notes: input.notes ?? null,
  });
  if (rpc.error) throw rpc.error;
  return rpc.data;
}
