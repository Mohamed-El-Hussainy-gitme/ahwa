import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { assertSupabasePublicEnv } from './env';

type CookieToSet = { name: string; value: string; options?: CookieOptions };

/**
 * Supabase server client for Next Route Handlers.
 */
export function createSupabaseRouteClient(req: NextRequest) {
  const { url, publicKey } = assertSupabasePublicEnv('createSupabaseRouteClient');
  const jar: CookieToSet[] = [];

  const supabase = createServerClient(url, publicKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        jar.push(...cookiesToSet);
      },
    },
  });

  const withCookies = (res: NextResponse) => {
    for (const c of jar) res.cookies.set(c.name, c.value, c.options);
    return res;
  };

  return { supabase, withCookies };
}
