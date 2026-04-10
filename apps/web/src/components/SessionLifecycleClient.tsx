'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { RUNTIME_LAST_PATH_STORAGE_KEY, RUNTIME_RESUME_STORAGE_KEY } from '@/lib/runtime/resume';

const AUTH_PREFIXES = ['/login', '/owner-login', '/owner-password'];

function isAuthPath(pathname: string) {
  return AUTH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function persistResumeToken(token: string | null) {
  if (typeof window === 'undefined') return;
  if (!token) {
    localStorage.removeItem(RUNTIME_RESUME_STORAGE_KEY);
    return;
  }
  localStorage.setItem(RUNTIME_RESUME_STORAGE_KEY, token);
}

async function refreshResumeSession() {
  try {
    const res = await fetch('/api/auth/session/refresh', { cache: 'no-store', credentials: 'include' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok || typeof json.resumeToken !== 'string') return false;
    persistResumeToken(json.resumeToken);
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
      localStorage.setItem(RUNTIME_LAST_PATH_STORAGE_KEY, currentPath || '/');
    }
  }, [pathname, searchParams]);

  useEffect(() => {
    if (isAuthPath(pathname)) {
      const token = localStorage.getItem(RUNTIME_RESUME_STORAGE_KEY);
      if (!token || resumeBusyRef.current) return;
      resumeBusyRef.current = true;
      void (async () => {
        try {
          const res = await fetch('/api/auth/session/resume', {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ token }),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok || !json.ok || typeof json.resumeToken !== 'string') {
            persistResumeToken(null);
            return;
          }
          persistResumeToken(json.resumeToken);
          const next = searchParams?.get('next');
          const fallback = localStorage.getItem(RUNTIME_LAST_PATH_STORAGE_KEY) || '/dashboard';
          const target = next && next.startsWith('/') ? next : fallback;
          router.replace(target);
          router.refresh();
        } finally {
          resumeBusyRef.current = false;
        }
      })();
      return;
    }

    let interval: number | null = null;
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
    interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refreshResumeSession();
      }
    }, 10 * 60 * 1000);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      if (interval) window.clearInterval(interval);
    };
  }, [pathname, router, searchParams]);

  return null;
}
