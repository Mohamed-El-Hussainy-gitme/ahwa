"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BaseRole } from "@/domain/model";

export type SessionUser = {
  id: string; // staff_profiles.id
  cafeId: string;
  name: string;
  baseRole: BaseRole;
};

type SessionState = {
  user: SessionUser | null;
  ownerViewRole: "supervisor" | "waiter" | "barista" | "shisha";
  setUser: (u: SessionUser | null) => void;
  logout: () => Promise<void>;
  setOwnerViewRole: (r: SessionState["ownerViewRole"]) => void;
};

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      user: null,
      ownerViewRole: "supervisor",
      setUser: (user) => set({ user }),
      logout: async () => {
        try {
          await fetch("/api/auth/logout", { method: "POST" });
        } catch {}
        set({ user: null });
      },
      setOwnerViewRole: (ownerViewRole) => set({ ownerViewRole }),
    }),
    { name: "ahwa.session.v2" }
  )
);
