"use client";

import { AuthzProvider } from "@/lib/authz";
import { useEffect } from "react";
import { useSession, type SessionUser } from "@/lib/session";

export default function ClientProviders({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const setUser = useSession((s) => s.setUser);

  useEffect(() => {
    setUser(user);
  }, [user, setUser]);

  return <AuthzProvider>{children}</AuthzProvider>;
}
