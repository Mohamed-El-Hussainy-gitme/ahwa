import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  assertSupabaseAdminEnv,
  getDefaultOperationalDatabaseKey,
  getOperationalDatabaseSupabaseAdminEnv,
} from './env';

type AdminClient = SupabaseClient;

declare global {
  // eslint-disable-next-line no-var
  var __ahwaSupabaseAdmins__: Map<string, AdminClient> | undefined;
}

function getAdminCache(): Map<string, AdminClient> {
  if (!globalThis.__ahwaSupabaseAdmins__) {
    globalThis.__ahwaSupabaseAdmins__ = new Map<string, AdminClient>();
  }
  return globalThis.__ahwaSupabaseAdmins__;
}

export function supabaseAdmin(): AdminClient {
  return supabaseAdminForDatabase(getDefaultOperationalDatabaseKey());
}

export function supabaseAdminForDatabase(databaseKey: string): AdminClient {
  const normalizedKey = databaseKey.trim() || getDefaultOperationalDatabaseKey();
  const cache = getAdminCache();
  const cached = cache.get(normalizedKey);
  if (cached) return cached;

  const resolved = normalizedKey === getDefaultOperationalDatabaseKey()
    ? assertSupabaseAdminEnv('supabaseAdmin')
    : getOperationalDatabaseSupabaseAdminEnv(normalizedKey);

  if (!resolved.url || !resolved.adminKey) {
    const token = normalizedKey.replace(/[^A-Za-z0-9]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '').toUpperCase();
    throw new Error(
      `[supabaseAdminForDatabase] Missing env: AHWA_OPERATIONAL_DATABASE__${token}__URL, AHWA_OPERATIONAL_DATABASE__${token}__PUBLISHABLE_KEY, AHWA_OPERATIONAL_DATABASE__${token}__SECRET_KEY`,
    );
  }

  const client = createClient(resolved.url, resolved.adminKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  cache.set(normalizedKey, client);
  return client;
}
