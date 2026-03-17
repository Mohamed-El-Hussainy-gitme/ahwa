import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { assertOperationalDatabaseEnv } from './env';
import type { BoundRuntimeSessionPayload } from '@/lib/runtime/session';

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
  const normalizedDatabaseKey = databaseKey.trim();
  if (!normalizedDatabaseKey) {
    throw new Error('supabaseAdminForDatabase requires a databaseKey');
  }

  const cache = getAdminCache();
  if (cache.has(normalizedDatabaseKey)) {
    return cache.get(normalizedDatabaseKey)!;
  }

  const { url, adminKey } = assertOperationalDatabaseEnv(normalizedDatabaseKey, 'supabaseAdminForDatabase');
  const client = createClient(url, adminKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  cache.set(normalizedDatabaseKey, client);
  return client;
}

export function supabaseAdminForRuntimeSession(session: BoundRuntimeSessionPayload): AdminClient {
  return supabaseAdminForDatabase(session.databaseKey);
}
