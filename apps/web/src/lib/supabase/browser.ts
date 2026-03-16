import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { assertSupabasePublicEnv } from './env';

let browserClient: SupabaseClient | null = null;

/**
 * Browser client: MUST use NEXT_PUBLIC keys only.
 */
export function supabaseBrowser() {
  if (browserClient) {
    return browserClient;
  }

  const { url, publicKey } = assertSupabasePublicEnv('supabaseBrowser');

  browserClient = createClient(url, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return browserClient;
}
