"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BaseRole } from "@/lib/authz/policy";

export type SessionUser = {
  id: string; // canonical runtime actor id (owner_user.id or staff_member.id)
  cafeId: string;
  cafeName?: string;
  cafeSlug?: string;
  name: string;
  baseRole: BaseRole;
};

type SessionState = {
  user: SessionUser | null;
  ownerViewRole: "supervisor" | "waiter" | "american_waiter" | "barista" | "shisha";
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
