"use client";

import { AuthzProvider } from "@/lib/authz";
import { OpsChromeProvider } from "@/lib/ops/chrome";
import { OpsPwaProvider } from '@/lib/pwa/provider';
import OfflineOpsBanner from '@/components/OfflineOpsBanner';
import { useEffect } from "react";
import { usePathname, useSearchParams } from 'next/navigation';
import { useSession, type SessionUser } from "@/lib/session";

export default function ClientProviders({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const setUser = useSession((s) => s.setUser);
  const setLastPath = useSession((s) => s.setLastPath);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    setUser(user);
  }, [user, setUser]);

  useEffect(() => {
    const query = searchParams.toString();
    setLastPath(`${pathname}${query ? `?${query}` : ''}`);
  }, [pathname, searchParams, setLastPath]);

  return (
    <AuthzProvider>
      <OpsChromeProvider>
        <OpsPwaProvider>
          <OfflineOpsBanner />
          {children}
        </OpsPwaProvider>
      </OpsChromeProvider>
    </AuthzProvider>
  );
}
