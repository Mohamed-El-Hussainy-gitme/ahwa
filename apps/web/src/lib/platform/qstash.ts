import 'server-only';

type EnqueueInternalRequestInput = {
  path: string;
  method?: 'GET' | 'POST';
  body?: unknown;
  retries?: number;
  delaySeconds?: number;
  timeoutSeconds?: number;
  dedupeKey?: string | null;
};

type QStashConfig = {
  enabled: boolean;
  apiUrl: string;
  token: string;
  baseUrl: string;
  forwardAuthorization: string;
  currentSigningKey: string;
  nextSigningKey: string;
};

function env(name: string) {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

function getBaseUrl() {
  return env('NEXT_PUBLIC_APP_URL').replace(/\/$/, '');
}

export function getQStashConfig(): QStashConfig {
  const token = env('QSTASH_TOKEN');
  const baseUrl = getBaseUrl();
  const cronSecret = env('CRON_SECRET');
  return {
    enabled: Boolean(token && baseUrl && cronSecret),
    apiUrl: 'https://qstash.upstash.io/v2/publish',
    token,
    baseUrl,
    forwardAuthorization: cronSecret ? `Bearer ${cronSecret}` : '',
    currentSigningKey: env('QSTASH_CURRENT_SIGNING_KEY'),
    nextSigningKey: env('QSTASH_NEXT_SIGNING_KEY'),
  };
}

export function isQStashConfigured() {
  return getQStashConfig().enabled;
}

export async function enqueueInternalRequestWithQStash(input: EnqueueInternalRequestInput) {
  const config = getQStashConfig();
  if (!config.enabled) {
    throw new Error('QSTASH_NOT_CONFIGURED');
  }

  const method = input.method ?? 'POST';
  const destination = new URL(input.path, `${config.baseUrl}/`).toString();
  const url = `${config.apiUrl}/${encodeURIComponent(destination)}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.token}`,
    'Upstash-Method': method,
    'Upstash-Forward-Authorization': config.forwardAuthorization,
  };

  if (typeof input.retries === 'number' && Number.isFinite(input.retries) && input.retries >= 0) {
    headers['Upstash-Retries'] = String(Math.trunc(input.retries));
  }
  if (typeof input.delaySeconds === 'number' && Number.isFinite(input.delaySeconds) && input.delaySeconds > 0) {
    headers['Upstash-Delay'] = `${Math.trunc(input.delaySeconds)}s`;
  }
  if (typeof input.timeoutSeconds === 'number' && Number.isFinite(input.timeoutSeconds) && input.timeoutSeconds > 0) {
    headers['Upstash-Timeout'] = `${Math.trunc(input.timeoutSeconds)}s`;
  }
  if (input.dedupeKey && String(input.dedupeKey).trim()) {
    headers['Upstash-Deduplication-Id'] = String(input.dedupeKey).trim();
  }

  let body: string | undefined;
  if (method === 'POST' && typeof input.body !== 'undefined') {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(input.body);
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body,
    cache: 'no-store',
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`QSTASH_ENQUEUE_FAILED:${response.status}:${text || 'UNKNOWN'}`);
  }

  return response.json().catch(() => ({ ok: true }));
}
