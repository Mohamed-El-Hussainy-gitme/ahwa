"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Shift, ShiftRole, UserProfile } from "@/domain/model";
import { useSession } from "@/lib/session";

export type AuthzState = {
  user: { id: string; name: string; baseRole: UserProfile["baseRole"]; cafeId: string } | null;
  shift: Shift | null;
  effectiveRole: ShiftRole | null;
  can: {
    owner: boolean;
    takeOrders: boolean;
    kitchen: boolean;
    billing: boolean;
    manageMenu: boolean;
    manageStaff: boolean;
    manageShifts: boolean;
  };
  reload: () => Promise<void>;
};

const AuthzCtx = createContext<AuthzState | null>(null);

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
  error?: string;
};

export function AuthzProvider({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const [shift, setShift] = useState<Shift | null>(null);
  const [loading, setLoading] = useState(true);

  async function reload() {
    const u = session.user;
    if (!u) {
      setShift(null);
      return;
    }

    try {
      const res = await fetch("/api/authz/state", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ShiftApi | null;

      if (!json?.ok) {
        setShift(null);
        return;
      }

      if (!json.shift) {
        setShift(null);
        return;
      }

      setShift({
        id: json.shift.id,
        kind: json.shift.kind,
        startedAt: Number(json.shift.startedAt),
        endedAt: json.shift.endedAt ? Number(json.shift.endedAt) : undefined,
        isOpen: !!json.shift.isOpen,
        supervisorUserId: String(json.shift.supervisorUserId ?? ""),
        assignments: (json.assignments ?? []).map((a) => ({ userId: a.userId, role: a.role })),
      });
    } catch {
      setShift(null);
    }
  }

  // initial + on user change
  useEffect(() => {
    (async () => {
      await reload();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.user?.id, session.user?.cafeId]);

  // keep shift state in sync (owner may open shift from another screen)
  useEffect(() => {
    if (!session.user) return;

    const onFocus = () => void reload();
    const onVis = () => {
      if (document.visibilityState === "visible") void reload();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);

    const t = window.setInterval(() => void reload(), 8000);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.user?.id, session.user?.cafeId]);

  const user = session.user;

  const effectiveRole = useMemo<ShiftRole | null>(() => {
    if (!user) return null;
    if (user.baseRole === "owner") return session.ownerViewRole;
    if (!shift) return null;
    const a = shift.assignments.find((x) => x.userId === user.id);
    return a?.role ?? null;
  }, [user, shift, session.ownerViewRole]);

  const can = useMemo(() => {
    const owner = !!user && user.baseRole === "owner";
    const takeOrders = owner || effectiveRole === "waiter" || effectiveRole === "supervisor";
    // supervisor = waiter + billing only (no kitchen)
    const kitchen = owner || effectiveRole === "barista" || effectiveRole === "shisha";
    const billing = owner || effectiveRole === "supervisor";
    const manageMenu = owner;
    const manageStaff = owner;
    const manageShifts = owner;
    return { owner, takeOrders, kitchen, billing, manageMenu, manageStaff, manageShifts };
  }, [user, effectiveRole]);

  const value = useMemo<AuthzState>(() => {
    return {
      user: user ? { id: user.id, name: user.name, baseRole: user.baseRole, cafeId: user.cafeId } : null,
      shift,
      effectiveRole,
      can,
      reload,
    };
  }, [user, shift, effectiveRole, can]);

  if (loading) {
    return <div className="min-h-dvh grid place-items-center text-sm text-neutral-500">تحميل...</div>;
  }

  return <AuthzCtx.Provider value={value}>{children}</AuthzCtx.Provider>;
}

export function useAuthz() {
  const v = useContext(AuthzCtx);
  if (!v) throw new Error("useAuthz must be used inside AuthzProvider");
  return v;
}
