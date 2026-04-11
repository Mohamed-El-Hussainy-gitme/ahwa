'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  readRuntimeLastPath,
  readRuntimeResumeToken,
  writeRuntimeLastPath,
  writeRuntimeResumeToken,
} from '@/lib/runtime/resume-storage';

const AUTH_PREFIXES = ['/login', '/owner-login', '/owner-password'];
const CAFE_AUTH_PATH_PATTERN = /^\/c\/[^/]+\/(?:login|activate)(?:\/|$)/;

function isAuthPath(pathname: string) {
  return AUTH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) || CAFE_AUTH_PATH_PATTERN.test(pathname);
}

async function refreshResumeSession() {
  try {
    const response = await fetch('/api/auth/session/refresh', {
      cache: 'no-store',
      credentials: 'include',
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok || typeof payload.resumeToken !== 'string') {
      return false;
    }

    writeRuntimeResumeToken(payload.resumeToken);
    return true;
  } catch {
    return false;
  }
}

export default function SessionLifecycleClient() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const resumeBusyRef = useRef(false);

  useEffect(() => {
    const currentPath = `${pathname}${searchParams?.toString() ? `?${searchParams.toString()}` : ''}`;
    if (!isAuthPath(pathname) && !pathname.startsWith('/api')) {
      writeRuntimeLastPath(currentPath || '/');
    }
  }, [pathname, searchParams]);

  useEffect(() => {
    if (isAuthPath(pathname)) {
      const token = readRuntimeResumeToken();
      if (!token || resumeBusyRef.current) {
        return;
      }

      resumeBusyRef.current = true;
      void (async () => {
        try {
          const response = await fetch('/api/auth/session/resume', {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ token }),
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || !payload.ok || typeof payload.resumeToken !== 'string') {
            writeRuntimeResumeToken(null);
            return;
          }

          writeRuntimeResumeToken(payload.resumeToken);
          const next = searchParams?.get('next');
          const fallback = readRuntimeLastPath() || '/dashboard';
          const target = next && next.startsWith('/') ? next : fallback;
          router.replace(target);
          router.refresh();
        } finally {
          resumeBusyRef.current = false;
        }
      })();

      return;
    }

    let intervalId: number | null = null;

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void refreshResumeSession();
      }
    };

    const onFocus = () => {
      void refreshResumeSession();
    };

    void refreshResumeSession();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refreshResumeSession();
      }
    }, 10 * 60 * 1000);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, [pathname, router, searchParams]);

  return null;
}
