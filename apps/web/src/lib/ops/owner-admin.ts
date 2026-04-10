import { supabaseAdminForDatabase } from '@/lib/supabase/admin';

export type ShiftRole = 'supervisor' | 'waiter' | 'barista' | 'shisha' | 'american_waiter';

type CafeDatabaseScope = {
  cafeId: string;
  databaseKey: string;
};


export type OwnerAccountLabel = 'owner' | 'partner' | 'branch_manager';

export async function listOwnerAccounts(scope: CafeDatabaseScope, includeInactive = true) {
  let query = ops(scope.databaseKey)
    .from('owner_users')
    .select('id, full_name, phone, owner_label, is_active, created_at')
    .eq('cafe_id', scope.cafeId)
    .order('created_at', { ascending: true });

  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((item) => ({
    id: String(item.id),
    fullName: item.full_name ? String(item.full_name) : null,
    phone: item.phone ? String(item.phone) : null,
    ownerLabel: item.owner_label === 'partner' ? 'partner' : item.owner_label === 'branch_manager' ? 'branch_manager' : 'owner' as OwnerAccountLabel,
    isActive: !!item.is_active,
    createdAt: String(item.created_at),
  }));
}

export async function createManagementAccount(input: CafeDatabaseScope & {
  actorOwnerId: string;
  fullName: string;
  phone: string;
  password: string;
  ownerLabel?: OwnerAccountLabel;
}) {
  const rpc = await supabaseAdminForDatabase(input.databaseKey).rpc('ops_create_management_account', {
    p_cafe_id: input.cafeId,
    p_actor_owner_id: input.actorOwnerId,
    p_full_name: input.fullName,
    p_phone: input.phone,
    p_password: input.password,
    p_owner_label: input.ownerLabel ?? 'branch_manager',
  });
  if (rpc.error) throw rpc.error;
  const payload = (rpc.data ?? {}) as { owner_user_id?: string | null; owner_label?: string | null };
  const ownerUserId = String(payload.owner_user_id ?? '').trim();
  if (!ownerUserId) throw new Error('MANAGEMENT_ACCOUNT_CREATE_FAILED');
  return {
    ownerUserId,
    ownerLabel: payload.owner_label === 'partner' ? 'partner' : payload.owner_label === 'branch_manager' ? 'branch_manager' : 'owner' as OwnerAccountLabel,
  };
}

function ops(databaseKey: string) {
  return supabaseAdminForDatabase(databaseKey).schema('ops');
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

export async function listStaffMembers(scope: CafeDatabaseScope, includeInactive = false) {
  let query = ops(scope.databaseKey)
    .from('staff_members')
    .select('id, full_name, employee_code, is_active, employment_status, created_at')
    .eq('cafe_id', scope.cafeId)
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
    employmentStatus: item.employment_status ? String(item.employment_status) as 'active' | 'inactive' | 'left' : (!!item.is_active ? 'active' : 'inactive'),
    createdAt: String(item.created_at),
  }));
}

export async function createStaffMember(input: CafeDatabaseScope & {
  fullName: string;
  pin: string;
  employeeCode?: string | null;
}) {
  const rpc = await supabaseAdminForDatabase(input.databaseKey).rpc('ops_create_staff_member_v2', {
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

export async function setStaffMemberActive(input: CafeDatabaseScope & { staffMemberId: string; isActive: boolean }) {
  const rpc = await supabaseAdminForDatabase(input.databaseKey).rpc('ops_set_staff_member_active', {
    p_cafe_id: input.cafeId,
    p_staff_member_id: input.staffMemberId,
    p_is_active: input.isActive,
  });
  if (rpc.error) throw rpc.error;
}

export async function setStaffMemberStatus(input: CafeDatabaseScope & {
  staffMemberId: string;
  employmentStatus: 'active' | 'inactive' | 'left';
}) {
  const rpc = await supabaseAdminForDatabase(input.databaseKey).rpc('ops_set_staff_member_status', {
    p_cafe_id: input.cafeId,
    p_staff_member_id: input.staffMemberId,
    p_employment_status: input.employmentStatus,
  });
  if (rpc.error) throw rpc.error;
}

export async function setStaffMemberPin(input: CafeDatabaseScope & { staffMemberId: string; pin: string }) {
  const rpc = await supabaseAdminForDatabase(input.databaseKey).rpc('ops_set_staff_member_pin', {
    p_cafe_id: input.cafeId,
    p_staff_member_id: input.staffMemberId,
    p_pin: input.pin,
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

export async function readCurrentShiftState(scope: CafeDatabaseScope): Promise<CurrentShiftState> {
  const admin = ops(scope.databaseKey);
  const { data: shift, error: shiftError } = await admin
    .from('shifts')
    .select('id, shift_kind, business_date, status, opened_at, closed_at, notes')
    .eq('cafe_id', scope.cafeId)
    .eq('status', 'open')
    .order('opened_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (shiftError) throw shiftError;
  if (!shift) {
    return { shift: null, assignments: [] };
  }

  const shiftId = String(shift.id);

  const { data: assignments, error: assignmentsError } = await admin
    .from('shift_role_assignments')
    .select('id, role_code, staff_member_id, owner_user_id, is_active, assigned_at')
    .eq('cafe_id', scope.cafeId)
    .eq('shift_id', shiftId)
    .eq('is_active', true)
    .order('assigned_at', { ascending: true });

  if (assignmentsError) throw assignmentsError;

  const staffIds = Array.from(new Set((assignments ?? []).map((item) => item.staff_member_id).filter(Boolean).map(String)));
  const ownerIds = Array.from(new Set((assignments ?? []).map((item) => item.owner_user_id).filter(Boolean).map(String)));

  const [staffRows, ownerRows] = await Promise.all([
    staffIds.length > 0
      ? admin.from('staff_members').select('id, full_name').eq('cafe_id', scope.cafeId).in('id', staffIds)
      : Promise.resolve({ data: [], error: null }),
    ownerIds.length > 0
      ? admin.from('owner_users').select('id, full_name').eq('cafe_id', scope.cafeId).in('id', ownerIds)
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

export async function listShiftHistory(scope: CafeDatabaseScope, limit = 50) {
  const { data, error } = await ops(scope.databaseKey)
    .from('shifts')
    .select('id, shift_kind, status, opened_at, closed_at')
    .eq('cafe_id', scope.cafeId)
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

export async function updateOpenShiftAssignments(input: CafeDatabaseScope & {
  shiftId: string;
  assignments: Array<{ userId: string; role: ShiftRole; actorType?: 'staff' | 'owner' }>;
}) {
  const admin = ops(input.databaseKey);
  const { error: deactivateError } = await admin
    .from('shift_role_assignments')
    .update({ is_active: false })
    .eq('cafe_id', input.cafeId)
    .eq('shift_id', input.shiftId)
    .eq('is_active', true);
  if (deactivateError) throw deactivateError;

  if (!input.assignments.length) return;

  const rows = input.assignments.map((assignment) => ({
    cafe_id: input.cafeId,
    shift_id: input.shiftId,
    role_code: assignment.role,
    staff_member_id: assignment.actorType === 'owner' ? null : assignment.userId,
    owner_user_id: assignment.actorType === 'owner' ? assignment.userId : null,
    is_active: true,
  }));

  const { error: insertError } = await admin.from('shift_role_assignments').insert(rows);
  if (insertError) throw insertError;
}

export async function openShiftWithAssignments(input: CafeDatabaseScope & {
  ownerUserId: string;
  kind: 'morning' | 'evening';
  notes?: string | null;
  assignments: Array<{ userId: string; role: ShiftRole; actorType?: 'staff' | 'owner' }>;
}) {
  const admin = supabaseAdminForDatabase(input.databaseKey);
  const openRpc = await admin.rpc('ops_open_shift_with_assignments', {
    p_cafe_id: input.cafeId,
    p_shift_kind: input.kind,
    p_business_date: currentCairoDate(),
    p_opened_by_owner_id: input.ownerUserId,
    p_notes: input.notes ?? null,
    p_assignments: input.assignments.map((assignment) =>
      assignment.actorType === 'owner'
        ? {
            role: assignment.role,
            actorType: 'owner',
            userId: assignment.userId,
            owner_user_id: assignment.userId,
          }
        : {
            role: assignment.role,
            actorType: 'staff',
            userId: assignment.userId,
            staff_member_id: assignment.userId,
          },
    ),
  });
  if (openRpc.error) throw openRpc.error;

  const rpcData = (openRpc.data as { shift_id?: string; mode?: string } | null) ?? null;
  const shiftId = String(rpcData?.shift_id ?? '');
  if (!shiftId) throw new Error('SHIFT_OPEN_FAILED');

  return {
    shiftId,
    mode:
      rpcData?.mode === 'resumed_open' || rpcData?.mode === 'resumed_closed'
        ? rpcData.mode
        : 'created',
  } as const;
}

async function autoCloseClosableSessions(input: {
  cafeId: string;
  databaseKey: string;
  shiftId: string;
  ownerUserId: string;
}) {
  const admin = ops(input.databaseKey);
  const { data: sessions, error: sessionsError } = await admin
    .from('service_sessions')
    .select('id')
    .eq('cafe_id', input.cafeId)
    .eq('shift_id', input.shiftId)
    .eq('status', 'open');

  if (sessionsError) throw sessionsError;

  for (const session of sessions ?? []) {
    const sessionId = String((session as { id?: string | null }).id ?? '');
    if (!sessionId) continue;

    const rpc = await supabaseAdminForDatabase(input.databaseKey).rpc('ops_close_service_session', {
      p_cafe_id: input.cafeId,
      p_service_session_id: sessionId,
      p_by_owner_id: input.ownerUserId,
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

export async function closeShift(input: CafeDatabaseScope & {
  shiftId: string;
  ownerUserId: string;
  notes?: string | null;
}) {
  await autoCloseClosableSessions({
    cafeId: input.cafeId,
    databaseKey: input.databaseKey,
    shiftId: input.shiftId,
    ownerUserId: input.ownerUserId,
  });

  const rpc = await supabaseAdminForDatabase(input.databaseKey).rpc('ops_close_shift', {
    p_cafe_id: input.cafeId,
    p_shift_id: input.shiftId,
    p_by_owner_id: input.ownerUserId,
    p_notes: input.notes ?? null,
  });
  if (rpc.error) throw rpc.error;
  return rpc.data;
}
