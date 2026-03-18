import 'server-only';
import { controlPlaneAdmin } from '@/lib/control-plane/admin';
import { resolveCafeDatabaseBinding } from '@/lib/control-plane/cafes';
import { supabaseAdminForDatabase } from '@/lib/supabase/admin';
import { isOperationalDatabaseConfigured } from '@/lib/supabase/env';

type ControlPlaneCafeRow = {
  id: string;
  slug: string;
  display_name: string | null;
  is_active: boolean | null;
};

type ControlPlaneOwnerRow = {
  id: string;
  cafe_id: string;
  full_name: string | null;
  phone: string | null;
  password_hash: string | null;
  password_state: string | null;
  owner_label: string | null;
  is_active: boolean | null;
};

function opsAdmin(databaseKey: string) {
  return supabaseAdminForDatabase(databaseKey).schema('ops');
}

async function requireOperationalDatabaseKey(cafeId: string): Promise<string> {
  const binding = await resolveCafeDatabaseBinding(cafeId);
  if (!binding?.databaseKey) {
    throw new Error('CAFE_DATABASE_UNBOUND');
  }

  if (!isOperationalDatabaseConfigured(binding.databaseKey)) {
    throw new Error(`CAFE_DATABASE_UNAVAILABLE:${binding.databaseKey}`);
  }

  return binding.databaseKey;
}

async function loadControlPlaneCafe(cafeId: string): Promise<ControlPlaneCafeRow> {
  const { data, error } = await controlPlaneAdmin()
    .schema('ops')
    .from('cafes')
    .select('id, slug, display_name, is_active')
    .eq('id', cafeId)
    .maybeSingle<ControlPlaneCafeRow>();

  if (error) throw error;
  if (!data) {
    throw new Error('CAFE_NOT_FOUND_ON_CONTROL_PLANE');
  }

  return data;
}

async function loadControlPlaneOwner(cafeId: string, ownerUserId: string): Promise<ControlPlaneOwnerRow> {
  const { data, error } = await controlPlaneAdmin()
    .schema('ops')
    .from('owner_users')
    .select('id, cafe_id, full_name, phone, password_hash, password_state, owner_label, is_active')
    .eq('cafe_id', cafeId)
    .eq('id', ownerUserId)
    .maybeSingle<ControlPlaneOwnerRow>();

  if (error) throw error;
  if (!data) {
    throw new Error('OWNER_NOT_FOUND_ON_CONTROL_PLANE');
  }

  return data;
}

async function loadControlPlaneOwners(cafeId: string): Promise<ControlPlaneOwnerRow[]> {
  const { data, error } = await controlPlaneAdmin()
    .schema('ops')
    .from('owner_users')
    .select('id, cafe_id, full_name, phone, password_hash, password_state, owner_label, is_active')
    .eq('cafe_id', cafeId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as ControlPlaneOwnerRow[];
}

export async function mirrorCafeToOperationalDatabase(cafeId: string): Promise<{ databaseKey: string }> {
  const [databaseKey, cafe] = await Promise.all([
    requireOperationalDatabaseKey(cafeId),
    loadControlPlaneCafe(cafeId),
  ]);

  const { error } = await opsAdmin(databaseKey)
    .from('cafes')
    .upsert({
      id: cafe.id,
      slug: cafe.slug,
      display_name: cafe.display_name ?? cafe.slug,
      is_active: cafe.is_active ?? true,
    }, { onConflict: 'id' });

  if (error) {
    throw new Error(`OPERATIONAL_CAFE_MIRROR_FAILED:${databaseKey}:${error.message}`);
  }

  return { databaseKey };
}

export async function mirrorOwnerToOperationalDatabase(
  cafeId: string,
  ownerUserId: string,
): Promise<{ databaseKey: string }> {
  const [databaseKey, owner] = await Promise.all([
    requireOperationalDatabaseKey(cafeId),
    loadControlPlaneOwner(cafeId, ownerUserId),
    mirrorCafeToOperationalDatabase(cafeId),
  ]);

  const { error } = await opsAdmin(databaseKey)
    .from('owner_users')
    .upsert({
      id: owner.id,
      cafe_id: owner.cafe_id,
      full_name: owner.full_name ?? '',
      phone: owner.phone ?? '',
      password_hash: owner.password_hash ?? null,
      password_state: owner.password_state ?? (owner.password_hash ? 'ready' : 'setup_pending'),
      owner_label: owner.owner_label ?? 'partner',
      is_active: owner.is_active ?? true,
    }, { onConflict: 'id' });

  if (error) {
    throw new Error(`OPERATIONAL_OWNER_MIRROR_FAILED:${databaseKey}:${error.message}`);
  }

  return { databaseKey };
}

export async function mirrorCafeOwnersToOperationalDatabase(cafeId: string): Promise<{ databaseKey: string; ownerCount: number }> {
  const [databaseKey, owners] = await Promise.all([
    requireOperationalDatabaseKey(cafeId),
    loadControlPlaneOwners(cafeId),
    mirrorCafeToOperationalDatabase(cafeId),
  ]);

  if (!owners.length) {
    return { databaseKey, ownerCount: 0 };
  }

  const payload = owners.map((owner) => ({
    id: owner.id,
    cafe_id: owner.cafe_id,
    full_name: owner.full_name ?? '',
    phone: owner.phone ?? '',
    password_hash: owner.password_hash ?? null,
    password_state: owner.password_state ?? (owner.password_hash ? 'ready' : 'setup_pending'),
    owner_label: owner.owner_label ?? 'partner',
    is_active: owner.is_active ?? true,
  }));

  const { error } = await opsAdmin(databaseKey)
    .from('owner_users')
    .upsert(payload, { onConflict: 'id' });

  if (error) {
    throw new Error(`OPERATIONAL_OWNER_BULK_MIRROR_FAILED:${databaseKey}:${error.message}`);
  }

  return { databaseKey, ownerCount: payload.length };
}
