import { supabaseAdminForDatabase } from '@/lib/supabase/admin';

export type RuntimeAccountKind = 'owner' | 'employee';

export type RuntimeOpsActorIdentity = {
  actorOwnerId: string | null;
  actorStaffId: string | null;
  actorType: 'owner' | 'staff' | null;
  opsActorId: string | null;
};

type BindOwnerInput = {
  cafeId: string;
  databaseKey: string;
  runtimeUserId: string;
  phone: string;
  fullName?: string | null;
};

type BindStaffInput = {
  cafeId: string;
  databaseKey: string;
  runtimeUserId: string;
  fullName: string;
};

function adminOps(databaseKey: string) {
  return supabaseAdminForDatabase(databaseKey).schema('ops');
}

export async function bindOwnerRuntimeActor(input: BindOwnerInput): Promise<RuntimeOpsActorIdentity> {
  const admin = adminOps(input.databaseKey);
  const phone = input.phone.trim();
  if (!phone) {
    throw new Error('OWNER_PHONE_REQUIRED');
  }

  const { data, error } = await admin
    .from('owner_users')
    .select('id, legacy_app_user_id, full_name')
    .eq('cafe_id', input.cafeId)
    .eq('phone', phone)
    .eq('is_active', true)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) throw new Error('OWNER_ACTOR_NOT_FOUND');

  const currentRuntimeUserId = data.legacy_app_user_id ? String(data.legacy_app_user_id) : null;
  if (currentRuntimeUserId && currentRuntimeUserId !== input.runtimeUserId) {
    throw new Error('OWNER_ACTOR_CONFLICT');
  }

  if (!currentRuntimeUserId) {
    const { error: updateError } = await admin
      .from('owner_users')
      .update({ legacy_app_user_id: input.runtimeUserId })
      .eq('cafe_id', input.cafeId)
      .eq('id', String(data.id));

    if (updateError) throw updateError;
  }

  return {
    actorOwnerId: String(data.id),
    actorStaffId: null,
    actorType: 'owner',
    opsActorId: String(data.id),
  };
}

export async function bindStaffRuntimeActor(input: BindStaffInput): Promise<RuntimeOpsActorIdentity> {
  const admin = adminOps(input.databaseKey);
  const fullName = input.fullName.trim();
  if (!fullName) {
    throw new Error('STAFF_NAME_REQUIRED');
  }

  const { data, error } = await admin
    .from('staff_members')
    .select('id, legacy_app_user_id')
    .eq('cafe_id', input.cafeId)
    .eq('full_name', fullName)
    .eq('is_active', true)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) throw new Error('STAFF_ACTOR_NOT_FOUND');

  const currentRuntimeUserId = data.legacy_app_user_id ? String(data.legacy_app_user_id) : null;
  if (currentRuntimeUserId && currentRuntimeUserId !== input.runtimeUserId) {
    throw new Error('STAFF_ACTOR_CONFLICT');
  }

  if (!currentRuntimeUserId) {
    const { error: updateError } = await admin
      .from('staff_members')
      .update({ legacy_app_user_id: input.runtimeUserId })
      .eq('cafe_id', input.cafeId)
      .eq('id', String(data.id));

    if (updateError) throw updateError;
  }

  return {
    actorOwnerId: null,
    actorStaffId: String(data.id),
    actorType: 'staff',
    opsActorId: String(data.id),
  };
}

export async function resolveRuntimeOpsActor(input: {
  cafeId: string;
  databaseKey: string;
  runtimeUserId: string;
  accountKind: RuntimeAccountKind;
}): Promise<RuntimeOpsActorIdentity> {
  const admin = adminOps(input.databaseKey);

  if (input.accountKind === 'owner') {
    const { data, error } = await admin
      .from('owner_users')
      .select('id')
      .eq('cafe_id', input.cafeId)
      .eq('legacy_app_user_id', input.runtimeUserId)
      .eq('is_active', true)
      .maybeSingle();

    if (error) throw error;

    return {
      actorOwnerId: data?.id ? String(data.id) : null,
      actorStaffId: null,
      actorType: data?.id ? 'owner' : null,
      opsActorId: data?.id ? String(data.id) : null,
    };
  }

  const { data, error } = await admin
    .from('staff_members')
    .select('id')
    .eq('cafe_id', input.cafeId)
    .eq('legacy_app_user_id', input.runtimeUserId)
    .eq('is_active', true)
    .maybeSingle();

  if (error) throw error;

  return {
    actorOwnerId: null,
    actorStaffId: data?.id ? String(data.id) : null,
    actorType: data?.id ? 'staff' : null,
    opsActorId: data?.id ? String(data.id) : null,
  };
}
