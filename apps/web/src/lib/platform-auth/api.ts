export type PlatformApiErrorObject = {
  code?: string;
  message?: string;
};

export type PlatformApiEnvelope<T = unknown> = {
  ok?: boolean;
  error?: string | PlatformApiErrorObject;
  data?: T;
  items?: unknown[];
  session?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function extractPlatformApiErrorMessage(payload: unknown, fallback: string): string {
  if (!isRecord(payload)) {
    return fallback;
  }

  const error = payload.error;

  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }

  if (isRecord(error)) {
    const message = error.message;
    if (typeof message === 'string' && message.trim().length > 0) {
      return message;
    }

    const code = error.code;
    if (typeof code === 'string' && code.trim().length > 0) {
      return code;
    }
  }

  return fallback;
}

export function isPlatformApiOk(payload: unknown): payload is { ok: true } {
  return isRecord(payload) && payload.ok === true;
}
