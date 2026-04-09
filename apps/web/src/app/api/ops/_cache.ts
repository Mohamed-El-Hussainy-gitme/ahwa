type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const opsMemoryCache = new Map<string, CacheEntry<unknown>>();

export function buildOpsCacheKey(prefix: string, cafeId: string, databaseKey: string) {
  return `${prefix}:${databaseKey}:${cafeId}`;
}

export async function readThroughOpsCache<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const cached = opsMemoryCache.get(key) as CacheEntry<T> | undefined;
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const value = await loader();
  opsMemoryCache.set(key, { value, expiresAt: now + ttlMs });
  return value;
}

export function invalidateOpsCacheKeys(keys: readonly string[]) {
  for (const key of keys) {
    opsMemoryCache.delete(key);
  }
}

export function invalidateOpsCachePrefixes(prefixes: readonly string[]) {
  if (!prefixes.length) {
    return;
  }

  for (const key of Array.from(opsMemoryCache.keys())) {
    if (prefixes.some((prefix) => key.startsWith(prefix))) {
      opsMemoryCache.delete(key);
    }
  }
}

export function invalidateMenuWorkspaceCaches(cafeId: string, databaseKey: string) {
  invalidateOpsCacheKeys([
    buildOpsCacheKey('menu-workspace', cafeId, databaseKey),
    buildOpsCacheKey('active-menu', cafeId, databaseKey),
  ]);
}
