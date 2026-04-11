'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BaseRole } from '@/lib/authz/policy';
import { writeRuntimeLastPath, writeRuntimeResumeToken } from '@/lib/runtime/resume-storage';

export type SessionUser = {
  id: string;
  cafeId: string;
  cafeName?: string;
  cafeSlug?: string;
  name: string;
  baseRole: BaseRole;
  ownerLabel?: 'owner' | 'partner' | 'branch_manager';
};

type SessionState = {
  user: SessionUser | null;
  ownerViewRole: 'supervisor' | 'waiter' | 'barista' | 'shisha' | 'american_waiter';
  lastPath: string | null;
  setUser: (user: SessionUser | null) => void;
  logout: () => Promise<void>;
  setOwnerViewRole: (role: SessionState['ownerViewRole']) => void;
  setLastPath: (path: string | null) => void;
};

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      user: null,
      ownerViewRole: 'supervisor',
      lastPath: null,
      setUser: (user) => set({ user }),
      logout: async () => {
        try {
          await fetch('/api/auth/logout', { method: 'POST' });
        } catch {
          // Best-effort server logout. Local auth state still must be cleared.
        }

        writeRuntimeResumeToken(null);
        writeRuntimeLastPath(null);
        set({ user: null, lastPath: null });
      },
      setOwnerViewRole: (ownerViewRole) => set({ ownerViewRole }),
      setLastPath: (lastPath) => set({ lastPath }),
    }),
    { name: 'ahwa.session.v2' },
  ),
);
