const AUTH_PATHS = ['/login', '/owner-login', '/owner-password', '/platform/login', '/partner/login'];
const AUTH_CAFE_PATH = /^\/c\/[^/]+\/(?:login|activate)(?:\/|$)/;

function normalizeCandidate(value: string | null | undefined) {
  return String(value ?? '').trim();
}

export function isSafeRuntimeNextPath(value: string | null | undefined) {
  const candidate = normalizeCandidate(value);
  if (!candidate || !candidate.startsWith('/')) return false;
  if (candidate.startsWith('//')) return false;
  if (candidate.startsWith('/api/')) return false;
  if (AUTH_PATHS.some((path) => candidate === path || candidate.startsWith(`${path}/`))) return false;
  if (candidate.startsWith('/platform')) return false;
  if (AUTH_CAFE_PATH.test(candidate)) return false;
  return true;
}

export function resolveRuntimeNextPath(value: string | null | undefined) {
  const candidate = normalizeCandidate(value);
  return isSafeRuntimeNextPath(candidate) ? candidate : null;
}

export function getDefaultRuntimeHome(input?: { accountKind?: string | null; shiftRole?: string | null }) {
  if (input?.accountKind === 'owner' || input?.shiftRole === 'supervisor') return '/dashboard';
  if (input?.shiftRole === 'barista') return '/kitchen';
  if (input?.shiftRole === 'shisha') return '/shisha';
  return '/orders';
}
