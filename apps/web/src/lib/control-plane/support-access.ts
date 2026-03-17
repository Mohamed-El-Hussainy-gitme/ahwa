import 'server-only';

import { cookies } from 'next/headers';
import { controlPlaneAdmin } from '@/lib/control-plane/admin';
import {
  PLATFORM_SUPPORT_COOKIE,
  decodePlatformSupportSession,
  isPlatformSupportSessionExpired,
  type PlatformSupportScope,
  type PlatformSupportSession,
} from '@/lib/platform-support/session';
import { requirePlatformAdmin } from '@/app/api/platform/_auth';

export type SupportAccessStatus = 'requested' | 'active' | 'closed' | 'revoked' | 'expired';

export type SupportAccessRow = {
  id: string;
  super_admin_user_id: string;
  super_admin_email?: string | null;
  cafe_id: string;
  cafe_slug?: string | null;
  cafe_display_name?: string | null;
  database_key: string;
  support_message_id?: string | null;
  scope: PlatformSupportScope;
  reason: string;
  status: SupportAccessStatus;
  requested_at: string;
  activated_at: string | null;
  expires_at: string;
  closed_at: string | null;
  closed_note: string | null;
  updated_at: string;
};

export async function requestSupportAccess(params: {
  superAdminUserId: string;
  cafeId: string;
  reason: string;
  scope?: PlatformSupportScope;
  supportMessageId?: string | null;
  durationMinutes?: number;
}) {
  const { data, error } = await controlPlaneAdmin().rpc('control_request_support_access', {
    p_super_admin_user_id: params.superAdminUserId,
    p_cafe_id: params.cafeId,
    p_reason: params.reason,
    p_scope: params.scope ?? 'diagnostic',
    p_support_message_id: params.supportMessageId ?? null,
    p_duration_minutes: params.durationMinutes ?? 60,
  });
  if (error) throw error;
  return data as Record<string, unknown>;
}

export async function activateSupportAccess(params: {
  requestId: string;
  superAdminUserId: string;
}) {
  const { data, error } = await controlPlaneAdmin().rpc('control_activate_support_access', {
    p_request_id: params.requestId,
    p_super_admin_user_id: params.superAdminUserId,
  });
  if (error) throw error;
  return data as Record<string, unknown>;
}

export async function closeSupportAccess(params: {
  requestId: string;
  superAdminUserId: string;
  closeNote?: string | null;
}) {
  const { data, error } = await controlPlaneAdmin().rpc('control_close_support_access', {
    p_request_id: params.requestId,
    p_super_admin_user_id: params.superAdminUserId,
    p_close_note: params.closeNote ?? null,
  });
  if (error) throw error;
  return data as Record<string, unknown>;
}

export async function listSupportAccessRequests(params: {
  superAdminUserId?: string | null;
  cafeId?: string | null;
  status?: SupportAccessStatus | null;
  limit?: number;
}) {
  const { data, error } = await controlPlaneAdmin().rpc('control_list_support_access_requests', {
    p_super_admin_user_id: params.superAdminUserId ?? null,
    p_cafe_id: params.cafeId ?? null,
    p_status: params.status ?? null,
    p_limit: params.limit ?? 20,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as SupportAccessRow[];
}

export async function readCurrentPlatformSupportSession(): Promise<PlatformSupportSession | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(PLATFORM_SUPPORT_COOKIE)?.value;
  const session = decodePlatformSupportSession(raw);
  if (!session || isPlatformSupportSessionExpired(session)) {
    return null;
  }
  return session;
}

export async function readValidatedPlatformSupportContext() {
  const platformAdmin = await requirePlatformAdmin();
  const supportSession = await readCurrentPlatformSupportSession();
  if (!supportSession) {
    return { platformAdmin, supportSession: null, supportAccess: null as SupportAccessRow | null };
  }
  if (supportSession.superAdminUserId !== platformAdmin.superAdminUserId) {
    return { platformAdmin, supportSession: null, supportAccess: null as SupportAccessRow | null };
  }

  const accessRows = await listSupportAccessRequests({
    superAdminUserId: platformAdmin.superAdminUserId,
    cafeId: supportSession.cafeId,
    status: 'active',
    limit: 10,
  });

  const supportAccess = accessRows.find((item) => item.id === supportSession.requestId) ?? null;
  if (!supportAccess) {
    return { platformAdmin, supportSession: null, supportAccess: null as SupportAccessRow | null };
  }

  return { platformAdmin, supportSession, supportAccess };
}
