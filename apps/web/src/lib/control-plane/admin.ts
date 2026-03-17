import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { assertControlPlaneAdminEnv } from '@/lib/supabase/env';

type AdminClient = SupabaseClient;

declare global {
  // eslint-disable-next-line no-var
  var __ahwaControlPlaneAdmin__: AdminClient | undefined;
}

export function controlPlaneAdmin(): AdminClient {
  if (globalThis.__ahwaControlPlaneAdmin__) {
    return globalThis.__ahwaControlPlaneAdmin__;
  }

  const { url, adminKey } = assertControlPlaneAdminEnv('controlPlaneAdmin');

  const client = createClient(url, adminKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  globalThis.__ahwaControlPlaneAdmin__ = client;
  return client;
}
