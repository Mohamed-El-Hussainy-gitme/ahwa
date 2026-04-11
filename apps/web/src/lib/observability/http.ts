import crypto from 'node:crypto';
import { NextResponse } from 'next/server';

export const REQUEST_ID_HEADER = 'x-request-id';

export function getRequestIdFromHeaders(headersLike: Headers | { get(name: string): string | null | undefined }) {
  const existing = String(headersLike.get(REQUEST_ID_HEADER) ?? '').trim();
  return existing || crypto.randomUUID();
}

export function attachRequestId(response: NextResponse, requestId: string) {
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

export function jsonWithRequestId(body: unknown, requestId: string, init?: ResponseInit) {
  return attachRequestId(NextResponse.json(body, init), requestId);
}
