import crypto from 'node:crypto';

export type ServerObservation = {
  requestId: string;
  startedAt: number;
  name: string;
  details?: Record<string, unknown>;
};

type ObservabilityMode = 'error' | 'standard' | 'verbose';

function readMode(): ObservabilityMode {
  const value = String(process.env.AHWA_SERVER_OBSERVABILITY_MODE ?? 'standard').trim().toLowerCase();
  if (value === 'error' || value === 'verbose') return value;
  return 'standard';
}

function shouldLogBase() {
  const value = String(process.env.AHWA_SERVER_OBSERVABILITY_ENABLED ?? 'true').trim().toLowerCase();
  return !(value === '0' || value === 'false' || value === 'off');
}

function readSlowThresholdMs() {
  const parsed = Number(process.env.AHWA_SERVER_OBSERVABILITY_SLOW_MS ?? '750');
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : 750;
}

function shouldLogResult(result: 'ok' | 'error', durationMs: number) {
  if (!shouldLogBase()) return false;
  const mode = readMode();
  if (result === 'error') return true;
  if (mode === 'verbose') return true;
  if (mode === 'error') return false;
  return durationMs >= readSlowThresholdMs();
}

function safeString(value: unknown) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

function inferChannel(name: string) {
  if (name.startsWith('ops.outbox.')) return 'ops-outbox';
  if (name.startsWith('platform.')) return 'platform';
  if (name.startsWith('ops.events')) return 'ops-events';
  if (name.startsWith('public.')) return 'public';
  return 'app';
}

export function beginServerObservation(
  name: string,
  details?: Record<string, unknown>,
  requestId?: string | null,
): ServerObservation {
  return {
    requestId: safeString(requestId) ?? crypto.randomUUID(),
    startedAt: Date.now(),
    name,
    details,
  } satisfies ServerObservation;
}

export function logServerObservation(
  observation: ServerObservation,
  result: 'ok' | 'error',
  details?: Record<string, unknown>,
) {
  const durationMs = Date.now() - observation.startedAt;
  if (!shouldLogResult(result, durationMs)) return;
  const payload = {
    ts: new Date().toISOString(),
    requestId: observation.requestId,
    name: observation.name,
    channel: inferChannel(observation.name),
    result,
    durationMs,
    ...(observation.details ?? {}),
    ...(details ?? {}),
  };

  const line = JSON.stringify(payload);
  if (result === 'error') {
    console.error(line);
  } else {
    console.info(line);
  }
}
