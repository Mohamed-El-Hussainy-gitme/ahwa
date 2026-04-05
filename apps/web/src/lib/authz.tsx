"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "@/lib/session";
import { getOpsRealtimeSnapshot, isOpsRealtimeHealthy, subscribeOpsRealtime } from '@/lib/ops/realtime';
import {
  resolveEffectiveRole,
  resolvePermissions,
  type AuthzFlags,
  type RuntimeShift,
  type RuntimeViewer,
  type ShiftRole,
} from "@/lib/authz/policy";

export type AuthzState = {
  user: RuntimeViewer | null;
  shift: RuntimeShift | null;
  effectiveRole: ShiftRole | null;
  can: AuthzFlags;
  reload: () => Promise<void>;
};

const AuthzCtx = createContext<AuthzState | null>(null);

const authzCache = new Map<string, { shift: RuntimeShift | null; loadedAt: number }>();

const SHIFT_STALE_TIME_MS = 30_000;
const SHIFT_REALTIME_DEBOUNCE_MS = 180;
const SHIFT_POLL_INTERVAL_MS = 60_000;

type ShiftApi = {
  ok: boolean;
  shift: null | {
    id: string;
    kind: "morning" | "evening";
    startedAt: number;
    endedAt: number | null;
    isOpen: boolean;
    supervisorUserId: string | null;
  };
  assignments: Array<{ userId: string; role: ShiftRole }>;
};

export function AuthzProvider({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const [shift, setShift] = useState<RuntimeShift | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const queuedRef = useRef(false);
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLoadedAtRef = useRef<number | null>(null);

  useEffect(() => {
    lastLoadedAtRef.current = lastLoadedAt;
  }, [lastLoadedAt]);

  const clearReloadTimer = useCallback(() => {
    if (reloadTimerRef.current) {
      clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = null;
    }
  }, []);

  const runReload = useCallback(async () => {
    if (!session.user) {
      setShift(null);
      setLastLoadedAt(null);
      setLoading(false);
      return;
    }

    if (inFlightRef.current) {
      queuedRef.current = true;
      return inFlightRef.current;
    }

    const request = (async () => {
      try {
        const res = await fetch("/api/authz/state", { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as ShiftApi | null;
        const loadedAt = Date.now();

        if (!json?.ok || !json.shift) {
          setShift(null);
          setLastLoadedAt(loadedAt);
          if (session.user?.id) {
            authzCache.set(session.user.id, { shift: null, loadedAt });
          }
          return;
        }

        const nextShift = {
          id: json.shift.id,
          kind: json.shift.kind,
          startedAt: Number(json.shift.startedAt),
          endedAt: json.shift.endedAt ? Number(json.shift.endedAt) : undefined,
          isOpen: !!json.shift.isOpen,
          supervisorUserId: String(json.shift.supervisorUserId ?? ""),
          assignments: (json.assignments ?? []).map((item) => ({ userId: item.userId, role: item.role })),
        };

        setShift(nextShift);
        setLastLoadedAt(loadedAt);
        if (session.user?.id) {
          authzCache.set(session.user.id, { shift: nextShift, loadedAt });
        }
      } catch {
        setShift((current) => current);
      } finally {
        setLoading(false);
        inFlightRef.current = null;
        if (queuedRef.current) {
          queuedRef.current = false;
          void runReload();
        }
      }
    })();

    inFlightRef.current = request;
    return request;
  }, [session.user]);

  const shouldRevalidate = useCallback(() => {
    if (lastLoadedAtRef.current === null) {
      return true;
    }
    return Date.now() - lastLoadedAtRef.current >= SHIFT_STALE_TIME_MS;
  }, []);

  const shouldUsePollingFallback = useCallback(() => !isOpsRealtimeHealthy(getOpsRealtimeSnapshot()), []);

  useEffect(() => {
    if (!session.user?.id) {
      setShift(null);
      setLoading(false);
      setLastLoadedAt(null);
      return;
    }

    const cached = authzCache.get(session.user.id);
    if (cached && Date.now() - cached.loadedAt < SHIFT_STALE_TIME_MS) {
      setShift(cached.shift);
      setLoading(false);
      setLastLoadedAt(cached.loadedAt);
      return;
    }

    setLoading(true);
    void runReload();
  }, [runReload, session.user?.id, session.user?.cafeId]);

  useEffect(() => {
    if (!session.user) return;

    const scheduleReload = () => {
      clearReloadTimer();
      reloadTimerRef.current = setTimeout(() => {
        reloadTimerRef.current = null;
        void runReload();
      }, SHIFT_REALTIME_DEBOUNCE_MS);
    };

    const unsubscribe = subscribeOpsRealtime((event) => {
      if (event.type.startsWith('shift.') || event.type.startsWith('runtime.')) {
        scheduleReload();
      }
    });

    const onFocus = () => {
      if (shouldRevalidate() && shouldUsePollingFallback()) {
        scheduleReload();
      }
    };
    const onVis = () => {
      if (document.visibilityState === "visible" && shouldRevalidate() && shouldUsePollingFallback()) {
        scheduleReload();
      }
    };

    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      if (!shouldUsePollingFallback()) {
        return;
      }
      if (!shouldRevalidate()) {
        return;
      }
      void runReload();
    }, SHIFT_POLL_INTERVAL_MS);

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      unsubscribe();
      clearReloadTimer();
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [clearReloadTimer, runReload, session.user, shouldRevalidate, shouldUsePollingFallback]);

  const user = useMemo<RuntimeViewer | null>(() => {
    if (!session.user) return null;
    return {
      id: session.user.id,
      name: session.user.name,
      cafeId: session.user.cafeId,
      baseRole: session.user.baseRole,
    };
  }, [session.user]);

  const effectiveRole = useMemo(
    () => resolveEffectiveRole({ user, shift, ownerViewRole: session.ownerViewRole }),
    [user, shift, session.ownerViewRole]
  );

  const can = useMemo(() => resolvePermissions({ user, effectiveRole }), [user, effectiveRole]);

  const reload = useCallback(async () => {
    await runReload();
  }, [runReload]);

  const value = useMemo<AuthzState>(
    () => ({ user, shift, effectiveRole, can, reload }),
    [user, shift, effectiveRole, can, reload]
  );

  if (loading) {
    return <div className="min-h-dvh grid place-items-center text-sm text-neutral-500">تحميل...</div>;
  }

  return <AuthzCtx.Provider value={value}>{children}</AuthzCtx.Provider>;
}

export function useAuthz() {
  const value = useContext(AuthzCtx);
  if (!value) throw new Error("useAuthz must be used inside AuthzProvider");
  return value;
}
