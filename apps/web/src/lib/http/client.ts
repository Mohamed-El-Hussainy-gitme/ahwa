import { resolveMessage } from '@/lib/messages/catalog';

export type ApiErrorEnvelope = {
  ok?: false;
  error?: string | { code?: string; message?: string };
  message?: string;
};

type RequestCacheOptions = {
  ttlMs: number;
  key?: string;
};

type ApiPostOptions = {
  idempotency?: {
    scope: string;
  };
  readCache?: RequestCacheOptions;
};

type ApiGetOptions = {
  readCache?: RequestCacheOptions;
};

type ResponseCacheEntry = {
  payload: unknown;
  expiresAt: number;
};

const pendingIdempotentPosts = new Map<string, Promise<unknown>>();
const responseCache = new Map<string, ResponseCacheEntry>();
const pendingReadRequests = new Map<string, Promise<unknown>>();

function extractErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return 'REQUEST_FAILED';
  }

  const candidate = payload as ApiErrorEnvelope;

  if (typeof candidate.error === 'string' && candidate.error.trim()) {
    return resolveMessage(candidate.error);
  }

  if (candidate.error && typeof candidate.error === 'object') {
    if (typeof candidate.error.message === 'string' && candidate.error.message.trim()) {
      return resolveMessage(candidate.error.message);
    }
    if (typeof candidate.error.code === 'string' && candidate.error.code.trim()) {
      return resolveMessage(candidate.error.code);
    }
  }

  if (typeof candidate.message === 'string' && candidate.message.trim()) {
    return resolveMessage(candidate.message);
  }

  return resolveMessage('REQUEST_FAILED');
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return String(value);
  }

  if (typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

function buildIdempotencyFingerprint(scope: string, body: unknown) {
  return `${scope}|${stableStringify(body)}`;
}

function buildIdempotencyKey(scope: string) {
  const uuid = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${scope}:${uuid}`.slice(0, 180);
}

function buildReadCacheKey(method: 'GET' | 'POST', path: string, body: unknown, cacheOptions?: RequestCacheOptions) {
  return cacheOptions?.key?.trim()
    ? `${method}:${cacheOptions.key.trim()}`
    : `${method}:${path}|${stableStringify(body)}`;
}

function readCachedPayload<T>(cacheKey: string | null): T | null {
  if (!cacheKey) {
    return null;
  }
  const cached = responseCache.get(cacheKey);
  if (!cached) {
    return null;
  }
  if (cached.expiresAt <= Date.now()) {
    responseCache.delete(cacheKey);
    return null;
  }
  return cached.payload as T;
}

function storeCachedPayload(cacheKey: string | null, ttlMs: number | undefined, payload: unknown) {
  if (!cacheKey || !ttlMs || ttlMs <= 0) {
    return;
  }
  responseCache.set(cacheKey, { payload, expiresAt: Date.now() + ttlMs });
}

export function clearApiRequestCache(prefix?: string) {
  if (!prefix) {
    responseCache.clear();
    pendingReadRequests.clear();
    return;
  }

  for (const key of Array.from(responseCache.keys())) {
    if (key.includes(prefix)) {
      responseCache.delete(key);
    }
  }

  for (const key of Array.from(pendingReadRequests.keys())) {
    if (key.includes(prefix)) {
      pendingReadRequests.delete(key);
    }
  }
}

async function performPost<T>(path: string, body: unknown = {}, options?: ApiPostOptions): Promise<T> {
  const readCacheKey = options?.readCache ? buildReadCacheKey('POST', path, body, options.readCache) : null;
  const cached = readCachedPayload<T>(readCacheKey);
  if (cached !== null) {
    return cached;
  }

  if (readCacheKey) {
    const pending = pendingReadRequests.get(readCacheKey) as Promise<T> | undefined;
    if (pending) {
      return pending;
    }
  }

  const execute = async () => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (options?.idempotency) {
      headers['x-ahwa-idempotency-key'] = buildIdempotencyKey(options.idempotency.scope);
    }

    const response = await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    const payload: unknown = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(extractErrorMessage(payload));
    }

    storeCachedPayload(readCacheKey, options?.readCache?.ttlMs, payload);
    return payload as T;
  };

  const request = execute().finally(() => {
    if (readCacheKey) {
      pendingReadRequests.delete(readCacheKey);
    }
  });

  if (readCacheKey) {
    pendingReadRequests.set(readCacheKey, request as Promise<unknown>);
  }

  return request;
}

export async function apiPost<T>(path: string, body: unknown = {}, options?: ApiPostOptions): Promise<T> {
  if (!options?.idempotency) {
    return performPost<T>(path, body, options);
  }

  const fingerprint = buildIdempotencyFingerprint(options.idempotency.scope, body);
  const existing = pendingIdempotentPosts.get(fingerprint) as Promise<T> | undefined;
  if (existing) {
    return existing;
  }

  const request = performPost<T>(path, body, options).finally(() => {
    pendingIdempotentPosts.delete(fingerprint);
  });

  pendingIdempotentPosts.set(fingerprint, request as Promise<unknown>);
  return request;
}

export async function apiGet<T>(path: string, options?: ApiGetOptions): Promise<T> {
  const readCacheKey = options?.readCache ? buildReadCacheKey('GET', path, null, options.readCache) : null;
  const cached = readCachedPayload<T>(readCacheKey);
  if (cached !== null) {
    return cached;
  }

  if (readCacheKey) {
    const pending = pendingReadRequests.get(readCacheKey) as Promise<T> | undefined;
    if (pending) {
      return pending;
    }
  }

  const request = (async () => {
    const response = await fetch(path, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });

    const payload: unknown = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(extractErrorMessage(payload));
    }

    storeCachedPayload(readCacheKey, options?.readCache?.ttlMs, payload);
    return payload as T;
  })().finally(() => {
    if (readCacheKey) {
      pendingReadRequests.delete(readCacheKey);
    }
  });

  if (readCacheKey) {
    pendingReadRequests.set(readCacheKey, request as Promise<unknown>);
  }

  return request;
}
