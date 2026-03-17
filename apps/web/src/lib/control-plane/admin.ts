import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminKey, getSupabasePublicKey, getSupabaseUrl } from "@/lib/supabase/env";

export type ControlPlaneConfig = {
  url: string;
  publicKey: string;
  adminKey: string;
  source: "mapped-env" | "default-env";
};

const adminClientCache = new Map<string, SupabaseClient>();

function readControlPlaneEnv() {
  const url = process.env.CONTROL_PLANE_SUPABASE_URL?.trim() ?? "";
  const publicKey = process.env.CONTROL_PLANE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
  const adminKey =
    process.env.CONTROL_PLANE_SUPABASE_SECRET_KEY?.trim() ??
    process.env.CONTROL_PLANE_SUPABASE_SERVICE_ROLE_KEY?.trim() ??
    "";

  if (url && publicKey && adminKey) {
    return { url, publicKey, adminKey };
  }

  return null;
}

export function getControlPlaneConfig(): ControlPlaneConfig {
  const mapped = readControlPlaneEnv();
  if (mapped) {
    return { ...mapped, source: "mapped-env" };
  }

  const url = getSupabaseUrl();
  const publicKey = getSupabasePublicKey();
  const adminKey = getSupabaseAdminKey();
  if (!url || !publicKey || !adminKey) {
    throw new Error("CONTROL_PLANE_ENV_MISSING");
  }

  return {
    url,
    publicKey,
    adminKey,
    source: "default-env",
  };
}

export function controlPlaneAdmin(): SupabaseClient {
  const config = getControlPlaneConfig();
  const cacheKey = `${config.url}|${config.adminKey}`;
  const existing = adminClientCache.get(cacheKey);
  if (existing) return existing;

  const client = createClient(config.url, config.adminKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  adminClientCache.set(cacheKey, client);
  return client;
}
