import crypto from 'node:crypto';

export type ServerObservation = {
  requestId: string;
  startedAt: number;
  name: string;
  details?: Record<string, unknown>;
};

function shouldLog() {
  const value = String(process.env.AHWA_SERVER_OBSERVABILITY_ENABLED ?? 'true').trim().toLowerCase();
  return !(value === '0' || value === 'false' || value === 'off');
}

function safeString(value: unknown) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
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
  if (!shouldLog()) return;
  const payload = {
    ts: new Date().toISOString(),
    requestId: observation.requestId,
    name: observation.name,
    result,
    durationMs: Date.now() - observation.startedAt,
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
