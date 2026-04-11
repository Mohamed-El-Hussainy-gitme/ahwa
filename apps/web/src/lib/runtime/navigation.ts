export type RuntimeRedirectUser = {
  accountKind: 'owner' | 'employee';
  shiftRole?: 'supervisor' | 'waiter' | 'barista' | 'shisha' | 'american_waiter' | null;
};

const BLOCKED_AUTH_PREFIXES = ['/login', '/owner-login', '/owner-password', '/platform'];

export function sanitizeRuntimeRelativePath(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  if (BLOCKED_AUTH_PREFIXES.some((prefix) => raw === prefix || raw.startsWith(`${prefix}/`) || raw.startsWith(`${prefix}?`))) {
    return null;
  }
  return raw;
}

export function resolveRuntimeHomePath(user: RuntimeRedirectUser): string {
  if (user.accountKind === 'owner' || user.shiftRole === 'supervisor') return '/dashboard';
  if (user.shiftRole === 'barista') return '/kitchen';
  if (user.shiftRole === 'shisha') return '/shisha';
  return '/orders';
}

export function resolveRuntimeAuthRedirectTarget(input: {
  user: RuntimeRedirectUser;
  nextPath?: string | null;
  resumePath?: string | null;
}): string {
  return (
    sanitizeRuntimeRelativePath(input.nextPath ?? null) ??
    sanitizeRuntimeRelativePath(input.resumePath ?? null) ??
    resolveRuntimeHomePath(input.user)
  );
}

export function shouldAutoResumeAuthPage(nextPath: string | null | undefined): boolean {
  return sanitizeRuntimeRelativePath(nextPath ?? null) !== null;
}
