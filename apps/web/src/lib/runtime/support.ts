import 'server-only';

import type { SupportAccessContext } from '@/lib/platform-support/access';
import { requireGrantedSupportAccess } from '@/lib/platform-support/access';
import type { RuntimeSessionPayload } from '@/lib/runtime/session';

export type PlatformSupportRuntimeAccess = {
  mode: 'platform_support';
  superAdminUserId: string;
  messageId: string;
  grantId: string;
  expiresAt: string | null;
};

export class SupportRuntimeSessionError extends Error {
  readonly code: string;

  constructor(code: string, message = code) {
    super(message);
    this.name = 'SupportRuntimeSessionError';
    this.code = code;
  }
}

export function isSupportRuntimeSessionError(error: unknown): error is SupportRuntimeSessionError {
  return error instanceof SupportRuntimeSessionError;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function normalizePlatformSupportRuntimeAccess(value: unknown): PlatformSupportRuntimeAccess | undefined {
  if (!isRecord(value) || value.mode !== 'platform_support') return undefined;
  return {
    mode: 'platform_support',
    superAdminUserId: typeof value.superAdminUserId === 'string' ? value.superAdminUserId : '',
    messageId: typeof value.messageId === 'string' ? value.messageId : '',
    grantId: typeof value.grantId === 'string' ? value.grantId : '',
    expiresAt: typeof value.expiresAt === 'string' ? value.expiresAt : null,
  };
}

export function getPlatformSupportRuntimeAccess(session: RuntimeSessionPayload | null | undefined) {
  return normalizePlatformSupportRuntimeAccess(session?.supportAccess);
}

export async function validatePlatformSupportRuntimeAccess(
  session: RuntimeSessionPayload,
): Promise<SupportAccessContext | null> {
  const supportAccess = getPlatformSupportRuntimeAccess(session);
  if (!supportAccess) return null;

  if (
    session.accountKind !== 'owner' ||
    !session.actorOwnerId ||
    !supportAccess.superAdminUserId ||
    !supportAccess.messageId ||
    !supportAccess.grantId
  ) {
    throw new SupportRuntimeSessionError('SUPPORT_RUNTIME_SESSION_INVALID');
  }

  const context = await requireGrantedSupportAccess(supportAccess.superAdminUserId, supportAccess.messageId);

  if (context.grantId !== supportAccess.grantId) {
    throw new SupportRuntimeSessionError('SUPPORT_RUNTIME_SESSION_STALE');
  }

  if (context.cafeId !== session.tenantId) {
    throw new SupportRuntimeSessionError('SUPPORT_RUNTIME_CAFE_MISMATCH');
  }

  if (String(session.databaseKey ?? '').trim() !== context.databaseKey) {
    throw new SupportRuntimeSessionError('SUPPORT_RUNTIME_DATABASE_MISMATCH');
  }

  if (supportAccess.expiresAt && context.expiresAt && supportAccess.expiresAt !== context.expiresAt) {
    throw new SupportRuntimeSessionError('SUPPORT_RUNTIME_SESSION_STALE');
  }

  return context;
}
