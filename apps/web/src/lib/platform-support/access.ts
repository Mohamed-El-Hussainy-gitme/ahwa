import 'server-only';

import {
  buildBillingWorkspace,
  buildComplaintsWorkspace,
  buildDashboardWorkspace,
  buildStationWorkspace,
  buildWaiterWorkspace,
} from '@/app/api/ops/_server';
import { resolveCafeDatabaseBinding } from '@/lib/control-plane/cafes';
import { controlPlaneAdmin } from '@/lib/control-plane/admin';
import { isOperationalDatabaseConfigured } from '@/lib/supabase/env';

type SupportAccessStatus = 'not_requested' | 'requested' | 'granted' | 'revoked' | 'expired';

type SupportMessageRow = {
  id: string;
  cafe_id: string | null;
  cafe_slug_snapshot: string | null;
  cafe_display_name_snapshot: string | null;
  support_access_requested: boolean | null;
  support_access_status: SupportAccessStatus | null;
  support_access_requested_at: string | null;
  support_access_granted_at: string | null;
  support_access_expires_at: string | null;
  support_access_revoked_at: string | null;
  support_access_note: string | null;
};

type SupportGrantRow = {
  id: string;
  cafe_id: string;
  support_message_id: string | null;
  notes: string | null;
  expires_at: string | null;
  created_at: string;
  revoked_at: string | null;
  is_active: boolean | null;
};

export type SupportAccessContext = {
  messageId: string;
  cafeId: string;
  cafeSlug: string | null;
  cafeDisplayName: string | null;
  databaseKey: string;
  bindingSource: string;
  bindingCreatedAt: string | null;
  bindingUpdatedAt: string | null;
  supportAccessRequested: boolean;
  supportAccessStatus: SupportAccessStatus;
  requestedAt: string | null;
  grantedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  note: string | null;
  grantId: string;
  grantCreatedAt: string;
};

function normalizeSupportAccessStatus(value: string | null | undefined, expiresAt: string | null | undefined): SupportAccessStatus {
  if (value === 'requested' || value === 'granted' || value === 'revoked' || value === 'expired') {
    if (value === 'granted' && expiresAt) {
      const expiresAtMs = new Date(expiresAt).getTime();
      if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
        return 'expired';
      }
    }
    return value;
  }
  return 'not_requested';
}

function isGrantActive(row: SupportGrantRow | null | undefined) {
  if (!row || !row.is_active || row.revoked_at) {
    return false;
  }

  if (!row.expires_at) {
    return true;
  }

  const expiresAtMs = new Date(row.expires_at).getTime();
  return Number.isFinite(expiresAtMs) && expiresAtMs > Date.now();
}

export async function loadSupportAccessContext(
  superAdminUserId: string,
  messageId: string,
): Promise<SupportAccessContext | null> {
  const admin = controlPlaneAdmin();
  const normalizedMessageId = messageId.trim();
  if (!normalizedMessageId) {
    return null;
  }

  const { data: messageData, error: messageError } = await admin
    .schema('platform')
    .from('support_messages')
    .select(
      'id,cafe_id,cafe_slug_snapshot,cafe_display_name_snapshot,support_access_requested,support_access_status,support_access_requested_at,support_access_granted_at,support_access_expires_at,support_access_revoked_at,support_access_note',
    )
    .eq('id', normalizedMessageId)
    .maybeSingle<SupportMessageRow>();

  if (messageError) {
    throw messageError;
  }

  if (!messageData?.id || !messageData.cafe_id) {
    return null;
  }

  const { data: grantData, error: grantError } = await admin
    .schema('platform')
    .from('support_access_grants')
    .select('id,cafe_id,support_message_id,notes,expires_at,created_at,revoked_at,is_active')
    .eq('super_admin_user_id', superAdminUserId)
    .eq('cafe_id', messageData.cafe_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<SupportGrantRow>();

  if (grantError) {
    throw grantError;
  }

  const binding = await resolveCafeDatabaseBinding(messageData.cafe_id);
  if (!binding || !isOperationalDatabaseConfigured(binding.databaseKey)) {
    throw new Error('SUPPORT_ACCESS_DATABASE_NOT_READY');
  }

  const effectiveStatus = normalizeSupportAccessStatus(
    messageData.support_access_status,
    messageData.support_access_expires_at,
  );

  if (!grantData?.id || !isGrantActive(grantData)) {
    return {
      messageId: messageData.id,
      cafeId: messageData.cafe_id,
      cafeSlug: messageData.cafe_slug_snapshot,
      cafeDisplayName: messageData.cafe_display_name_snapshot,
      databaseKey: binding.databaseKey,
      bindingSource: binding.bindingSource,
      bindingCreatedAt: binding.createdAt,
      bindingUpdatedAt: binding.updatedAt,
      supportAccessRequested: !!messageData.support_access_requested,
      supportAccessStatus: effectiveStatus,
      requestedAt: messageData.support_access_requested_at,
      grantedAt: messageData.support_access_granted_at,
      expiresAt: messageData.support_access_expires_at,
      revokedAt: messageData.support_access_revoked_at,
      note: messageData.support_access_note,
      grantId: '',
      grantCreatedAt: '',
    };
  }

  return {
    messageId: messageData.id,
    cafeId: messageData.cafe_id,
    cafeSlug: messageData.cafe_slug_snapshot,
    cafeDisplayName: messageData.cafe_display_name_snapshot,
    databaseKey: binding.databaseKey,
    bindingSource: binding.bindingSource,
    bindingCreatedAt: binding.createdAt,
    bindingUpdatedAt: binding.updatedAt,
    supportAccessRequested: !!messageData.support_access_requested,
    supportAccessStatus: effectiveStatus,
    requestedAt: messageData.support_access_requested_at,
    grantedAt: messageData.support_access_granted_at,
    expiresAt: messageData.support_access_expires_at,
    revokedAt: messageData.support_access_revoked_at,
    note: messageData.support_access_note ?? grantData.notes,
    grantId: grantData.id,
    grantCreatedAt: grantData.created_at,
  };
}

export async function requireGrantedSupportAccess(
  superAdminUserId: string,
  messageId: string,
): Promise<SupportAccessContext> {
  const context = await loadSupportAccessContext(superAdminUserId, messageId);
  if (!context) {
    throw new Error('SUPPORT_MESSAGE_NOT_FOUND');
  }

  if (!context.supportAccessRequested) {
    throw new Error('SUPPORT_ACCESS_NOT_REQUESTED');
  }

  if (!context.grantId || context.supportAccessStatus !== 'granted') {
    throw new Error('SUPPORT_ACCESS_NOT_GRANTED');
  }

  return context;
}

export async function buildPlatformSupportWorkspace(superAdminUserId: string, messageId: string) {
  const access = await requireGrantedSupportAccess(superAdminUserId, messageId);
  const [dashboard, waiter, baristaStation, shishaStation, billing, complaints] = await Promise.all([
    buildDashboardWorkspace(access.cafeId, access.databaseKey),
    buildWaiterWorkspace(access.cafeId, access.databaseKey),
    buildStationWorkspace(access.cafeId, 'barista', access.databaseKey),
    buildStationWorkspace(access.cafeId, 'shisha', access.databaseKey),
    buildBillingWorkspace(access.cafeId, access.databaseKey),
    buildComplaintsWorkspace(access.cafeId, access.databaseKey),
  ]);

  return {
    access,
    dashboard,
    waiter,
    stations: {
      barista: baristaStation,
      shisha: shishaStation,
    },
    billing,
    complaints,
  };
}
