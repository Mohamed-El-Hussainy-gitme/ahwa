"use client";

import { AuthzProvider } from "@/lib/authz";
import { OpsChromeProvider } from "@/lib/ops/chrome";
import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession, type SessionUser } from "@/lib/session";

const TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const TOUCH_THROTTLE_MS = 60 * 1000;

export default function ClientProviders({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const setUser = useSession((s) => s.setUser);
  const router = useRouter();
  const pathname = usePathname();
  const lastTouchAtRef = useRef(0);
  const inFlightRef = useRef(false);

  useEffect(() => {
    setUser(user);
  }, [user, setUser]);

  useEffect(() => {
    let cancelled = false;

    async function touchSession(force = false) {
      const now = Date.now();
      if (!force && now - lastTouchAtRef.current < TOUCH_THROTTLE_MS) {
        return;
      }
      if (inFlightRef.current) {
        return;
      }

      inFlightRef.current = true;
      try {
        const res = await fetch('/api/auth/touch', {
          method: 'POST',
          credentials: 'include',
          cache: 'no-store',
        });

        if (!res.ok) {
          setUser(null);
          if (!cancelled) {
            const next = pathname && pathname !== '/' ? `?next=${encodeURIComponent(pathname)}` : '';
            router.replace(`/login${next}`);
          }
          return;
        }

        lastTouchAtRef.current = now;
      } catch {
        // ignore transient network failures; a later touch will retry
      } finally {
        inFlightRef.current = false;
      }
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void touchSession(true);
      }
    };

    const onActivity = () => {
      void touchSession(false);
    };

    void touchSession(true);

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void touchSession(true);
      }
    }, TOUCH_INTERVAL_MS);

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('pointerdown', onActivity, { passive: true });
    window.addEventListener('keydown', onActivity);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('pointerdown', onActivity);
      window.removeEventListener('keydown', onActivity);
    };
  }, [pathname, router, setUser]);

  return (
    <AuthzProvider>
      <OpsChromeProvider>{children}</OpsChromeProvider>
    </AuthzProvider>
  );
}
