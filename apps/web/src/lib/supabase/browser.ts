import { createClient } from '@supabase/supabase-js';
import { assertSupabasePublicEnv } from './env';

/**
 * Browser client: MUST use NEXT_PUBLIC keys only.
 */
export function supabaseBrowser() {
  const { url, publicKey } = assertSupabasePublicEnv('supabaseBrowser');

  return createClient(url, publicKey, {
    auth: { persistSession: false },
  });
}
