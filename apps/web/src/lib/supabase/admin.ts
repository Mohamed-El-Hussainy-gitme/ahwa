import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { assertSupabaseAdminEnv } from './env';

export function supabaseAdmin() {
  const { url, adminKey } = assertSupabaseAdminEnv('supabaseAdmin');

  return createClient(url, adminKey, {
    auth: { persistSession: false },
  });
}
