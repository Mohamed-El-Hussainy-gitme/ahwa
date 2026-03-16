import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { assertSupabaseAdminEnv } from './env';

type AdminClient = SupabaseClient;

declare global {
  // eslint-disable-next-line no-var
  var __ahwaSupabaseAdmin__: AdminClient | undefined;
}

export function supabaseAdmin(): AdminClient {
  if (globalThis.__ahwaSupabaseAdmin__) {
    return globalThis.__ahwaSupabaseAdmin__;
  }

  const { url, adminKey } = assertSupabaseAdminEnv('supabaseAdmin');

  const client = createClient(url, adminKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  globalThis.__ahwaSupabaseAdmin__ = client;
  return client;
}
