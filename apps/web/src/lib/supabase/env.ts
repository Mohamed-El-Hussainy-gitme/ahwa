/**
 * Centralized Supabase env resolver.
 *
 * Supported key shapes:
 * - Modern Supabase keys: publishable / secret
 * - Legacy Supabase keys: anon / service_role
 * - Vite-style names remain supported as a fallback for older local setups
 */

export function getSupabaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ''
  );
}

export function getSupabasePublicKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    ''
  );
}

export function getSupabaseAdminKey(): string {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

export function assertSupabasePublicEnv(where: string) {
  const url = getSupabaseUrl();
  const publicKey = getSupabasePublicKey();
  const missing: string[] = [];

  if (!url) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!publicKey) missing.push('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY');

  if (missing.length) {
    throw new Error(`[${where}] Missing env: ${missing.join(', ')}`);
  }

  return { url, publicKey };
}

export function assertSupabaseAdminEnv(where: string) {
  const { url, publicKey } = assertSupabasePublicEnv(where);
  const adminKey = getSupabaseAdminKey();

  if (!adminKey) {
    throw new Error(`[${where}] Missing env: SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY`);
  }

  return { url, publicKey, adminKey };
}
