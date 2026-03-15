import { ensureCatalogMessage } from '@/lib/messages/catalog';
import { NextResponse } from 'next/server';

export class ApiRouteError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message = code, status = 400) {
    super(message);
    this.name = 'ApiRouteError';
    this.code = code;
    this.status = status;
  }
}

export function apiFail(status: number, code: string, message = code) {
  const resolvedMessage = ensureCatalogMessage(code, message);
  return NextResponse.json(
    {
      ok: false,
      error: {
        code,
        message: resolvedMessage,
      },
    },
    { status },
  );
}

export function apiJsonError(
  error: unknown,
  fallbackStatus = 400,
  fallbackCode = 'REQUEST_FAILED',
) {
  if (error instanceof ApiRouteError) {
    return apiFail(error.status, error.code, error.message);
  }

  if (error instanceof Error) {
    const code = error.message || fallbackCode;
    return apiFail(fallbackStatus, code, code);
  }

  return apiFail(fallbackStatus, fallbackCode, fallbackCode);
}
