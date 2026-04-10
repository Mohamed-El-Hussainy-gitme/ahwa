import 'server-only';

import { encodeRuntimeSession, type RuntimeSessionPayload } from '@/lib/runtime/session';
import { type PlatformAdminSession } from '@/lib/platform-auth/session';
import { requireGrantedSupportAccess } from '@/lib/platform-support/access';
import { supabaseAdminForDatabase } from '@/lib/supabase/admin';

const MAX_SUPPORT_RUNTIME_SESSION_SECONDS = 60 * 60 * 12;

type SupportOwnerRow = {
  id: string;
  full_name: string;
  owner_label: 'owner' | 'partner' | 'branch_manager';
  created_at: string;
};

type CafeSlugRow = { slug: string };

function normalizeNextPath(value: string | null | undefined) {
  const next = String(value ?? '').trim();
  if (!next.startsWith('/')) return '/dashboard';
  if (next.startsWith('/api/') || next.startsWith('/platform')) return '/dashboard';
  return next;
}

function computeMaxAgeSeconds(expiresAt: string | null) {
  if (!expiresAt) return MAX_SUPPORT_RUNTIME_SESSION_SECONDS;
  const remainingSeconds = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
  if (!Number.isFinite(remainingSeconds)) return MAX_SUPPORT_RUNTIME_SESSION_SECONDS;
  return Math.max(60, Math.min(remainingSeconds, MAX_SUPPORT_RUNTIME_SESSION_SECONDS));
}

function selectSupportOwner(rows: SupportOwnerRow[]): SupportOwnerRow | null {
  if (!rows.length) return null;
  return rows.find((row) => row.owner_label === 'owner') ?? rows[0] ?? null;
}

export async function createPlatformSupportRuntimeSession(
  platformSession: PlatformAdminSession,
  messageId: string,
  nextPath?: string | null,
) {
  const access = await requireGrantedSupportAccess(platformSession.superAdminUserId, messageId.trim());
  const admin = supabaseAdminForDatabase(access.databaseKey).schema('ops');

  const [{ data: ownerRows, error: ownersError }, { data: cafeRow, error: cafeError }] = await Promise.all([
    admin
      .from('owner_users')
      .select('id,full_name,owner_label,created_at')
      .eq('cafe_id', access.cafeId)
      .eq('is_active', true)
      .order('created_at', { ascending: true }),
    admin
      .from('cafes')
      .select('slug')
      .eq('id', access.cafeId)
      .maybeSingle<CafeSlugRow>(),
  ]);

  if (ownersError) throw ownersError;
  if (cafeError) throw cafeError;

  const owner = selectSupportOwner((ownerRows ?? []) as SupportOwnerRow[]);
  if (!owner?.id) {
    throw new Error('SUPPORT_OWNER_NOT_FOUND');
  }

  const tenantSlug = String(cafeRow?.slug ?? access.cafeSlug ?? '').trim();
  if (!tenantSlug) {
    throw new Error('SUPPORT_CAFE_SLUG_NOT_FOUND');
  }

  const tokenPayload: RuntimeSessionPayload = {
    sessionVersion: 2,
    databaseKey: access.databaseKey,
    tenantId: access.cafeId,
    tenantSlug,
    userId: owner.id,
    fullName: `دعم فني — ${platformSession.displayName}`,
    accountKind: 'owner',
    ownerLabel: owner.owner_label,
    shiftId: null,
    shiftRole: null,
    actorOwnerId: owner.id,
    actorStaffId: null,
    supportAccess: {
      mode: 'platform_support',
      superAdminUserId: platformSession.superAdminUserId,
      messageId: access.messageId,
      grantId: access.grantId,
      expiresAt: access.expiresAt,
    },
  };

  return {
    token: encodeRuntimeSession(tokenPayload),
    access,
    owner,
    maxAgeSeconds: computeMaxAgeSeconds(access.expiresAt),
    redirectTo: normalizeNextPath(nextPath),
  };
}
