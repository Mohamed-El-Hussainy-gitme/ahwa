/**
 * Centralized Supabase env resolver.
 *
 * Canonical env contract after phase 6 cleanup:
 * - Control plane server/admin:
 *   - CONTROL_PLANE_SUPABASE_URL
 *   - CONTROL_PLANE_SUPABASE_PUBLISHABLE_KEY
 *   - CONTROL_PLANE_SUPABASE_SECRET_KEY
 * - Operational databases (keyed by database_key token):
 *   - AHWA_OPERATIONAL_DATABASE__<TOKEN>__URL
 *   - AHWA_OPERATIONAL_DATABASE__<TOKEN>__PUBLISHABLE_KEY
 *   - AHWA_OPERATIONAL_DATABASE__<TOKEN>__SECRET_KEY
 * - Default operational database key:
 *   - AHWA_DEFAULT_OPERATIONAL_DATABASE_KEY (defaults to ops-db-01)
 *
 * Compatibility fallback is still supported internally for migration only:
 * - Legacy public/service keys
 * - Base NEXT_PUBLIC_SUPABASE_* / SUPABASE_SECRET_KEY
 */

type NamedValue = {
  value: string;
  sourceKey: string | null;
  legacy: boolean;
};

export type SupabasePublicEnv = {
  url: string;
  publicKey: string;
  urlSourceKey: string | null;
  publicKeySourceKey: string | null;
  usingLegacyPublicKey: boolean;
};

export type SupabaseAdminEnv = SupabasePublicEnv & {
  adminKey: string;
  adminKeySourceKey: string | null;
  usingLegacyAdminKey: boolean;
};

export type NamedSupabaseConfig = SupabaseAdminEnv & {
  scope: 'base' | 'control_plane' | 'operational_database';
  databaseKey?: string;
  envToken?: string;
};

function pickFirstNonEmpty(keys: readonly string[]): NamedValue {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return {
        value,
        sourceKey: key,
        legacy:
          key.includes('ANON_KEY') ||
          key.includes('SERVICE_ROLE_KEY') ||
          key === 'SUPABASE_URL' ||
          key === 'SUPABASE_PUBLISHABLE_KEY' ||
          key === 'SUPABASE_SECRET_KEY',
      };
    }
  }

  return { value: '', sourceKey: null, legacy: false };
}

function buildPublicEnv(urlKeys: readonly string[], publicKeys: readonly string[]): SupabasePublicEnv {
  const url = pickFirstNonEmpty(urlKeys);
  const publicKey = pickFirstNonEmpty(publicKeys);

  return {
    url: url.value,
    publicKey: publicKey.value,
    urlSourceKey: url.sourceKey,
    publicKeySourceKey: publicKey.sourceKey,
    usingLegacyPublicKey: publicKey.legacy,
  };
}

function buildAdminEnv(
  urlKeys: readonly string[],
  publicKeys: readonly string[],
  adminKeys: readonly string[],
): SupabaseAdminEnv {
  const base = buildPublicEnv(urlKeys, publicKeys);
  const adminKey = pickFirstNonEmpty(adminKeys);

  return {
    ...base,
    adminKey: adminKey.value,
    adminKeySourceKey: adminKey.sourceKey,
    usingLegacyAdminKey: adminKey.legacy,
  };
}

export function normalizeOperationalDatabaseEnvToken(databaseKey: string): string {
  return databaseKey
    .trim()
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

export function getDefaultOperationalDatabaseKey(): string {
  return process.env.AHWA_DEFAULT_OPERATIONAL_DATABASE_KEY?.trim() || 'ops-db-01';
}

export function getSupabaseUrl(): string {
  return getDefaultOperationalSupabasePublicEnv().url;
}

export function getSupabasePublicKey(): string {
  return getDefaultOperationalSupabasePublicEnv().publicKey;
}

export function getSupabaseAdminKey(): string {
  return getDefaultOperationalSupabaseAdminEnv().adminKey;
}

/**
 * Browser/runtime base client. Keep this optional and transition-only.
 * Current app runtime is server-first, so callers should avoid relying on this
 * for multi-db operational routing.
 */
export function getBaseSupabasePublicEnv(): SupabasePublicEnv {
  return buildPublicEnv(
    [
      'NEXT_PUBLIC_DEFAULT_OPERATIONAL_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_URL',
      'VITE_SUPABASE_URL',
      'SUPABASE_URL',
    ],
    [
      'NEXT_PUBLIC_DEFAULT_OPERATIONAL_SUPABASE_PUBLISHABLE_KEY',
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      'VITE_SUPABASE_PUBLISHABLE_KEY',
      'SUPABASE_PUBLISHABLE_KEY',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'VITE_SUPABASE_ANON_KEY',
      'SUPABASE_ANON_KEY',
    ],
  );
}

export function getBaseSupabaseAdminEnv(): SupabaseAdminEnv {
  return buildAdminEnv(
    [
      'NEXT_PUBLIC_DEFAULT_OPERATIONAL_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_URL',
      'VITE_SUPABASE_URL',
      'SUPABASE_URL',
    ],
    [
      'NEXT_PUBLIC_DEFAULT_OPERATIONAL_SUPABASE_PUBLISHABLE_KEY',
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      'VITE_SUPABASE_PUBLISHABLE_KEY',
      'SUPABASE_PUBLISHABLE_KEY',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'VITE_SUPABASE_ANON_KEY',
      'SUPABASE_ANON_KEY',
    ],
    ['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'],
  );
}

export function getControlPlaneSupabaseAdminEnv(): NamedSupabaseConfig {
  const env = buildAdminEnv(
    [
      'CONTROL_PLANE_SUPABASE_URL',
      'SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_URL',
      'VITE_SUPABASE_URL',
    ],
    [
      'CONTROL_PLANE_SUPABASE_PUBLISHABLE_KEY',
      'SUPABASE_PUBLISHABLE_KEY',
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      'VITE_SUPABASE_PUBLISHABLE_KEY',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'VITE_SUPABASE_ANON_KEY',
      'SUPABASE_ANON_KEY',
    ],
    [
      'CONTROL_PLANE_SUPABASE_SECRET_KEY',
      'CONTROL_PLANE_SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_SECRET_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
    ],
  );

  return {
    ...env,
    scope: 'control_plane',
  };
}

export function getOperationalDatabaseSupabaseAdminEnv(databaseKey: string): NamedSupabaseConfig {
  const envToken = normalizeOperationalDatabaseEnvToken(databaseKey);
  const prefix = `AHWA_OPERATIONAL_DATABASE__${envToken}__`;
  const env = buildAdminEnv(
    [
      `${prefix}URL`,
      'NEXT_PUBLIC_DEFAULT_OPERATIONAL_SUPABASE_URL',
      'SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_URL',
      'VITE_SUPABASE_URL',
    ],
    [
      `${prefix}PUBLISHABLE_KEY`,
      'NEXT_PUBLIC_DEFAULT_OPERATIONAL_SUPABASE_PUBLISHABLE_KEY',
      'SUPABASE_PUBLISHABLE_KEY',
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      'VITE_SUPABASE_PUBLISHABLE_KEY',
      `${prefix}ANON_KEY`,
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'VITE_SUPABASE_ANON_KEY',
      'SUPABASE_ANON_KEY',
    ],
    [
      `${prefix}SECRET_KEY`,
      `${prefix}SERVICE_ROLE_KEY`,
      'SUPABASE_SECRET_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
    ],
  );

  return {
    ...env,
    scope: 'operational_database',
    databaseKey,
    envToken,
  };
}

export function getDefaultOperationalSupabaseAdminEnv(): NamedSupabaseConfig {
  return getOperationalDatabaseSupabaseAdminEnv(getDefaultOperationalDatabaseKey());
}

export function getDefaultOperationalSupabasePublicEnv(): NamedSupabaseConfig {
  const env = getOperationalDatabaseSupabaseAdminEnv(getDefaultOperationalDatabaseKey());
  return {
    ...env,
    adminKey: '',
    adminKeySourceKey: null,
    usingLegacyAdminKey: false,
  };
}

export function listConfiguredOperationalDatabaseEnvTokens(): string[] {
  const prefix = 'AHWA_OPERATIONAL_DATABASE__';
  const suffix = '__URL';
  const tokens = new Set<string>();

  for (const key of Object.keys(process.env)) {
    if (key.startsWith(prefix) && key.endsWith(suffix)) {
      const token = key.slice(prefix.length, key.length - suffix.length).trim();
      if (token) tokens.add(token);
    }
  }

  return Array.from(tokens).sort((a, b) => a.localeCompare(b));
}

export function assertSupabasePublicEnv(where: string) {
  const { url, publicKey } = getBaseSupabasePublicEnv();
  const missing: string[] = [];

  if (!url) {
    missing.push(
      'NEXT_PUBLIC_DEFAULT_OPERATIONAL_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL',
    );
  }
  if (!publicKey) {
    missing.push(
      'NEXT_PUBLIC_DEFAULT_OPERATIONAL_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    );
  }

  if (missing.length) {
    throw new Error(`[${where}] Missing env: ${missing.join(', ')}`);
  }

  return { url, publicKey };
}

export function assertSupabaseAdminEnv(where: string) {
  const { url, publicKey, adminKey, databaseKey } = getDefaultOperationalSupabaseAdminEnv();
  const missing: string[] = [];

  if (!url) {
    missing.push(`AHWA_OPERATIONAL_DATABASE__${normalizeOperationalDatabaseEnvToken(databaseKey ?? getDefaultOperationalDatabaseKey())}__URL`);
  }
  if (!publicKey) {
    missing.push(`AHWA_OPERATIONAL_DATABASE__${normalizeOperationalDatabaseEnvToken(databaseKey ?? getDefaultOperationalDatabaseKey())}__PUBLISHABLE_KEY`);
  }
  if (!adminKey) {
    missing.push(`AHWA_OPERATIONAL_DATABASE__${normalizeOperationalDatabaseEnvToken(databaseKey ?? getDefaultOperationalDatabaseKey())}__SECRET_KEY`);
  }

  if (missing.length) {
    throw new Error(`[${where}] Missing env: ${missing.join(', ')}`);
  }

  return { url, publicKey, adminKey };
}

export function assertControlPlaneAdminEnv(where: string) {
  const { url, publicKey, adminKey } = getControlPlaneSupabaseAdminEnv();
  const missing: string[] = [];

  if (!url) missing.push('CONTROL_PLANE_SUPABASE_URL');
  if (!publicKey) missing.push('CONTROL_PLANE_SUPABASE_PUBLISHABLE_KEY');
  if (!adminKey) missing.push('CONTROL_PLANE_SUPABASE_SECRET_KEY');

  if (missing.length) {
    throw new Error(`[${where}] Missing env: ${missing.join(', ')}`);
  }

  return { url, publicKey, adminKey };
}
