import { NextResponse, type NextRequest } from 'next/server';
import { PLATFORM_ADMIN_COOKIE } from '@/lib/platform-auth/session';

const RUNTIME_SESSION_COOKIE = 'ahwa_runtime_session';
const LEGACY_PLATFORM_SESSION_COOKIE = 'ahwa_platform_session';

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
    (
      path.startsWith('/api/platform/') &&
      path !== '/api/platform/auth/login' &&
      path !== '/api/platform/bootstrap'
    )
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

  if (isPublicPath(path)) {
    return NextResponse.next();
  }

  const hasRuntimeSession = !!req.cookies.get(RUNTIME_SESSION_COOKIE)?.value;
  const hasPlatformSession =
    !!req.cookies.get(PLATFORM_ADMIN_COOKIE)?.value ||
    !!req.cookies.get(LEGACY_PLATFORM_SESSION_COOKIE)?.value;

  if (isPlatformPath(path)) {
    if (hasPlatformSession) {
      return NextResponse.next();
    }

    const url = req.nextUrl.clone();
    url.pathname = '/platform/login';
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }

  if (isRuntimeProtectedPath(path)) {
    if (hasRuntimeSession) {
      return NextResponse.next();
    }

    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }

  if (!hasRuntimeSession && !hasPlatformSession) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};