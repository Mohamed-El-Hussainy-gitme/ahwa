import { createClient } from "@supabase/supabase-js";

/**
 * Browser client: MUST use NEXT_PUBLIC keys only.
 * IMPORTANT: use direct process.env.NEXT_PUBLIC_* access (no dynamic indexing)
 * so Next.js can inline env values into client bundle.
 */
export function supabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) throw new Error("[supabaseBrowser] Missing env: NEXT_PUBLIC_SUPABASE_URL");
  if (!anon) throw new Error("[supabaseBrowser] Missing env: NEXT_PUBLIC_SUPABASE_ANON_KEY");

  return createClient(url, anon, {
    auth: { persistSession: false },
  });
}
