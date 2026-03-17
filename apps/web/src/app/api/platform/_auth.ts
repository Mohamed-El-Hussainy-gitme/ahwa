import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  decodePlatformAdminSession,
  PLATFORM_ADMIN_COOKIE,
  type PlatformAdminSession,
} from '@/lib/platform-auth/session';
import { getControlPlaneSupabaseAdminKey, getControlPlaneSupabaseUrl } from '@/lib/supabase/env';

type PlatformErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'INVALID_INPUT'
  | 'INVALID_INSTALL_TOKEN'
  | 'BOOTSTRAP_DISABLED'
  | 'REQUEST_FAILED'
  | 'PLATFORM_LOGIN_FAILED'
  | 'BAD_CREDENTIALS'
  | 'MISSING_CONTROL_PLANE_URL'
  | 'MISSING_CONTROL_PLANE_SECRET_KEY'
  | 'MISSING_SESSION_SECRET'
  | string;

export class PlatformApiError extends Error {
  readonly code: PlatformErrorCode;
  readonly status: number;

  constructor(code: PlatformErrorCode, message: string, status = 400) {
    super(message);
    this.name = 'PlatformApiError';
    this.code = code;
    this.status = status;
  }
}

export function platformOk<T>(body: T, status = 200) {
  return NextResponse.json({ ok: true, ...body }, { status });
}

export function platformFail(status: number, code: PlatformErrorCode, message: string) {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code,
        message,
      },
    },
    { status },
  );
}

export async function requirePlatformAdmin(): Promise<PlatformAdminSession> {
  const jar = await cookies();
  const session = decodePlatformAdminSession(jar.get(PLATFORM_ADMIN_COOKIE)?.value);

  if (!session) {
    throw new PlatformApiError('UNAUTHORIZED', 'Super admin authentication is required.', 401);
  }

  return session;
}

function platformErrorFromUnknown(error: unknown, fallbackStatus = 400): PlatformApiError {
  if (error instanceof PlatformApiError) {
    return error;
  }

  if (error instanceof Error) {
    if (error.message === 'AHWA_SESSION_SECRET is missing') {
      return new PlatformApiError(
        'MISSING_SESSION_SECRET',
        'AHWA_SESSION_SECRET is missing.',
        500,
      );
    }

    return new PlatformApiError('REQUEST_FAILED', error.message, fallbackStatus);
  }

  return new PlatformApiError('REQUEST_FAILED', 'REQUEST_FAILED', fallbackStatus);
}

export function platformJsonError(error: unknown, fallbackStatus = 400) {
  const normalized = platformErrorFromUnknown(error, fallbackStatus);
  return platformFail(normalized.status, normalized.code, normalized.message);
}

export function assertPlatformEnv() {
  if (!getControlPlaneSupabaseUrl()) {
    throw new PlatformApiError(
      'MISSING_CONTROL_PLANE_URL',
      'CONTROL_PLANE_SUPABASE_URL is missing.',
      500,
    );
  }

  if (!getControlPlaneSupabaseAdminKey()) {
    throw new PlatformApiError(
      'MISSING_CONTROL_PLANE_SECRET_KEY',
      'CONTROL_PLANE_SUPABASE_SECRET_KEY is missing.',
      500,
    );
  }

  if (!process.env.AHWA_SESSION_SECRET) {
    throw new PlatformApiError(
      'MISSING_SESSION_SECRET',
      'AHWA_SESSION_SECRET is missing.',
      500,
    );
  }
}

export function assertBootstrapAuthorized(request: Request, installToken?: string | null) {
  const configuredToken = process.env.AHWA_INSTALL_TOKEN?.trim() ?? '';
  const providedToken = request.headers.get('x-ahwa-install-token')?.trim() ?? installToken?.trim() ?? '';

  if (configuredToken) {
    if (!providedToken || providedToken !== configuredToken) {
      throw new PlatformApiError(
        'INVALID_INSTALL_TOKEN',
        'A valid install token is required for bootstrap.',
        401,
      );
    }
    return;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new PlatformApiError(
      'BOOTSTRAP_DISABLED',
      'Bootstrap is disabled until AHWA_INSTALL_TOKEN is configured.',
      403,
    );
  }
}
