'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import {
  extractPlatformApiErrorMessage,
  isPlatformApiOk,
} from '@/lib/platform-auth/api';

type LoginApiSuccess = { ok: true };

type LoginApiErrorObject = {
  code?: string;
  message?: string;
};

type LoginApiErrorPayload = {
  ok?: false;
  error?: string | LoginApiErrorObject;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isLoginApiErrorObject(value: unknown): value is LoginApiErrorObject {
  if (!isRecord(value)) {
    return false;
  }

  const { code, message } = value;

  const isCodeValid = typeof code === 'undefined' || typeof code === 'string';
  const isMessageValid =
    typeof message === 'undefined' || typeof message === 'string';

  return isCodeValid && isMessageValid;
}

function isLoginApiSuccess(value: unknown): value is LoginApiSuccess {
  return isRecord(value) && value.ok === true;
}

function extractErrorMessage(payload: unknown): string {
  if (!isRecord(payload)) {
    return 'PLATFORM_LOGIN_FAILED';
  }

  const candidate = payload as LoginApiErrorPayload;

  if (typeof candidate.error === 'string' && candidate.error.trim().length > 0) {
    return candidate.error;
  }

  if (isLoginApiErrorObject(candidate.error)) {
    if (
      typeof candidate.error.message === 'string' &&
      candidate.error.message.trim().length > 0
    ) {
      return candidate.error.message;
    }

    if (
      typeof candidate.error.code === 'string' &&
      candidate.error.code.trim().length > 0
    ) {
      return candidate.error.code;
    }
  }

  return 'PLATFORM_LOGIN_FAILED';
}

function resolveNextPath(raw: string | null): string {
  if (!raw) {
    return '/platform';
  }

  if (!raw.startsWith('/')) {
    return '/platform';
  }

  if (raw.startsWith('//')) {
    return '/platform';
  }

  return raw;
}

export default function PlatformLoginClient() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function login() {
    setErr(null);
    setBusy(true);

    try {
      const res = await fetch('/api/platform/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const payload: unknown = await res.json().catch(() => ({}));

      if (!res.ok || !isLoginApiSuccess(payload)) {
        setErr(extractErrorMessage(payload));
        return;
      }

      const nextPath = resolveNextPath(searchParams.get('next'));

      // مهم: hard navigation حتى ترى الصفحة الجديدة الكوكي فورًا
      window.location.assign(nextPath);
    } catch {
      setErr('PLATFORM_LOGIN_FAILED');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-gradient-to-b from-slate-100 to-slate-50 p-4">
      <div className="w-full max-w-sm rounded-3xl border border-neutral-200/70 bg-white p-5 shadow-sm">
        <div className="text-xl font-semibold text-neutral-900">
          دخول السوبر أدمن
        </div>

        <div className="mt-4 space-y-2">
          <input
            dir="ltr"
            className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-3 text-left"
            placeholder="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-3 text-right"
            type="password"
            placeholder="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button
            onClick={login}
            disabled={busy}
            className="w-full rounded-2xl bg-neutral-900 px-4 py-3 font-semibold text-white disabled:opacity-60"
          >
            {busy ? '...' : 'دخول'}
          </button>

          {err ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {err}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}