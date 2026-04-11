type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const opsMemoryCache = new Map<string, CacheEntry<unknown>>();
const opsInFlightCache = new Map<string, Promise<unknown>>();

export function buildOpsCacheKey(prefix: string, cafeId: string, databaseKey: string) {
  return `${prefix}:${databaseKey}:${cafeId}`;
}

export async function readThroughOpsCache<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const cached = opsMemoryCache.get(key) as CacheEntry<T> | undefined;
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  if (cached && cached.expiresAt <= now) {
    opsMemoryCache.delete(key);
  }

  const pending = opsInFlightCache.get(key) as Promise<T> | undefined;
  if (pending) {
    return pending;
  }

  const request = (async () => {
    try {
      const value = await loader();
      opsMemoryCache.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    } finally {
      opsInFlightCache.delete(key);
    }
  })();

  opsInFlightCache.set(key, request);
  return request;
}

export function invalidateOpsCacheKeys(keys: readonly string[]) {
  for (const key of keys) {
    opsMemoryCache.delete(key);
    opsInFlightCache.delete(key);
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

  for (const key of Array.from(opsInFlightCache.keys())) {
    if (prefixes.some((prefix) => key.startsWith(prefix))) {
      opsInFlightCache.delete(key);
    }
  }
}

export function invalidateMenuWorkspaceCaches(cafeId: string, databaseKey: string) {
  invalidateOpsCacheKeys([
    buildOpsCacheKey('menu-workspace', cafeId, databaseKey),
    buildOpsCacheKey('active-menu', cafeId, databaseKey),
    buildOpsCacheKey('active-menu-scope:all', cafeId, databaseKey),
    buildOpsCacheKey('active-menu-scope:barista', cafeId, databaseKey),
    buildOpsCacheKey('active-menu-scope:shisha', cafeId, databaseKey),
    buildOpsCacheKey('active-menu-scope:barista,shisha', cafeId, databaseKey),
  ]);
}
