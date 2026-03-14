import { Suspense } from "react";
import LoginLandingClient from "./LoginLandingClient";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-neutral-50" />}> 
      <LoginLandingClient />
    </Suspense>
  );
}
