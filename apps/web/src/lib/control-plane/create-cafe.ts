import 'server-only';
import type { PostgrestError } from '@supabase/supabase-js';
import { normalizeCafeSlug } from '@/lib/cafes/slug';
import { controlPlaneAdmin } from '@/lib/control-plane/admin';
import type { PlatformAdminSession } from '@/lib/platform-auth/session';
import { isOperationalDatabaseConfigured } from '@/lib/supabase/env';

export type CreateCafeWithOwnerInput = {
  cafeSlug: string;
  cafeDisplayName: string;
  ownerFullName: string;
  ownerPhone: string;
  ownerLabel?: 'owner' | 'partner' | 'branch_manager';
  ownerPassword?: string;
  subscriptionStartsAt: string | null;
  subscriptionEndsAt: string | null;
  subscriptionGraceDays: number;
  subscriptionStatus: 'trial' | 'active' | 'expired' | 'suspended';
  subscriptionAmountPaid: number;
  subscriptionIsComplimentary: boolean;
  subscriptionNotes: string | null;
  databaseKey: string;
  cafeLoadTier: 'small' | 'medium' | 'heavy' | 'enterprise';
};

type CreatedCafeRow = {
  id: string;
  slug: string;
};

type CreatedSubscriptionRow = {
  id: string;
};

type PasswordSetupInvite = {
  passwordSetupCode: string | null;
  passwordSetupExpiresAt: string | null;
  passwordState: string;
};

type RpcCreateOwnerResponse = {
  owner_user_id?: string | null;
  password_setup_code?: string | null;
  password_setup_expires_at?: string | null;
  password_state?: string | null;
};

type RpcCreateCafeResponse = {
  ok?: boolean | null;
  cafe_id?: string | null;
  owner_user_id?: string | null;
  subscription_id?: string | null;
  slug?: string | null;
  database_key?: string | null;
  password_setup_code?: string | null;
  password_setup_expires_at?: string | null;
  password_state?: string | null;
};

export type CreateCafeWithOwnerResult = {
  cafeId: string;
  ownerUserId: string;
  subscriptionId: string | null;
  slug: string;
  databaseKey: string;
  passwordSetupCode: string | null;
  passwordSetupExpiresAt: string | null;
  ownerPasswordState: string;
};

const VALID_SUBSCRIPTION_STATUSES = new Set(['trial', 'active', 'expired', 'suspended']);

function normalizeText(value: string | null | undefined): string {
  return String(value ?? '').trim();
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

function isMissingCreateCafeRpc(error: unknown): boolean {
  if (!isPostgrestError(error)) return false;
  const message = maybeMessage(error).toLowerCase();
  return message.includes('platform_create_cafe_with_owner') && (message.includes('not found') || message.includes('does not exist') || message.includes('could not find'));
}

function normalizeInvite(payload: { password_setup_code?: string | null; password_setup_expires_at?: string | null; password_state?: string | null } | null | undefined): PasswordSetupInvite {
  return {
    passwordSetupCode: normalizeText(payload?.password_setup_code) || null,
    passwordSetupExpiresAt: normalizeText(payload?.password_setup_expires_at) || null,
    passwordState: normalizeText(payload?.password_state) || 'setup_pending',
  };
}

async function createCafeWithOwnerViaRpc(
  session: PlatformAdminSession,
  input: CreateCafeWithOwnerInput,
): Promise<CreateCafeWithOwnerResult> {
  const { data, error } = await controlPlaneAdmin().rpc('platform_create_cafe_with_owner', {
    p_super_admin_user_id: session.superAdminUserId,
    p_cafe_slug: input.cafeSlug,
    p_cafe_display_name: input.cafeDisplayName,
    p_owner_full_name: input.ownerFullName,
    p_owner_phone: input.ownerPhone,
    p_owner_password: input.ownerPassword ?? '',
    p_subscription_starts_at: input.subscriptionStartsAt,
    p_subscription_ends_at: input.subscriptionEndsAt,
    p_subscription_grace_days: input.subscriptionGraceDays,
    p_subscription_status: input.subscriptionStatus,
    p_subscription_amount_paid: input.subscriptionAmountPaid,
    p_subscription_is_complimentary: input.subscriptionIsComplimentary,
    p_subscription_notes: input.subscriptionNotes,
    p_database_key: input.databaseKey || null,
    p_cafe_load_tier: input.cafeLoadTier,
    p_owner_label: input.ownerLabel ?? 'owner',
  });

  if (error) throw error;

  const payload = (data ?? null) as RpcCreateCafeResponse | null;
  const cafeId = normalizeText(payload?.cafe_id);
  const ownerUserId = normalizeText(payload?.owner_user_id);
  const slug = normalizeText(payload?.slug) || input.cafeSlug;
  const databaseKey = normalizeDatabaseKey(normalizeText(payload?.database_key) || input.databaseKey);
  const subscriptionId = normalizeText(payload?.subscription_id) || null;
  const invite = normalizeInvite(payload);

  if (!cafeId || !ownerUserId || !slug || !databaseKey) {
    throw new Error('CONTROL_PLANE_CREATE_CAFE_RESPONSE_INVALID');
  }

  return {
    cafeId,
    ownerUserId,
    subscriptionId,
    slug,
    databaseKey,
    passwordSetupCode: invite.passwordSetupCode,
    passwordSetupExpiresAt: invite.passwordSetupExpiresAt,
    ownerPasswordState: invite.passwordState,
  };
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

async function assertDatabaseKeyIsAvailable(databaseKey: string): Promise<void> {
  if (!databaseKey) {
    throw new Error('p_database_key is required');
  }

  if (!isOperationalDatabaseConfigured(databaseKey)) {
    throw new Error('operational_database_not_found');
  }
}

async function resolveDatabaseKeyForCreate(session: PlatformAdminSession, input: CreateCafeWithOwnerInput): Promise<string> {
  if (input.databaseKey) {
    await assertDatabaseKeyIsAvailable(input.databaseKey);
    return input.databaseKey;
  }

  const { data, error } = await controlPlaneAdmin().rpc('control_recommend_operational_database', {
    p_super_admin_user_id: session.superAdminUserId,
    p_cafe_load_tier: input.cafeLoadTier,
  });

  if (error) throw error;

  const databaseKey = normalizeDatabaseKey(
    data && typeof data === 'object' && 'database_key' in data ? String((data as { database_key?: string | null }).database_key ?? '') : '',
  );

  await assertDatabaseKeyIsAvailable(databaseKey);
  return databaseKey;
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

async function assignDatabase(session: PlatformAdminSession, cafeId: string, databaseKey: string, cafeLoadTier: CreateCafeWithOwnerInput['cafeLoadTier']): Promise<void> {
  const { error } = await controlPlaneAdmin().rpc('control_assign_cafe_database', {
    p_super_admin_user_id: session.superAdminUserId,
    p_cafe_id: cafeId,
    p_database_key: databaseKey,
    p_binding_source: 'manual',
    p_cafe_load_tier: cafeLoadTier,
  });

  if (error) throw error;
}

async function createOwner(
  session: PlatformAdminSession,
  cafeId: string,
  input: CreateCafeWithOwnerInput,
): Promise<{ ownerUserId: string } & PasswordSetupInvite> {
  const { data, error } = await controlPlaneAdmin().rpc('platform_create_owner_user', {
    p_super_admin_user_id: session.superAdminUserId,
    p_cafe_id: cafeId,
    p_full_name: input.ownerFullName,
    p_phone: input.ownerPhone,
    p_password: input.ownerPassword ?? '',
    p_owner_label: input.ownerLabel ?? 'owner',
  });

  if (error) throw error;

  const payload = (data ?? null) as RpcCreateOwnerResponse | null;
  const ownerUserId = normalizeText(payload?.owner_user_id);
  if (!ownerUserId) {
    throw new Error('CONTROL_PLANE_CREATE_OWNER_RESPONSE_INVALID');
  }

  return {
    ownerUserId,
    ...normalizeInvite(payload),
  };
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
  invite: PasswordSetupInvite,
): Promise<void> {
  const payload = {
    owner_user_id: ownerUserId,
    owner_phone: input.ownerPhone,
    owner_label: input.ownerLabel ?? 'owner',
    database_key: input.databaseKey,
    cafe_load_tier: input.cafeLoadTier,
    load_units: input.cafeLoadTier === 'enterprise' ? 15 : input.cafeLoadTier === 'heavy' ? 8 : input.cafeLoadTier === 'medium' ? 3 : 1,
    password_state: invite.passwordState,
    password_setup_expires_at: invite.passwordSetupExpiresAt,
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
    cafeSlug: normalizeCafeSlug(input.cafeSlug),
    cafeDisplayName: normalizeText(input.cafeDisplayName),
    ownerFullName: normalizeText(input.ownerFullName),
    ownerPhone: normalizeText(input.ownerPhone),
    ownerLabel: input.ownerLabel === 'partner' || input.ownerLabel === 'branch_manager' ? input.ownerLabel : 'owner',
    ownerPassword: normalizeText(input.ownerPassword),
    subscriptionStartsAt: input.subscriptionStartsAt ? normalizeText(input.subscriptionStartsAt) : null,
    subscriptionEndsAt: input.subscriptionEndsAt ? normalizeText(input.subscriptionEndsAt) : null,
    subscriptionGraceDays: Number(input.subscriptionGraceDays ?? 0),
    subscriptionStatus: input.subscriptionStatus,
    subscriptionAmountPaid: Number(input.subscriptionAmountPaid ?? 0),
    subscriptionIsComplimentary: input.subscriptionIsComplimentary === true,
    subscriptionNotes: input.subscriptionNotes ? normalizeText(input.subscriptionNotes) : null,
    databaseKey: normalizeDatabaseKey(input.databaseKey),
    cafeLoadTier: input.cafeLoadTier,
  };
}

export async function createCafeWithOwnerOnControlPlane(
  session: PlatformAdminSession,
  rawInput: CreateCafeWithOwnerInput,
): Promise<CreateCafeWithOwnerResult> {
  const input = normalizeInput(rawInput);
  let createdCafeId = '';

  try {
    input.databaseKey = await resolveDatabaseKeyForCreate(session, input);

    try {
      return await createCafeWithOwnerViaRpc(session, input);
    } catch (error) {
      if (!isMissingCreateCafeRpc(error)) {
        throw error;
      }
    }

    const createdCafe = await insertCafe(input.cafeSlug, input.cafeDisplayName);
    createdCafeId = createdCafe.id;

    await assignDatabase(session, createdCafe.id, input.databaseKey, input.cafeLoadTier);
    const createdOwner = await createOwner(session, createdCafe.id, input);
    const subscriptionId = await createSubscription(session, createdCafe.id, input);
    await writeCafeAuditEvent(session, createdCafe.id, createdOwner.ownerUserId, subscriptionId, input, createdOwner);

    return {
      cafeId: createdCafe.id,
      ownerUserId: createdOwner.ownerUserId,
      subscriptionId,
      slug: createdCafe.slug,
      databaseKey: input.databaseKey,
      passwordSetupCode: createdOwner.passwordSetupCode,
      passwordSetupExpiresAt: createdOwner.passwordSetupExpiresAt,
      ownerPasswordState: createdOwner.passwordState,
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
