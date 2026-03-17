import 'server-only';
import type { PostgrestError } from '@supabase/supabase-js';
import { controlPlaneAdmin } from '@/lib/control-plane/admin';
import type { PlatformAdminSession } from '@/lib/platform-auth/session';

type CreateCafeWithOwnerInput = {
  cafeSlug: string;
  cafeDisplayName: string;
  ownerFullName: string;
  ownerPhone: string;
  ownerPassword: string;
  subscriptionStartsAt: string | null;
  subscriptionEndsAt: string | null;
  subscriptionGraceDays: number;
  subscriptionStatus: 'trial' | 'active' | 'expired' | 'suspended';
  subscriptionAmountPaid: number;
  subscriptionIsComplimentary: boolean;
  subscriptionNotes: string | null;
  databaseKey: string;
};

type ControlPlaneOperationalDatabaseRow = {
  database_key?: string | null;
  is_active?: boolean | null;
};

type CreatedCafeRow = {
  id: string;
  slug: string;
};

type CreatedSubscriptionRow = {
  id: string;
};

type RpcCreateOwnerResponse = {
  owner_user_id?: string | null;
  owner_label?: string | null;
};

export type CreateCafeWithOwnerResult = {
  cafeId: string;
  ownerUserId: string;
  subscriptionId: string | null;
  slug: string;
  databaseKey: string;
};

const VALID_SUBSCRIPTION_STATUSES = new Set(['trial', 'active', 'expired', 'suspended']);

function normalizeText(value: string | null | undefined): string {
  return String(value ?? '').trim();
}

function normalizeSlug(slug: string): string {
  return normalizeText(slug).toLowerCase();
}

function normalizeDatabaseKey(databaseKey: string): string {
  return normalizeText(databaseKey).toLowerCase();
}

function maybeMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
    return String((error as { message: string }).message);
  }
  return 'REQUEST_FAILED';
}

function isPostgrestError(error: unknown): error is PostgrestError {
  return !!error && typeof error === 'object' && 'message' in error && 'code' in error;
}

function ensureSubscriptionInput(input: CreateCafeWithOwnerInput) {
  const shouldCreateSubscription = Boolean(input.subscriptionStartsAt || input.subscriptionEndsAt);
  if (!shouldCreateSubscription) {
    return false;
  }

  if (!input.subscriptionStartsAt || !input.subscriptionEndsAt) {
    throw new Error('subscription dates are required');
  }

  const startsAt = Date.parse(input.subscriptionStartsAt);
  const endsAt = Date.parse(input.subscriptionEndsAt);
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt) {
    throw new Error('subscription end must be after start');
  }

  if (!Number.isFinite(input.subscriptionGraceDays) || input.subscriptionGraceDays < 0) {
    throw new Error('subscription grace_days must be >= 0');
  }

  if (!Number.isFinite(input.subscriptionAmountPaid) || input.subscriptionAmountPaid < 0) {
    throw new Error('subscription amount_paid must be >= 0');
  }

  if (!VALID_SUBSCRIPTION_STATUSES.has(input.subscriptionStatus)) {
    throw new Error('invalid subscription status');
  }

  return true;
}

async function assertDatabaseKeyIsActive(databaseKey: string): Promise<void> {
  const { data, error } = await controlPlaneAdmin().rpc('control_list_operational_databases');
  if (error) throw error;

  const rows = Array.isArray(data) ? data as ControlPlaneOperationalDatabaseRow[] : [];
  const found = rows.some((row) => normalizeDatabaseKey(row.database_key ?? '') === databaseKey && row.is_active === true);
  if (!found) {
    throw new Error('operational_database_not_found');
  }
}

async function cleanupCafeCreate(cafeId: string): Promise<void> {
  const normalizedCafeId = normalizeText(cafeId);
  if (!normalizedCafeId) {
    return;
  }

  try {
    await controlPlaneAdmin()
      .schema('ops')
      .from('cafes')
      .delete()
      .eq('id', normalizedCafeId);
  } catch {
    // Best-effort cleanup only.
  }
}

async function insertCafe(slug: string, displayName: string): Promise<CreatedCafeRow> {
  const { data, error } = await controlPlaneAdmin()
    .schema('ops')
    .from('cafes')
    .insert({
      slug,
      display_name: displayName,
      is_active: true,
    })
    .select('id, slug')
    .single<CreatedCafeRow>();

  if (error) throw error;
  return data;
}

async function assignDatabase(session: PlatformAdminSession, cafeId: string, databaseKey: string): Promise<void> {
  const { error } = await controlPlaneAdmin().rpc('control_assign_cafe_database', {
    p_super_admin_user_id: session.superAdminUserId,
    p_cafe_id: cafeId,
    p_database_key: databaseKey,
    p_binding_source: 'manual',
  });

  if (error) throw error;
}

async function createOwner(session: PlatformAdminSession, cafeId: string, input: CreateCafeWithOwnerInput): Promise<string> {
  const { data, error } = await controlPlaneAdmin().rpc('platform_create_owner_user', {
    p_super_admin_user_id: session.superAdminUserId,
    p_cafe_id: cafeId,
    p_full_name: input.ownerFullName,
    p_phone: input.ownerPhone,
    p_password: input.ownerPassword,
    p_owner_label: 'owner',
  });

  if (error) throw error;

  const ownerUserId = normalizeText((data as RpcCreateOwnerResponse | null)?.owner_user_id);
  if (!ownerUserId) {
    throw new Error('CONTROL_PLANE_CREATE_OWNER_RESPONSE_INVALID');
  }

  return ownerUserId;
}

async function createSubscription(
  session: PlatformAdminSession,
  cafeId: string,
  input: CreateCafeWithOwnerInput,
): Promise<string | null> {
  const shouldCreateSubscription = ensureSubscriptionInput(input);
  if (!shouldCreateSubscription) {
    return null;
  }

  const { data, error } = await controlPlaneAdmin()
    .schema('platform')
    .from('cafe_subscriptions')
    .insert({
      cafe_id: cafeId,
      starts_at: input.subscriptionStartsAt,
      ends_at: input.subscriptionEndsAt,
      grace_days: input.subscriptionGraceDays,
      status: input.subscriptionStatus,
      amount_paid: input.subscriptionAmountPaid,
      is_complimentary: input.subscriptionIsComplimentary,
      notes: input.subscriptionNotes,
      created_by_super_admin_user_id: session.superAdminUserId,
    })
    .select('id')
    .single<CreatedSubscriptionRow>();

  if (error) throw error;
  return normalizeText(data?.id) || null;
}

async function writeCafeAuditEvent(
  session: PlatformAdminSession,
  cafeId: string,
  ownerUserId: string,
  subscriptionId: string | null,
  input: CreateCafeWithOwnerInput,
): Promise<void> {
  const payload = {
    owner_user_id: ownerUserId,
    owner_phone: input.ownerPhone,
    owner_label: 'owner',
    database_key: input.databaseKey,
    subscription: subscriptionId
      ? {
          subscription_id: subscriptionId,
          starts_at: input.subscriptionStartsAt,
          ends_at: input.subscriptionEndsAt,
          grace_days: input.subscriptionGraceDays,
          status: input.subscriptionStatus,
          amount_paid: input.subscriptionAmountPaid,
          is_complimentary: input.subscriptionIsComplimentary,
          notes: input.subscriptionNotes,
        }
      : null,
  };

  const { error } = await controlPlaneAdmin()
    .schema('ops')
    .from('audit_events')
    .insert({
      cafe_id: cafeId,
      actor_type: 'super_admin',
      actor_label: session.email,
      event_code: 'platform_create_cafe_with_owner',
      entity_type: 'cafe',
      entity_id: cafeId,
      payload,
    });

  if (error) throw error;
}

function normalizeInput(input: CreateCafeWithOwnerInput): CreateCafeWithOwnerInput {
  return {
    ...input,
    cafeSlug: normalizeSlug(input.cafeSlug),
    cafeDisplayName: normalizeText(input.cafeDisplayName),
    ownerFullName: normalizeText(input.ownerFullName),
    ownerPhone: normalizeText(input.ownerPhone),
    ownerPassword: String(input.ownerPassword ?? ''),
    subscriptionStartsAt: input.subscriptionStartsAt ? normalizeText(input.subscriptionStartsAt) : null,
    subscriptionEndsAt: input.subscriptionEndsAt ? normalizeText(input.subscriptionEndsAt) : null,
    subscriptionGraceDays: Number(input.subscriptionGraceDays ?? 0),
    subscriptionStatus: input.subscriptionStatus,
    subscriptionAmountPaid: Number(input.subscriptionAmountPaid ?? 0),
    subscriptionIsComplimentary: input.subscriptionIsComplimentary === true,
    subscriptionNotes: input.subscriptionNotes ? normalizeText(input.subscriptionNotes) : null,
    databaseKey: normalizeDatabaseKey(input.databaseKey),
  };
}

export async function createCafeWithOwnerOnControlPlane(
  session: PlatformAdminSession,
  rawInput: CreateCafeWithOwnerInput,
): Promise<CreateCafeWithOwnerResult> {
  const input = normalizeInput(rawInput);
  let createdCafeId = '';

  try {
    await assertDatabaseKeyIsActive(input.databaseKey);

    const createdCafe = await insertCafe(input.cafeSlug, input.cafeDisplayName);
    createdCafeId = createdCafe.id;

    await assignDatabase(session, createdCafe.id, input.databaseKey);
    const ownerUserId = await createOwner(session, createdCafe.id, input);
    const subscriptionId = await createSubscription(session, createdCafe.id, input);
    await writeCafeAuditEvent(session, createdCafe.id, ownerUserId, subscriptionId, input);

    return {
      cafeId: createdCafe.id,
      ownerUserId,
      subscriptionId,
      slug: createdCafe.slug,
      databaseKey: input.databaseKey,
    };
  } catch (error) {
    if (createdCafeId) {
      await cleanupCafeCreate(createdCafeId);
    }

    if (isPostgrestError(error) && error.code === '23505' && maybeMessage(error).includes('ops_cafes_slug_key')) {
      throw new Error('cafe_slug_already_exists');
    }

    throw error;
  }
}
