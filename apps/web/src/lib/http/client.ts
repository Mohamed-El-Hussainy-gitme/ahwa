export type ApiErrorEnvelope = {
  ok?: false;
  error?: string | { code?: string; message?: string };
  message?: string;
};

function extractErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return 'REQUEST_FAILED';
  }

  const candidate = payload as ApiErrorEnvelope;

  if (typeof candidate.error === 'string' && candidate.error.trim()) {
    return candidate.error;
  }

  if (candidate.error && typeof candidate.error === 'object') {
    if (typeof candidate.error.message === 'string' && candidate.error.message.trim()) {
      return candidate.error.message;
    }
    if (typeof candidate.error.code === 'string' && candidate.error.code.trim()) {
      return candidate.error.code;
    }
  }

  if (typeof candidate.message === 'string' && candidate.message.trim()) {
    return candidate.message;
  }

  return 'REQUEST_FAILED';
}

export async function apiPost<T>(path: string, body: unknown = {}): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  const payload: unknown = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(extractErrorMessage(payload));
  }

  return payload as T;
}
