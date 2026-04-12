export type RuntimeAuthViewer = {
  accountKind?: 'owner' | 'employee' | 'staff' | null;
  shiftRole?: 'supervisor' | 'waiter' | 'american_waiter' | 'barista' | 'shisha' | null;
};

const AUTH_PREFIXES = ['/login', '/owner-login', '/owner-password'];
const CAFE_AUTH_PATH_PATTERN = /^\/c\/[^/]+\/(?:login|activate)(?:\/|$)/;

export function isRuntimeAuthPath(pathname: string): boolean {
  return AUTH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) || CAFE_AUTH_PATH_PATTERN.test(pathname);
}

export function normalizeRuntimeNext(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith('/')) return null;
  if (raw.startsWith('/api')) return null;
  if (isRuntimeAuthPath(raw)) return null;
  return raw;
}

export function resolveRuntimeHomePath(viewer: RuntimeAuthViewer): string {
  if (viewer.accountKind === 'owner' || viewer.shiftRole === 'supervisor') return '/dashboard';
  if (viewer.shiftRole === 'barista') return '/kitchen';
  if (viewer.shiftRole === 'shisha') return '/shisha';
  return '/orders';
}
