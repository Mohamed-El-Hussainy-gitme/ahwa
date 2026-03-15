import { resolveMessage } from '@/lib/messages/catalog';
export type ApiErrorEnvelope = {
  ok?: false;
  error?: string | { code?: string; message?: string };
  message?: string;
};

type ApiPostOptions = {
  idempotency?: {
    scope: string;
  };
};

const pendingIdempotentPosts = new Map<string, Promise<unknown>>();

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

async function performPost<T>(path: string, body: unknown = {}, options?: ApiPostOptions): Promise<T> {
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

  return payload as T;
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


export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
  });

  const payload: unknown = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(extractErrorMessage(payload));
  }

  return payload as T;
}

