export type ApiErrorObject = {
  code?: string;
  message?: string;
};

export type ApiErrorEnvelope = {
  ok?: boolean;
  error?: string | ApiErrorObject;
  message?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isApiOk(payload: unknown): payload is { ok: true } {
  return isRecord(payload) && payload.ok === true;
}

export function extractApiErrorCode(
  payload: unknown,
  fallback = 'REQUEST_FAILED',
): string {
  if (!isRecord(payload)) {
    return fallback;
  }

  const error = payload.error;

  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }

  if (isRecord(error)) {
    if (typeof error.code === 'string' && error.code.trim().length > 0) {
      return error.code;
    }

    if (typeof error.message === 'string' && error.message.trim().length > 0) {
      return error.message;
    }
  }

  if (typeof payload.message === 'string' && payload.message.trim().length > 0) {
    return payload.message;
  }

  return fallback;
}

export function extractApiErrorMessage(
  payload: unknown,
  fallback = 'REQUEST_FAILED',
): string {
  if (!isRecord(payload)) {
    return fallback;
  }

  const error = payload.error;

  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }

  if (isRecord(error)) {
    if (typeof error.message === 'string' && error.message.trim().length > 0) {
      return error.message;
    }

    if (typeof error.code === 'string' && error.code.trim().length > 0) {
      return error.code;
    }
  }

  if (typeof payload.message === 'string' && payload.message.trim().length > 0) {
    return payload.message;
  }

  return fallback;
}
