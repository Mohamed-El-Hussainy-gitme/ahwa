import { Suspense } from "react";
import OwnerLoginClient from "@/app/owner-login/OwnerLoginClient";

// `OwnerLoginClient` uses `useSearchParams()`. Next.js requires a Suspense
// boundary to avoid a prerender error during `next build`.
export const dynamic = "force-dynamic";

export default function PartnerLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-neutral-50" />}>
      <OwnerLoginClient />
    </Suspense>
  );
}
