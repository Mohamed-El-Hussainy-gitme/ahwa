/**
 * Canonical multi-database Supabase env resolver.
 *
 * Required production contract:
 * - CONTROL_PLANE_SUPABASE_*
 * - one or more AHWA_OPERATIONAL_DATABASE__<TOKEN>__* env groups
 *
 * Legacy/global NEXT_PUBLIC_* and SUPABASE_SECRET_KEY names are intentionally
 * unsupported here. Server-side and browser-side code must bind through the
 * control plane or an explicit operational database contract.
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


export function getControlPlaneSupabaseUrl(): string {
  return envValue('CONTROL_PLANE_SUPABASE_URL');
}

export function getControlPlaneSupabasePublicKey(): string {
  return envValue('CONTROL_PLANE_SUPABASE_PUBLISHABLE_KEY', 'CONTROL_PLANE_SUPABASE_ANON_KEY');
}

export function getControlPlaneSupabaseAdminKey(): string {
  return envValue('CONTROL_PLANE_SUPABASE_SECRET_KEY', 'CONTROL_PLANE_SUPABASE_SERVICE_ROLE_KEY');
}

export function getOperationalDatabaseUrl(databaseKey: string): string {
  const token = normalizeDatabaseKeyToEnvToken(databaseKey);
  return envValue(`AHWA_OPERATIONAL_DATABASE__${token}__URL`);
}

export function getOperationalDatabasePublicKey(databaseKey: string): string {
  const token = normalizeDatabaseKeyToEnvToken(databaseKey);
  return envValue(
    `AHWA_OPERATIONAL_DATABASE__${token}__PUBLISHABLE_KEY`,
    `AHWA_OPERATIONAL_DATABASE__${token}__ANON_KEY`,
  );
}

export function getOperationalDatabaseAdminKey(databaseKey: string): string {
  const token = normalizeDatabaseKeyToEnvToken(databaseKey);
  return envValue(
    `AHWA_OPERATIONAL_DATABASE__${token}__SECRET_KEY`,
    `AHWA_OPERATIONAL_DATABASE__${token}__SERVICE_ROLE_KEY`,
  );
}


export type ConfiguredOperationalDatabaseEnvOption = {
  databaseKey: string;
  token: string;
  url: string;
  publicKey: string;
  adminKey: string;
};

function databaseKeyFromEnvToken(token: string): string {
  return token.trim().toLowerCase().replace(/_+/g, '-');
}

export function listConfiguredOperationalDatabasesFromEnv(): ConfiguredOperationalDatabaseEnvOption[] {
  const prefix = 'AHWA_OPERATIONAL_DATABASE__';
  const grouped = new Map<string, Partial<ConfiguredOperationalDatabaseEnvOption>>();

  for (const [name, rawValue] of Object.entries(process.env)) {
    if (!name.startsWith(prefix)) continue;
    const value = typeof rawValue === 'string' ? rawValue.trim() : '';
    if (!value) continue;

    const remainder = name.slice(prefix.length);
    const separatorIndex = remainder.indexOf('__');
    if (separatorIndex <= 0) continue;

    const token = remainder.slice(0, separatorIndex).trim();
    const field = remainder.slice(separatorIndex + 2).trim();
    if (!token || !field) continue;

    const current = grouped.get(token) ?? { token, databaseKey: databaseKeyFromEnvToken(token) };

    if (field === 'URL') current.url = value;
    if (field === 'PUBLISHABLE_KEY' || field === 'ANON_KEY') current.publicKey = current.publicKey || value;
    if (field === 'SECRET_KEY' || field === 'SERVICE_ROLE_KEY') current.adminKey = current.adminKey || value;

    grouped.set(token, current);
  }

  return Array.from(grouped.values())
    .filter((item): item is ConfiguredOperationalDatabaseEnvOption => Boolean(item.databaseKey && item.token && item.url && item.publicKey && item.adminKey))
    .sort((a, b) => a.databaseKey.localeCompare(b.databaseKey));
}

export function isOperationalDatabaseConfigured(databaseKey: string): boolean {
  const normalized = databaseKey.trim();
  if (!normalized) return false;
  return !!(
    getOperationalDatabaseUrl(normalized) &&
    getOperationalDatabasePublicKey(normalized) &&
    getOperationalDatabaseAdminKey(normalized)
  );
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
  const normalizedDatabaseKey = databaseKey.trim();
  if (!normalizedDatabaseKey) {
    throw new Error(`[${where}] databaseKey is required`);
  }

  const url = getOperationalDatabaseUrl(normalizedDatabaseKey);
  const publicKey = getOperationalDatabasePublicKey(normalizedDatabaseKey);
  const adminKey = getOperationalDatabaseAdminKey(normalizedDatabaseKey);
  const token = normalizeDatabaseKeyToEnvToken(normalizedDatabaseKey);
  const missing: string[] = [];

  if (!url) missing.push(`AHWA_OPERATIONAL_DATABASE__${token}__URL`);
  if (!publicKey) missing.push(`AHWA_OPERATIONAL_DATABASE__${token}__PUBLISHABLE_KEY`);
  if (!adminKey) missing.push(`AHWA_OPERATIONAL_DATABASE__${token}__SECRET_KEY`);

  if (missing.length) {
    throw new Error(`[${where}] Missing env for ${normalizedDatabaseKey}: ${missing.join(', ')}`);
  }

  return { url, publicKey, adminKey };
}
