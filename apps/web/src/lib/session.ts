"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BaseRole } from "@/lib/authz/policy";
import { RUNTIME_LAST_PATH_STORAGE_KEY, RUNTIME_RESUME_STORAGE_KEY } from "@/lib/runtime/resume";

export type SessionUser = {
  id: string; // canonical runtime actor id (owner_user.id or staff_member.id)
  cafeId: string;
  cafeName?: string;
  cafeSlug?: string;
  name: string;
  baseRole: BaseRole;
  ownerLabel?: 'owner' | 'partner' | 'branch_manager';
};

type SessionState = {
  user: SessionUser | null;
  ownerViewRole: "supervisor" | "waiter" | "barista" | "shisha" | "american_waiter";
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
        if (typeof window !== 'undefined') {
          localStorage.removeItem(RUNTIME_RESUME_STORAGE_KEY);
          localStorage.removeItem(RUNTIME_LAST_PATH_STORAGE_KEY);
        }
        set({ user: null });
      },
      setOwnerViewRole: (ownerViewRole) => set({ ownerViewRole }),
    }),
    { name: "ahwa.session.v2" }
  )
);
