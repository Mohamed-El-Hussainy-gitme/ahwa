import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { assertOperationalDatabaseEnv, getDefaultOperationalDatabaseKey } from './env';

type AdminClient = SupabaseClient;

declare global {
  // eslint-disable-next-line no-var
  var __ahwaSupabaseAdmins__: Map<string, AdminClient> | undefined;
}

function getAdminCache() {
  if (!globalThis.__ahwaSupabaseAdmins__) {
    globalThis.__ahwaSupabaseAdmins__ = new Map<string, AdminClient>();
  }
  return globalThis.__ahwaSupabaseAdmins__;
}

export function supabaseAdminForDatabase(databaseKey: string): AdminClient {
  const cache = getAdminCache();
  if (cache.has(databaseKey)) {
    return cache.get(databaseKey)!;
  }

  const { url, adminKey } = assertOperationalDatabaseEnv(databaseKey, 'supabaseAdminForDatabase');
  const client = createClient(url, adminKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  cache.set(databaseKey, client);
  return client;
}

export function supabaseAdmin(databaseKey = getDefaultOperationalDatabaseKey()): AdminClient {
  return supabaseAdminForDatabase(databaseKey);
}
