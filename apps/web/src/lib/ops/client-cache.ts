import type { ApiReadCacheOptions } from '@/lib/http/client';
import { getDefaultTagsForOpsCacheKey } from './cache-tags';

export type ReadCacheOverride = {
  forceRefresh?: boolean;
};

export const READ_CACHE_TTL_MS = {
  waiter: 3_000,
  waiterCatalog: 180_000,
  waiterLive: 3_000,
  readyItems: 2_500,
  dashboard: 8_000,
  navSummary: 5_000,
  station: 2_500,
  billing: 5_000,
  complaints: 5_000,
  menu: 120_000,
  receipt: 30_000,
  reports: 20_000,
  deferredCustomers: 8_000,
  deferredLedger: 8_000,
  onboardingGuide: 300_000,
} as const;

export function buildReadCache(ttlMs: number, key?: string): ApiReadCacheOptions {
  return {
    ttlMs,
    key,
    tags: getDefaultTagsForOpsCacheKey(key),
  };
}

export function withReadCache(cache: ApiReadCacheOptions, override?: ReadCacheOverride): ApiReadCacheOptions {
  return { ...cache, forceRefresh: Boolean(override?.forceRefresh) };
}
