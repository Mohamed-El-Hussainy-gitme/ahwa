import "server-only";
import { createClient } from "@supabase/supabase-js";

export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("[supabaseAdmin] Missing env: NEXT_PUBLIC_SUPABASE_URL");
  if (!service) throw new Error("[supabaseAdmin] Missing env: SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, service, {
    auth: { persistSession: false },
  });
}
