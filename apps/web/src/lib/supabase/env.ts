/**
 * Centralized Supabase env resolver.
 *
 * Preferred production contract:
 * - CONTROL_PLANE_SUPABASE_*
 * - AHWA_DEFAULT_OPERATIONAL_DATABASE_KEY
 * - AHWA_OPERATIONAL_DATABASE__<TOKEN>__*
 *
 * Legacy/global names remain supported only as a fallback to avoid breaking
 * older local environments during migration.
 */

export type ResolvedSupabaseEnv = {
  url: string;
  publicKey: string;
  adminKey: string;
};

function upperToken(databaseKey: string): string {
  return databaseKey.trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase();
}

function envValue(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

export function normalizeDatabaseKeyToEnvToken(databaseKey: string): string {
  const normalized = upperToken(databaseKey);
  if (!normalized) {
    throw new Error('databaseKey is required');
  }
  return normalized;
}

export function getDefaultOperationalDatabaseKey(): string {
  return process.env.AHWA_DEFAULT_OPERATIONAL_DATABASE_KEY?.trim() || 'ops-db-01';
}

export function getLegacySupabaseUrl(): string {
  return envValue('NEXT_PUBLIC_SUPABASE_URL', 'VITE_SUPABASE_URL', 'SUPABASE_URL');
}

export function getLegacySupabasePublicKey(): string {
  return envValue(
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'VITE_SUPABASE_PUBLISHABLE_KEY',
    'VITE_SUPABASE_ANON_KEY',
    'SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_ANON_KEY',
  );
}

export function getLegacySupabaseAdminKey(): string {
  return envValue('SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY');
}

export function getControlPlaneSupabaseUrl(): string {
  return envValue('CONTROL_PLANE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'VITE_SUPABASE_URL', 'SUPABASE_URL');
}

export function getControlPlaneSupabasePublicKey(): string {
  return envValue(
    'CONTROL_PLANE_SUPABASE_PUBLISHABLE_KEY',
    'CONTROL_PLANE_SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'VITE_SUPABASE_PUBLISHABLE_KEY',
    'VITE_SUPABASE_ANON_KEY',
    'SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_ANON_KEY',
  );
}

export function getControlPlaneSupabaseAdminKey(): string {
  return envValue(
    'CONTROL_PLANE_SUPABASE_SECRET_KEY',
    'CONTROL_PLANE_SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_SECRET_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  );
}

export function getOperationalDatabaseUrl(databaseKey: string): string {
  const token = normalizeDatabaseKeyToEnvToken(databaseKey);
  const url = envValue(`AHWA_OPERATIONAL_DATABASE__${token}__URL`);
  if (url) return url;
  if (databaseKey === getDefaultOperationalDatabaseKey()) {
    return getLegacySupabaseUrl();
  }
  return '';
}

export function getOperationalDatabasePublicKey(databaseKey: string): string {
  const token = normalizeDatabaseKeyToEnvToken(databaseKey);
  const key = envValue(
    `AHWA_OPERATIONAL_DATABASE__${token}__PUBLISHABLE_KEY`,
    `AHWA_OPERATIONAL_DATABASE__${token}__ANON_KEY`,
  );
  if (key) return key;
  if (databaseKey === getDefaultOperationalDatabaseKey()) {
    return getLegacySupabasePublicKey();
  }
  return '';
}

export function getOperationalDatabaseAdminKey(databaseKey: string): string {
  const token = normalizeDatabaseKeyToEnvToken(databaseKey);
  const key = envValue(
    `AHWA_OPERATIONAL_DATABASE__${token}__SECRET_KEY`,
    `AHWA_OPERATIONAL_DATABASE__${token}__SERVICE_ROLE_KEY`,
  );
  if (key) return key;
  if (databaseKey === getDefaultOperationalDatabaseKey()) {
    return getLegacySupabaseAdminKey();
  }
  return '';
}

export function assertControlPlaneEnv(where: string): ResolvedSupabaseEnv {
  const url = getControlPlaneSupabaseUrl();
  const publicKey = getControlPlaneSupabasePublicKey();
  const adminKey = getControlPlaneSupabaseAdminKey();
  const missing: string[] = [];

  if (!url) missing.push('CONTROL_PLANE_SUPABASE_URL');
  if (!publicKey) missing.push('CONTROL_PLANE_SUPABASE_PUBLISHABLE_KEY');
  if (!adminKey) missing.push('CONTROL_PLANE_SUPABASE_SECRET_KEY');

  if (missing.length) {
    throw new Error(`[${where}] Missing env: ${missing.join(', ')}`);
  }

  return { url, publicKey, adminKey };
}

export function assertOperationalDatabaseEnv(databaseKey: string, where: string): ResolvedSupabaseEnv {
  const url = getOperationalDatabaseUrl(databaseKey);
  const publicKey = getOperationalDatabasePublicKey(databaseKey);
  const adminKey = getOperationalDatabaseAdminKey(databaseKey);
  const token = normalizeDatabaseKeyToEnvToken(databaseKey);
  const missing: string[] = [];

  if (!url) missing.push(`AHWA_OPERATIONAL_DATABASE__${token}__URL`);
  if (!publicKey) missing.push(`AHWA_OPERATIONAL_DATABASE__${token}__PUBLISHABLE_KEY`);
  if (!adminKey) missing.push(`AHWA_OPERATIONAL_DATABASE__${token}__SECRET_KEY`);

  if (missing.length) {
    throw new Error(`[${where}] Missing env for ${databaseKey}: ${missing.join(', ')}`);
  }

  return { url, publicKey, adminKey };
}

/**
 * Browser-only fallback for any remaining client-side Supabase usage.
 * This is not the canonical multi-DB production contract.
 */
export function assertSupabasePublicEnv(where: string) {
  const url = getLegacySupabaseUrl();
  const publicKey = getLegacySupabasePublicKey();
  const missing: string[] = [];

  if (!url) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!publicKey) missing.push('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY');

  if (missing.length) {
    throw new Error(`[${where}] Missing env: ${missing.join(', ')}`);
  }

  return { url, publicKey };
}

export function assertSupabaseAdminEnv(where: string) {
  return assertOperationalDatabaseEnv(getDefaultOperationalDatabaseKey(), where);
}
