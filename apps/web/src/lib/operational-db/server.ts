import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdminKey, getSupabasePublicKey, getSupabaseUrl } from '@/lib/supabase/env';
import {
  requireCafeOperationalRouteByCafeId,
  requireCafeOperationalRouteBySlug,
  type ControlPlaneCafeRoute,
} from '@/lib/control-plane/server';

export type OperationalDatabaseConfig = {
  databaseKey: string;
  url: string;
  publicKey: string;
  adminKey: string;
  source: 'mapped-env' | 'default-env';
};

type AdminClient = SupabaseClient;

const adminClientCache = new Map<string, AdminClient>();

function envTokenForDatabaseKey(databaseKey: string) {
  return databaseKey.trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase();
}

function readMappedOperationalEnv(databaseKey: string) {
  const token = envTokenForDatabaseKey(databaseKey);
  const url = process.env[`AHWA_OPERATIONAL_DATABASE__${token}__URL`] ?? '';
  const publicKey = process.env[`AHWA_OPERATIONAL_DATABASE__${token}__PUBLISHABLE_KEY`] ?? '';
  const adminKey =
    process.env[`AHWA_OPERATIONAL_DATABASE__${token}__SECRET_KEY`] ??
    process.env[`AHWA_OPERATIONAL_DATABASE__${token}__SERVICE_ROLE_KEY`] ??
    '';

  if (url && publicKey && adminKey) {
    return { url, publicKey, adminKey };
  }

  return null;
}

export function getOperationalDatabaseConfig(databaseKey: string): OperationalDatabaseConfig {
  const normalized = databaseKey.trim();
  if (!normalized) {
    throw new Error('DATABASE_KEY_REQUIRED');
  }

  const mapped = readMappedOperationalEnv(normalized);
  if (mapped) {
    return {
      databaseKey: normalized,
      url: mapped.url,
      publicKey: mapped.publicKey,
      adminKey: mapped.adminKey,
      source: 'mapped-env',
    };
  }

  const url = getSupabaseUrl();
  const publicKey = getSupabasePublicKey();
  const adminKey = getSupabaseAdminKey();
  if (!url || !publicKey || !adminKey) {
    throw new Error('DEFAULT_OPERATIONAL_DATABASE_ENV_MISSING');
  }

  return {
    databaseKey: normalized,
    url,
    publicKey,
    adminKey,
    source: 'default-env',
  };
}

export function getOperationalAdminClient(databaseKey: string): AdminClient {
  const config = getOperationalDatabaseConfig(databaseKey);
  const cacheKey = `${config.databaseKey}|${config.url}|${config.adminKey}`;
  const existing = adminClientCache.get(cacheKey);
  if (existing) return existing;

  const client = createClient(config.url, config.adminKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  adminClientCache.set(cacheKey, client);
  return client;
}

export function getOperationalAdminOpsClient(databaseKey: string) {
  return getOperationalAdminClient(databaseKey).schema('ops');
}

export async function getOperationalAdminClientForCafeSlug(slug: string): Promise<{ route: ControlPlaneCafeRoute; admin: AdminClient }> {
  const route = await requireCafeOperationalRouteBySlug(slug);
  return {
    route,
    admin: getOperationalAdminClient(route.databaseKey),
  };
}

export async function getOperationalAdminClientForCafeId(cafeId: string): Promise<{ route: ControlPlaneCafeRoute; admin: AdminClient }> {
  const route = await requireCafeOperationalRouteByCafeId(cafeId);
  return {
    route,
    admin: getOperationalAdminClient(route.databaseKey),
  };
}

export async function getOperationalAdminOpsClientForCafeId(cafeId: string) {
  const { route } = await getOperationalAdminClientForCafeId(cafeId);
  return {
    route,
    admin: getOperationalAdminOpsClient(route.databaseKey),
  };
}
