import { createHmac, timingSafeEqual } from 'crypto';
import type { RuntimeSessionPayload } from '@/lib/runtime/session';
import { RUNTIME_LAST_PATH_STORAGE_KEY, RUNTIME_RESUME_STORAGE_KEY } from '@/lib/runtime/resume-storage';

export const RUNTIME_RESUME_MAX_AGE_SECONDS = 60 * 60 * 3;
export { RUNTIME_LAST_PATH_STORAGE_KEY, RUNTIME_RESUME_STORAGE_KEY };

export type RuntimeResumePayload = {
  session: RuntimeSessionPayload;
  exp: number;
  iat: number;
};

function getSecret(): string {
  const secret = process.env.AHWA_SESSION_SECRET;
  if (!secret) throw new Error('AHWA_SESSION_SECRET is missing');
  return `${secret}:resume`;
}

function sign(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload, 'utf8').digest('base64url');
}

export function encodeRuntimeResumeToken(session: RuntimeSessionPayload, ttlSeconds = RUNTIME_RESUME_MAX_AGE_SECONDS): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({ session, iat: now, exp: now + Math.max(1, Math.floor(ttlSeconds)) } satisfies RuntimeResumePayload),
    'utf8',
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function decodeRuntimeResumeToken(raw: string | null | undefined): RuntimeResumePayload | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = sign(payload);
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<RuntimeResumePayload>;
    if (!parsed || typeof parsed.iat !== 'number' || typeof parsed.exp !== 'number' || !parsed.session || typeof parsed.session !== 'object') {
      return null;
    }
    if (parsed.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    return {
      session: parsed.session as RuntimeSessionPayload,
      iat: parsed.iat,
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
}
