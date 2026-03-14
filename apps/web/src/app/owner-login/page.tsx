import { Suspense } from "react";
import OwnerLoginClient from "./OwnerLoginClient";

export const dynamic = "force-dynamic";

export default function OwnerLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-neutral-50" />}>
      <OwnerLoginClient />
    </Suspense>
  );
}
