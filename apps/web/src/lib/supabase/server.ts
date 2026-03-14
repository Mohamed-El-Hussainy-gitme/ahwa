import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { assertSupabasePublicEnv } from './env';

export async function supabaseServer() {
  const { url, publicKey } = assertSupabasePublicEnv('supabaseServer');
  const cookieStore = await cookies();

  return createServerClient(url, publicKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      },
    },
  });
}
