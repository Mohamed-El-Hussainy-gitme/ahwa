import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

/**
 * Supabase server client for Next Route Handlers.
 *
 * Why this exists:
 * - In Route Handlers, writing cookies via next/headers `cookies()` is easy to get wrong.
 * - This helper captures any cookies Supabase wants to set, then applies them to the returned NextResponse.
 */
export function createSupabaseRouteClient(req: NextRequest) {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL;
  const anon =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error(
      "Missing Supabase env vars: need NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY (or VITE_/SUPABASE_ equivalents)"
    );
  }

  const jar: CookieToSet[] = [];

  const supabase = createServerClient(url, anon, {
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
