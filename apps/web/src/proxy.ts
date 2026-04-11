import crypto from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { PLATFORM_ADMIN_COOKIE } from '@/lib/platform-auth/session';
import { RUNTIME_SESSION_MAX_AGE_SECONDS } from '@/lib/runtime/session';

const RUNTIME_SESSION_COOKIE = 'ahwa_runtime_session';
const LEGACY_PLATFORM_SESSION_COOKIE = 'ahwa_platform_session';
const LAST_RUNTIME_PATH_COOKIE = 'ahwa_last_runtime_path';

function isPublicPath(path: string) {
  return (
    path === '/' ||
    path === '/login' ||
    path === '/owner-login' ||
    path === '/owner-password' ||
    path === '/partner/login' ||
    path === '/platform/login' ||
    /^\/c\/[^/]+\/?$/.test(path) ||
    /^\/c\/[^/]+\/(login|activate)\/?$/.test(path) ||
    path.startsWith('/api/auth/') ||
    path.startsWith('/api/public/') ||
    path.startsWith('/api/device-gate/') ||
    path === '/api/platform/auth/login' ||
    path === '/api/platform/bootstrap' ||
    path.startsWith('/_next/') ||
    path === '/favicon.ico' ||
    path === '/manifest.webmanifest' ||
    path === '/sw.js' ||
    path === '/icon-192x192.png' ||
    path === '/icon-512x512.png' ||
    path === '/apple-icon.png' ||
    path.startsWith('/brand/') ||
    path.startsWith('/og/')
  );
}

function isPlatformPath(path: string) {
  return (
    path.startsWith('/platform') ||
    (path.startsWith('/api/platform/') && path !== '/api/platform/auth/login' && path !== '/api/platform/bootstrap')
  );
}

function isRuntimeProtectedPath(path: string) {
  return (
    path.startsWith('/api/runtime/') ||
    path.startsWith('/api/owner/') ||
    path.startsWith('/api/authz/') ||
    path.startsWith('/dashboard') ||
    path.startsWith('/orders') ||
    path.startsWith('/billing') ||
    path.startsWith('/kitchen') ||
    path.startsWith('/shisha') ||
    path.startsWith('/customers') ||
    path.startsWith('/menu') ||
    path.startsWith('/reports') ||
    /^\/owner(?:\/|$)/.test(path) ||
    path.startsWith('/shift') ||
    path.startsWith('/staff')
  );
}

export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const runtimeSessionToken = req.cookies.get(RUNTIME_SESSION_COOKIE)?.value ?? '';
  const hasRuntimeSession = runtimeSessionToken.length > 0;
  const hasPlatformSession = !!req.cookies.get(PLATFORM_ADMIN_COOKIE)?.value || !!req.cookies.get(LEGACY_PLATFORM_SESSION_COOKIE)?.value;
  const requestId = req.headers.get('x-request-id')?.trim() || crypto.randomUUID();
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-request-id', requestId);

  const withRequestId = (response: NextResponse) => {
    response.headers.set('x-request-id', requestId);
    return response;
  };

  const nextResponse = () => withRequestId(NextResponse.next({ request: { headers: requestHeaders } }));

  const withRuntimeResume = (response: NextResponse) => {
    if (hasRuntimeSession) {
      response.cookies.set(RUNTIME_SESSION_COOKIE, runtimeSessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: RUNTIME_SESSION_MAX_AGE_SECONDS,
      });

      if (isRuntimeProtectedPath(path) && !path.startsWith('/api/')) {
        response.cookies.set(LAST_RUNTIME_PATH_COOKIE, `${path}${req.nextUrl.search}`, {
          httpOnly: false,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: RUNTIME_SESSION_MAX_AGE_SECONDS,
        });
      }
    }

    return withRequestId(response);
  };

  if (isPublicPath(path)) return withRuntimeResume(nextResponse());

  if (isPlatformPath(path)) {
    if (hasPlatformSession) return withRuntimeResume(nextResponse());
    const url = req.nextUrl.clone();
    url.pathname = '/platform/login';
    url.searchParams.set('next', path);
    return withRequestId(NextResponse.redirect(url));
  }

  if (isRuntimeProtectedPath(path)) {
    if (hasRuntimeSession) return withRuntimeResume(nextResponse());
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', path);
    return withRequestId(NextResponse.redirect(url));
  }

  if (!hasRuntimeSession && !hasPlatformSession) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', path);
    return withRequestId(NextResponse.redirect(url));
  }

  return withRuntimeResume(nextResponse());
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
